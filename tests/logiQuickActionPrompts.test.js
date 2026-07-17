import { describe, expect, it, beforeEach } from 'vitest';
import { getDefaultQuickActionUserMessage, quickActionUserMessage } from '../shared/logi/apexLogAiContext.js';
import {
  createLogiCustomQuickAction,
  deleteLogiCustomQuickAction,
  getLogiCustomQuickActionsSnapshot,
  normalizeLogiQuickActionFullStore,
  normalizeLogiQuickActionPromptStore,
  resetLogiQuickActionPromptsForTests,
  saveLogiQuickActionPrompt,
  importLogiQuickActionPromptStore
} from '../shared/logi/logiQuickActionPrompts.js';

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
        formatVersion: 2,
        customActions: [{ id: 'custom_abc1234567', labels: { es: 'Mi acción', en: 'My action' } }],
        prompts: {
          es: { soql_dml: 'Custom SOQL', custom_abc1234567: 'Prompt custom' },
          en: {}
        }
      },
      { replace: true }
    );
    expect(imported.es.soql_dml).toBe('Custom SOQL');
    expect(imported.es.custom_abc1234567).toBe('Prompt custom');
    expect(getLogiCustomQuickActionsSnapshot()).toHaveLength(1);
  });

  it('creates and deletes custom quick actions', async () => {
    const created = await createLogiCustomQuickAction({
      labels: { es: 'Validaciones', en: 'Validations' },
      prompt: 'Revisa validaciones del log',
      lang: 'es'
    });
    expect(created.ok).toBe(true);
    const actions = getLogiCustomQuickActionsSnapshot();
    expect(actions).toHaveLength(1);
    expect(actions[0].labels.es).toBe('Validaciones');
    await deleteLogiCustomQuickAction(actions[0].id);
    expect(getLogiCustomQuickActionsSnapshot()).toHaveLength(0);
  });

  it('normalizes full store with custom actions', () => {
    const store = normalizeLogiQuickActionFullStore({
      customActions: [{ id: 'custom_deadbeef01', labels: { es: 'X', en: 'X' } }],
      prompts: { es: { custom_deadbeef01: 'Prompt' }, en: {} }
    });
    expect(store.customActions).toHaveLength(1);
    expect(store.prompts.es.custom_deadbeef01).toBe('Prompt');
  });
});
