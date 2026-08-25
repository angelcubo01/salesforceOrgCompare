import { describe, expect, it, vi } from 'vitest';
import {
  SFOC_UI_MODE_STORAGE_KEY,
  applyUiModeToDocument,
  loadUiMode,
  normalizeUiMode,
  saveUiMode
} from '../shared/uiMode.js';

describe('uiMode', () => {
  it('usa classic como default y solo acepta v2 de forma explícita', () => {
    expect(normalizeUiMode()).toBe('classic');
    expect(normalizeUiMode('classic')).toBe('classic');
    expect(normalizeUiMode('future')).toBe('classic');
    expect(normalizeUiMode('v2')).toBe('v2');
  });

  it('lee y guarda únicamente en el storage recibido', async () => {
    const storage = {
      get: vi.fn(async () => ({ [SFOC_UI_MODE_STORAGE_KEY]: 'v2' })),
      set: vi.fn(async () => {})
    };
    expect(await loadUiMode(storage)).toBe('v2');
    expect(await saveUiMode('classic', storage)).toBe('classic');
    expect(storage.set).toHaveBeenCalledWith({ [SFOC_UI_MODE_STORAGE_KEY]: 'classic' });
  });

  it('aplica el modo al documento sin recargarlo', () => {
    const doc = { documentElement: { dataset: {} }, body: { dataset: {} } };
    expect(applyUiModeToDocument(doc, 'v2')).toBe('v2');
    expect(doc.documentElement.dataset.uiMode).toBe('v2');
    expect(doc.body.dataset.uiMode).toBe('v2');
  });
});
