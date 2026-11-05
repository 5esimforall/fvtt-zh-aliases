import {buildGroupingCatalog, calculateGrouping, canonicalUuid, groupingDiff, GROUP_RULE_VERSION} from './identity.mjs';
import {identifySource, prepareSourceEnvironment} from './source-resolution.mjs';
import {emptyReview, readReview, validSnapshot} from './state.mjs';

export class CatalogError extends Error {
  constructor(code, message = code) { super(message); this.name = 'CatalogError'; this.code = code; this.source = 'truesight'; }
}
const stable = snapshot => JSON.stringify({
  records: Object.entries(snapshot.records).sort(([a], [b]) => a.localeCompare(b)),
  groups: Object.entries(snapshot.groups).sort(([a], [b]) => a.localeCompare(b))
});

/** Shared client review. Dependencies are injected so the algorithm can be
 * tested without Foundry, Quick Insert, a search panel or any name resolver. */
export class CatalogService {
  constructor({index, environment, load, save, notify = () => {}, legacy = () => null}) {
    Object.assign(this, {index, environment, save, notify, legacy});
    this.generation = 0;
    this.previews = new Map();
    this.waiters = new Set();
    this.serial = 0;
    try { this.state = readReview(load()); }
    catch (error) { this.state = emptyReview(); this.failure = new CatalogError('invalid-review', error.message); }
  }

  getStatus() {
    const meta = {apiVersion: 1, ruleVersion: GROUP_RULE_VERSION, revision: this.state.revision,
      generation: this.generation, scope: 'client-world-user', reviewed: Boolean(this.state.active),
      canUndo: Boolean(this.state.previous), includeRisk: this.state.active?.includeRisk === true};
    if (this.failure) return {...meta, status: 'failed', reason: this.failure.code, message: this.failure.message};
    try {
      const index = this.index();
      if (index.status !== 'ready') return {...meta, status: index.status, reason: index.reason};
      return {...meta, status: this.state.active ? 'ready' : 'unreviewed'};
    } catch (error) { return {...meta, status: 'failed', reason: 'index-error', message: String(error)}; }
  }

  assertReadable() {
    const status = this.getStatus();
    if (!['ready', 'unreviewed'].includes(status.status)) throw new CatalogError(status.reason ?? status.status, status.message ?? status.reason ?? status.status);
    return status;
  }

  whenReady({timeout = 60000} = {}) {
    const status = this.getStatus();
    if (['ready', 'unreviewed'].includes(status.status)) return Promise.resolve(status);
    if (status.status !== 'not-ready') return Promise.reject(new CatalogError(status.reason ?? status.status, status.message));
    return new Promise((resolve, reject) => {
      const check = () => {
        const next = this.getStatus();
        if (next.status === 'not-ready') return;
        clearTimeout(timer); this.waiters.delete(check);
        if (['ready', 'unreviewed'].includes(next.status)) resolve(next);
        else reject(new CatalogError(next.reason ?? next.status, next.message));
      };
      const timer = setTimeout(() => {
        this.waiters.delete(check);
        reject(new CatalogError('index-timeout', 'Quick Insert index did not become ready'));
      }, timeout);
      this.waiters.add(check);
    });
  }

  invalidate(reason = 'index') {
    this.generation++;
    for (const check of this.waiters) check();
    // Events contain no UUIDs, names, source evidence or cached members.
    this.notify({...this.getStatus(), reason});
  }

  current() {
    const status = this.assertReadable();
    const index = this.index();
    const environment = prepareSourceEnvironment(this.environment());
    const data = buildGroupingCatalog(index.results, environment, this.state.active, {excluded: this.state.excluded});
    return {status, results: index.results, environment, data};
  }

  read(uuids) {
    const {status, environment, data} = this.current();
    const wanted = uuids ? new Set(uuids.map(uuid => canonicalUuid(uuid))) : null;
    const entries = new Map(), groups = new Map();
    // Construct a public DTO, never return a Quick Insert item, document,
    // search-result wrapper or the underlying persisted snapshot.
    for (const entry of data.entries.values()) {
      if (wanted && !wanted.has(entry.uuid)) continue;
      const group = entry.key && this.state.active?.groups[entry.key];
      entries.set(entry.uuid, {
        uuid: entry.uuid, key: entry.key, type: entry.result.item.subType,
        kind: entry.kind, rules: entry.rules, warning: entry.warning, risk: entry.risk,
        status: entry.key ? 'member' : entry.warning === 'identity' ? 'invalidated'
          : entry.warning ? 'conflict' : this.state.active?.records[entry.uuid] ? 'independent' : 'pending',
        names: [...entry.names], tags: [...entry.tags], srd: entry.srd,
        reason: group?.reason ?? null,
        evidence: {identifier: entry.id, level: entry.level, school: entry.school,
          source: identifySource(entry.result.item, environment)}
      });
      if (entry.key && !groups.has(entry.key)) groups.set(entry.key, {
        key: entry.key, kind: entry.kind, rules: entry.rules, reason: group.reason,
        risk: entry.risk, members: data.groups.get(entry.key).map(member => member.uuid)
      });
    }
    // Callers may query visible non-indexed items. These stay independent;
    // absence is not an index/API failure and never implies an approved link.
    for (const uuid of wanted ?? []) if (!entries.has(uuid)) entries.set(uuid,
      {uuid, key: null, status: 'not-indexed', warning: null, reason: 'outside-index'});
    return structuredClone({...status, changed: data.changed, excludedCount: this.state.excluded.filter(id => data.entries.has(id)).length, entries, groups});
  }

