import { describe, expect, it } from 'vitest';
import { SETUP_PALETTE_PAGES } from '../sfInject/content/setupPaletteCatalog.js';
import {
  DEFAULT_SETUP_COMMAND_PALETTE_SHORTCUT,
  filterSetupCommandPaletteEntries,
  isSetupCommandPaletteShortcut,
  normalizeSetupCommandPaletteShortcut
} from '../sfInject/content/setupCommandPaletteUtils.js';
import { normalizeSfInjectConfig } from '../sfInject/lib/settings.js';

describe('Setup command palette', () => {
  it('includes the full Lightning Setup catalog imported from the reference extension', () => {
    expect(SETUP_PALETTE_PAGES).toHaveLength(865);
    expect(SETUP_PALETTE_PAGES).toContainEqual({
      label: 'Security > Named Credentials', path: '/lightning/setup/NamedCredential/home'
    });
  });

  it('normalizes and matches the configured shortcut including Cmd on macOS', () => {
    expect(normalizeSetupCommandPaletteShortcut('shift + ctrl + p')).toBe('Ctrl+Shift+P');
    expect(normalizeSetupCommandPaletteShortcut('K')).toBe(DEFAULT_SETUP_COMMAND_PALETTE_SHORTCUT);
    expect(isSetupCommandPaletteShortcut({ key: 'p', ctrlKey: true, shiftKey: true }, 'Ctrl+Shift+P')).toBe(true);
    expect(isSetupCommandPaletteShortcut({ key: 'p', metaKey: true, shiftKey: true }, 'Ctrl+Shift+P')).toBe(true);
  });

  it('matches terms ignoring accents and prioritizes a label prefix', () => {
    const result = filterSetupCommandPaletteEntries([
      { label: 'Configuración de flujos', detail: 'A' },
      { label: 'Mis flujos', detail: 'Configuración' }
    ], 'configuracion');
    expect(result.map((item) => item.label)).toEqual(['Configuración de flujos', 'Mis flujos']);
  });

  it('keeps the palette opt-in and saves its shortcut preference', () => {
    const cfg = normalizeSfInjectConfig({
      enabled: true,
      integrations: { setupCommandPalette: true },
      prefs: { setupCommandPaletteShortcut: 'Ctrl+Shift+P' }
    });
    expect(cfg.integrations.setupCommandPalette).toBe(true);
    expect(cfg.prefs.setupCommandPaletteShortcut).toBe('Ctrl+Shift+P');
  });
});
