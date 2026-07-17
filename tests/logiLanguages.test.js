import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOGI_LANGUAGE,
  formatLogiLanguageLabel,
  getLogiLanguageOption,
  LOGI_LANGUAGES,
  normalizeLogiLanguage
} from '../shared/logi/logiLanguages.js';
import { normalizeLogiUserSettings } from '../shared/logi/logiUserSettings.js';
import { buildLogiSystemPrompt, buildLogiSummarySystemPrompt } from '../background/logi/apexLogAiAdvisor.js';

describe('logiLanguages', () => {
  it('lists 15 main languages and defaults to English', () => {
    expect(LOGI_LANGUAGES).toHaveLength(15);
    expect(DEFAULT_LOGI_LANGUAGE).toBe('en');
    expect(normalizeLogiLanguage(undefined)).toBe('en');
    expect(normalizeLogiLanguage('')).toBe('en');
    expect(normalizeLogiLanguage('es-ES')).toBe('es');
    expect(normalizeLogiLanguage('pt_BR')).toBe('pt');
    expect(normalizeLogiLanguage('xx')).toBe('en');
  });

  it('formats labels and resolves options', () => {
    const es = getLogiLanguageOption('es');
    expect(es.nativeName).toBe('Español');
    expect(formatLogiLanguageLabel(es)).toContain('Español');
    expect(formatLogiLanguageLabel(getLogiLanguageOption('en'))).toBe('English');
  });
});

describe('logiUserSettings language', () => {
  it('defaults logiLanguage to en and normalizes values', () => {
    expect(normalizeLogiUserSettings({}).logiLanguage).toBe('en');
    expect(normalizeLogiUserSettings({ logiLanguage: 'fr' }).logiLanguage).toBe('fr');
    expect(normalizeLogiUserSettings({ logiLanguage: 'nope' }).logiLanguage).toBe('en');
  });
});

describe('Logi system prompts language', () => {
  const config = { personaName: 'Logi' };

  it('embeds preferred language in chat and summary prompts', () => {
    const chatEs = buildLogiSystemPrompt('es', config, false);
    expect(chatEs).toMatch(/Spanish \(Español\)/);
    expect(chatEs).toMatch(/code=es/);
    expect(chatEs).toMatch(/If the user writes in a different language/);
    expect(chatEs).toMatch(/Formatting \(Markdown/);
    expect(chatEs).toMatch(/GFM tables/);

    const summaryJa = buildLogiSummarySystemPrompt('ja', config);
    expect(summaryJa).toMatch(/Japanese \(日本語\)/);
    expect(summaryJa).toMatch(/code=ja/);
    expect(summaryJa).toMatch(/Hard avoid/);
    expect(summaryJa).toMatch(/hasError/);
    expect(chatEs).toMatch(/Never name internal tools/);
    expect(chatEs).toMatch(/natural language/);
    expect(summaryJa).toMatch(/CRITICAL — reply language/);
    expect(summaryJa).toMatch(/Do not switch to English/);
    expect(summaryJa).toMatch(/Never name internal tools/);
  });
});
