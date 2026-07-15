import { describe, expect, it, beforeEach } from 'vitest';
import { getDefaultQuickActionUserMessage, quickActionUserMessage } from '../shared/apexLogAiContext.js';
import {
  normalizeLogiQuickActionPromptStore,
  resetLogiQuickActionPromptsForTests,
  saveLogiQuickActionPrompt,
  importLogiQuickActionPromptStore
} from '../shared/logiQuickActionPrompts.js';

describe('quickActionUserMessage', () => {
  it('returns default prompt when no custom store', () => {
    const def = getDefaultQuickActionUserMessage('debug_errors', 'es');
    expect(quickActionUserMessage('debug_errors', 'es')).toBe(def);
  });

  it('uses custom prompt when provided', () => {
    const custom = { es: { debug_errors: 'Mi prompt personalizado' }, en: {} };
    expect(quickActionUserMessage('debug_errors', 'es', custom)).toBe('Mi prompt personalizado');
  });
});

describe('logiQuickActionPrompts storage', () => {
  beforeEach(() => {
    resetLogiQuickActionPromptsForTests();
  });

  it('normalizes invalid action ids', () => {
    const store = normalizeLogiQuickActionPromptStore({
      es: { debug_errors: ' ok ', invalid: 'x' },
      en: {}
    });
    expect(store.es.debug_errors).toBe('ok');
    expect(store.es.invalid).toBeUndefined();
  });

  it('saves and clears custom prompts', async () => {
    await saveLogiQuickActionPrompt('limits', 'es', 'Revisa límites custom');
    const afterSave = await saveLogiQuickActionPrompt('limits', 'es', null);
    expect(afterSave.es.limits).toBeUndefined();
  });

  it('imports wrapped export payload', async () => {
    const imported = await importLogiQuickActionPromptStore(
      {
        formatVersion: 1,
        prompts: { es: { soql_dml: 'Custom SOQL' }, en: {} }
      },
      { replace: true }
    );
    expect(imported.es.soql_dml).toBe('Custom SOQL');
  });
});
