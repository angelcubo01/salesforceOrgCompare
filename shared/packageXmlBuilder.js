/** Construcción de package.xml (compartido UI + tests). */

/**
 * @param {string} s
 */
export function escapeXmlText(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {Set<string> | null | undefined} set
 * @returns {string[]}
 */
export function memberLinesForSet(set) {
  if (!set || set.size === 0) return [];
  if (set.has('*')) {
    return ['        <members>*</members>'];
  }
  return Array.from(set)
    .sort((a, b) => a.localeCompare(b))
    .map((m) => `        <members>${escapeXmlText(m)}</members>`);
}

/**
 * @param {Map<string, Set<string>> | Record<string, Set<string>>} selectedByType
 * @param {string} [apiVersion]
 */
export function buildPackageXmlFromSelection(selectedByType, apiVersion = '60.0') {
  const ver = apiVersion || '60.0';
  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<Package xmlns="http://soap.sforce.com/2006/04/metadata">');

  const entries =
    selectedByType instanceof Map
      ? Array.from(selectedByType.entries())
      : Object.entries(selectedByType || {});

  const types = entries.map(([k]) => k).sort((a, b) => a.localeCompare(b));
  for (const typeName of types) {
    const set = selectedByType instanceof Map ? selectedByType.get(typeName) : selectedByType[typeName];
    const memberLines = memberLinesForSet(set);
    if (!memberLines.length) continue;
    lines.push('    <types>');
    for (const ml of memberLines) {
      lines.push(ml);
    }
    lines.push(`        <name>${escapeXmlText(typeName)}</name>`);
    lines.push('    </types>');
  }

  lines.push(`    <version>${escapeXmlText(ver)}</version>`);
  lines.push('</Package>');
  return lines.join('\n');
}

/** @deprecated alias */
export const escapeXml = escapeXmlText;
