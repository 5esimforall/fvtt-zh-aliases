import {catalog} from './catalog/api.mjs';

const t = (key, data = {}) => game.i18n.localize(`TRUESIGHT.${key}`).replace(/\{([^}]+)\}/g, (token, name) => Object.hasOwn(data, name) ? String(data[name]) : token);
const node = (tag, text) => { const el = document.createElement(tag); if (text) el.textContent = text; return el; };

export function reviewWindowClass() {
  return class ReviewWindow extends foundry.applications.api.ApplicationV2 {
    static DEFAULT_OPTIONS = {classes: ['truesight-review'], window: {title: 'TRUESIGHT.Menu.Name', resizable: true, minimizable: true}, position: {width: 640, height: 640}};
    constructor(options = {}) { super({...options, window: {...options.window, title: t('Menu.Name')}}); this.migration = options.migration === true; }
    async _renderHTML() {
      const root = node('div'), status = node('p'), error = node('p'); error.setAttribute('role', 'alert');
      const hint = node('p', t('Menu.Hint')), controls = node('div'), list = node('div');
      const button = (key, action) => {
        const el = node('button', t(key)); el.type = 'button';
        el.onclick = async () => {
          if (this.busy) return;
          this.busy = true; el.disabled = true; error.textContent = '';
          try { await action(); } catch (cause) { error.textContent = t('Grouping.Error', {message: cause.message}); }
          finally { this.busy = false; el.disabled = false; updateActions(); }
        };
        return el;
      };
      const risk = node('input'); risk.type = 'checkbox'; risk.checked = catalog.getStatus().includeRisk;
      const label = node('label'); label.append(risk, document.createTextNode(t('Grouping.IncludeRisk')));
      const search = node('input'); search.type = 'search'; search.placeholder = t('Grouping.Find'); search.setAttribute('aria-label', t('Grouping.Find'));
      search.oninput = () => { for (const section of list.children) section.hidden = !section.textContent.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase()); };
      const summary = node('p');
      const show = preview => {
        this.preview = preview;
        status.textContent = t('Grouping.Revision', {...preview, status: t(`Status.${preview.status}`)});
        summary.textContent = t('Grouping.Diff', preview.diff);
        hint.textContent = t(preview.migration ? 'Grouping.MigrationHint' : 'Grouping.PreviewHint');
        list.replaceChildren(); search.value = '';
        for (const group of preview.groups) {
          const section = node('details');
          section.append(node('summary', `${group.risk ? '⚠ ' : ''}${group.members[0].name} (${group.members.length}) · ${group.rules} — ${t(`Grouping.Reason.${group.reason}`)}`));
          for (const member of group.members) section.append(node('p', `${member.name} — ${member.uuid}`));
          list.append(section);
        }
        const separate = node('details'); separate.append(node('summary', t('Grouping.Independent', {count: preview.independent.length})));
        for (const member of preview.independent) separate.append(node('p', `${member.name} — ${t(`Grouping.Review.${member.reason}`)}`));
        list.append(separate); apply.disabled = false;
      };
      const recalculate = async () => { await catalog.whenReady(); show(catalog.preview({includeRisk: risk.checked})); };
      const migrate = async () => { await catalog.whenReady(); show(catalog.previewMigration()); };
      const apply = button('Grouping.Apply', async () => {
        if (!this.preview) return;
        await catalog.apply(this.preview.id); this.preview = null;
        status.textContent = t('Grouping.Current'); list.replaceChildren(); summary.textContent = ''; apply.hidden = true;
      }); apply.disabled = true;
      const previewButton = button('Grouping.Rebuild', async () => { apply.hidden = false; await recalculate(); });
      const migrationButton = button('Grouping.Migrate', async () => { apply.hidden = false; await migrate(); });
      const undo = button('Grouping.Undo', async () => { await catalog.undo(); this.preview = null; apply.disabled = true; list.replaceChildren(); summary.textContent = ''; });
      const restore = button('Grouping.RestoreExcluded', async () => { await catalog.restoreExcluded(); await recalculate(); });
      const updateActions = () => {
        const current = catalog.getStatus();
        undo.disabled = !current.canUndo;
        try { restore.disabled = !catalog.read().excludedCount; } catch { restore.disabled = true; }
      };
      risk.onchange = () => { this.preview = null; apply.disabled = true; };
      controls.append(previewButton, migrationButton, undo, restore);
      root.append(hint, status, controls, label, summary, search, list, error, apply);
      const current = catalog.getStatus();
      status.textContent = t('Grouping.Revision', {...current, status: t(`Status.${current.status}`)});
      updateActions();
      if (this.reviewHook) Hooks.off('truesightChanged', this.reviewHook);
      this.reviewHook = Hooks.on('truesightChanged', change => {
        this.preview = null; apply.disabled = true; list.replaceChildren(); summary.textContent = '';
        status.textContent = t('Grouping.Revision', {...change, status: t(`Status.${change.status}`)});
        updateActions();
      });
      if (this.migration) {
        this.migration = false;
        try { await migrate(); } catch (cause) { error.textContent = t('Grouping.Error', {message: cause.message}); }
      } else if (['ready', 'unreviewed'].includes(catalog.getStatus().status)) {
        try { show(catalog.preview({includeRisk: risk.checked})); }
        catch (cause) { error.textContent = t('Grouping.Error', {message: cause.message}); }
      }
      return root;
    }
    _replaceHTML(content, host) { host.replaceChildren(content); }
    _onClose(options) { Hooks.off('truesightChanged', this.reviewHook); this.reviewHook = null; super._onClose(options); }
  };
}
