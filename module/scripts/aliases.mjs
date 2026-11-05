// Keep every candidate until conflicts have been resolved, even if only one
// candidate currently has a CPR automation.
export function registerAliases(pairs, nativeNames, renamedItems) {
  const evidence = new Map();
  function record(displayName, englishName, source) {
    if (!evidence.has(displayName)) evidence.set(displayName, new Map());
    const candidates = evidence.get(displayName);
    if (!candidates.has(englishName)) candidates.set(englishName, new Set());
    candidates.get(englishName).add(source);
  }
  for (const { translatedName, englishName, source } of pairs) {
    record(translatedName, englishName, source);
    if (!englishName) continue;
    const suffix = ' ' + englishName;
    // Some dictionaries already contain the full bilingual spelling.
    if (translatedName.endsWith(suffix)) {
      record(translatedName.slice(0, -suffix.length), englishName, source);
    } else {
      record(translatedName + suffix, englishName, source);
    }
  }

  const report = { status: 'ready', registered: 0, existing: 0, unsupported: 0, conflicts: [] };
  for (const [displayName, candidates] of evidence) {
    if (candidates.size > 1 || candidates.has(null)) {
      report.conflicts.push({
        displayName,
        reason: candidates.has(null) ? 'unknown-original' : 'ambiguous-name',
        candidates: Array.from(candidates, ([englishName, sources]) => ({englishName, sources: [...sources]}))
      });
      continue;
    }
    if (displayName in renamedItems || nativeNames.has(displayName)) {
      report.existing++;
      continue;
    }
    const [englishName] = candidates.keys();
    // CPR reads renamedItems only once; follow the same one hop an English
    // item would take (not an arbitrary chain of renames).
    const lookupName = Object.hasOwn(renamedItems, englishName) ? renamedItems[englishName] : englishName;
    if (typeof lookupName !== 'string' || !nativeNames.has(lookupName)) {
      report.unsupported++;
      continue;
    }
    renamedItems[displayName] = lookupName;
    report.registered++;
  }
  return report;
}
