export const DEFAULT_SETUP_COMMAND_PALETTE_SHORTCUT = 'Ctrl+K';

const MODIFIER_ORDER = ['Ctrl', 'Alt', 'Shift'];

export function normalizeSetupCommandPaletteShortcut(value) {
  const raw = String(value || '').trim();
  const parts = raw.split('+').map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2 || parts.length > 4) return DEFAULT_SETUP_COMMAND_PALETTE_SHORTCUT;
  const key = parts.pop();
  const modifiers = new Set(parts.map((part) => part.toLowerCase()));
  if (!/^[a-z0-9]$/i.test(key) || !modifiers.has('ctrl') || modifiers.size !== parts.length) {
    return DEFAULT_SETUP_COMMAND_PALETTE_SHORTCUT;
  }
  const normalized = MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier.toLowerCase()));
  return [...normalized, key.toUpperCase()].join('+');
}

export function shortcutFromKeyboardEvent(event) {
  const key = String(event?.key || '').toUpperCase();
  if (!/^[A-Z0-9]$/.test(key)) return '';
  const modifiers = [];
  if (event.ctrlKey || event.metaKey) modifiers.push('Ctrl');
  if (event.altKey) modifiers.push('Alt');
  if (event.shiftKey) modifiers.push('Shift');
  return modifiers.length ? [...modifiers, key].join('+') : '';
}

export function isSetupCommandPaletteShortcut(event, shortcut) {
  if (!event || event.isComposing) return false;
  const target = normalizeSetupCommandPaletteShortcut(shortcut);
  const actual = shortcutFromKeyboardEvent(event);
  return actual === target;
}

export function normalizePaletteSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .trim();
}

export function filterSetupCommandPaletteEntries(entries, query, limit = 60) {
  const terms = normalizePaletteSearch(query).split(/\s+/).filter(Boolean);
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => ({
      ...entry,
      searchText: normalizePaletteSearch(`${entry.label || ''} ${entry.detail || ''}`),
      rankingText: normalizePaletteSearch(entry.searchLabel || entry.label || '')
    }))
    .filter((entry) => terms.every((term) => entry.searchText.includes(term)))
    .sort((a, b) => {
      const aOrder = Number.isFinite(a.order) ? a.order : Number.MAX_SAFE_INTEGER;
      const bOrder = Number.isFinite(b.order) ? b.order : Number.MAX_SAFE_INTEGER;
      const aStarts = terms.length && a.rankingText.startsWith(terms[0]) ? 0 : 1;
      const bStarts = terms.length && b.rankingText.startsWith(terms[0]) ? 0 : 1;
      return aOrder - bOrder || aStarts - bStarts || String(a.label).localeCompare(String(b.label), 'es');
    })
    .slice(0, limit);
}
