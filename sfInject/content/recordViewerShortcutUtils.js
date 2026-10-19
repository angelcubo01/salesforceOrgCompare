export const DEFAULT_RECORD_VIEWER_SHORTCUT = 'Ctrl+Shift+E';

const MODIFIER_ORDER = ['Ctrl', 'Alt', 'Shift'];

export function normalizeRecordViewerShortcut(value) {
  const parts = String(value || '').trim().split('+').map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2 || parts.length > 4) return DEFAULT_RECORD_VIEWER_SHORTCUT;
  const key = String(parts.pop() || '').toUpperCase();
  const modifiers = new Set(parts.map((part) => part.toLowerCase()));
  if (!/^[A-Z0-9]$/.test(key) || !modifiers.has('ctrl') || modifiers.size !== parts.length) return DEFAULT_RECORD_VIEWER_SHORTCUT;
  return [...MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier.toLowerCase())), key].join('+');
}

export function recordViewerShortcutFromKeyboardEvent(event) {
  const key = String(event?.key || '').toUpperCase();
  if (!/^[A-Z0-9]$/.test(key)) return '';
  const modifiers = [];
  if (event.ctrlKey || event.metaKey) modifiers.push('Ctrl');
  if (event.altKey) modifiers.push('Alt');
  if (event.shiftKey) modifiers.push('Shift');
  return modifiers.length ? [...modifiers, key].join('+') : '';
}