  getMember(uuid) { return this.read([uuid]).entries.get(canonicalUuid(uuid)); }

  makeSnapshot({includeRisk = false, migration = null} = {}) {
    const {results, environment, data} = this.current();
    if (!migration) return calculateGrouping(results, environment, {excluded: this.state.excluded}, {includeRisk});
    const old = validSnapshot(migration.active);
    if (!old) throw new CatalogError('invalid-migration', 'No compatible Slow Insert review');
    const excluded = Array.isArray(migration.preferences?.excluded) ? migration.preferences.excluded : [];
    const valid = buildGroupingCatalog(results, environment, old, {excluded});
    const next = {version: 1, ruleVersion: GROUP_RULE_VERSION, createdAt: Date.now(), includeRisk: old.includeRisk === true, records: {}, groups: {}};
    for (const [key, members] of valid.groups) if (members.length > 1) next.groups[key] = {...old.groups[key], members: members.map(entry => entry.uuid).sort()};
    for (const entry of data.entries.values()) if (entry.spell) {
      const member = valid.entries.get(entry.uuid);
      const key = member.key && next.groups[member.key] ? member.key : null;
      next.records[entry.uuid] = {fingerprint: entry.fingerprint, nameFingerprint: key && next.groups[key].risk ? entry.nameFingerprint : null,
        key, warning: member.warning};
    }
    return next;
  }

  preview(options = {}) {
    const snapshot = this.makeSnapshot(options);
    const id = String(++this.serial);
    // Only a bounded set of open previews lives in memory.
    if (this.previews.size >= 8) this.previews.delete(this.previews.keys().next().value);
    this.previews.set(id, {snapshot, options: structuredClone(options), revision: this.state.revision});
    const names = new Map(this.index().results.map(({item}) => [canonicalUuid(item), item.name]));
    return {id, ...this.getStatus(), migration: Boolean(options.migration), diff: groupingDiff(this.state.active, snapshot),
      groups: Object.entries(snapshot.groups).map(([key, group]) => ({key, ...group, members: group.members.map(uuid => ({uuid, name: names.get(uuid)}))})),
      independent: Object.entries(snapshot.records).filter(([, record]) => !record.key)
        .map(([uuid, record]) => ({uuid, name: names.get(uuid), reason: record.warning ?? 'no-match'}))};
  }

  previewMigration() {
    const migration = this.legacy();
    if (!migration?.active) throw new CatalogError('no-legacy', 'No old Slow Insert review to import');
    return this.preview({migration});
  }

  async commit(active, excluded, previous = {active: this.state.active, excluded: this.state.excluded}, reason = 'review') {
    if (this.saving) throw new CatalogError('save-in-progress');
    this.saving = true;
    try {
      const permitted = new Set(this.index().results.map(({item}) => canonicalUuid(item)));
      const prune = snapshot => {
        if (!snapshot) return null;
        const result = structuredClone(snapshot);
        result.records = Object.fromEntries(Object.entries(result.records).filter(([id]) => permitted.has(id)));
        for (const [key, group] of Object.entries(result.groups)) {
          group.members = group.members.filter(id => permitted.has(id));
          if (group.members.length < 2) delete result.groups[key];
        }
        for (const record of Object.values(result.records)) if (record.key && !result.groups[record.key]) record.key = null;
        return result;
      };
      const next = readReview({schemaVersion: 1, revision: this.state.revision + 1, active: prune(active),
        excluded: excluded.filter(id => permitted.has(id)),
        previous: previous && {active: prune(previous.active), excluded: previous.excluded.filter(id => permitted.has(id))}});
      await this.save(structuredClone(next));
      this.state = next;
      this.previews.clear();
      this.invalidate(reason);
      return this.getStatus();
    } finally { this.saving = false; }
  }

  async apply(id) {
    this.assertReadable();
    const preview = this.previews.get(id);
    if (!preview || preview.revision !== this.state.revision || stable(this.makeSnapshot(preview.options)) !== stable(preview.snapshot)) {
      throw new CatalogError('preview-stale', 'The index or review changed; preview again');
    }
    const excluded = preview.options.migration ? (preview.options.migration.preferences?.excluded ?? []) : this.state.excluded;
    // Migration never retains inaccessible old UUIDs in new client storage.
    const permitted = new Set(this.index().results.map(({item}) => canonicalUuid(item)));
    return this.commit(preview.snapshot, excluded.filter(id => permitted.has(id)), undefined, 'apply');
  }

  async undo() {
    this.assertReadable();
    if (!this.state.previous) return this.getStatus();
    return this.commit(this.state.previous.active, this.state.previous.excluded, null, 'undo');
  }

  async exclude(uuid) {
    uuid = canonicalUuid(uuid);
    const current = this.read([uuid]).entries.get(uuid);
    if (!current?.key) throw new CatalogError('not-a-member');
    return this.commit(this.state.active, [...new Set([...this.state.excluded, uuid])], undefined, 'exclude');
  }

  async restoreExcluded() { this.assertReadable(); return this.commit(this.state.active, [], undefined, 'restore'); }
}
