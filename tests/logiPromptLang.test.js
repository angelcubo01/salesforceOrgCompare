import { describe, expect, it } from 'vitest';
import {
  inferLangFromPriorMessages,
  resolveLogiPromptLang
} from '../shared/logi/logiPromptLang.js';

describe('resolveLogiPromptLang', () => {
  it('uses Logi settings when there is no prior conversation', () => {
    expect(resolveLogiPromptLang({ settingsLang: 'fr' })).toBe('fr');
    expect(resolveLogiPromptLang({ settingsLang: 'en', messages: [] })).toBe('en');
  });

  it('prefers prior user messages over settings', () => {
    expect(
      resolveLogiPromptLang({
        settingsLang: 'es',
        messages: [{ role: 'user', content: 'Please analyze this error and explain the root cause.' }]
      })
    ).toBe('en');
  });

  it('ignores tool-only history', () => {
    expect(
      inferLangFromPriorMessages([{ role: 'tool', content: '{"ok":true}' }])
    ).toBeNull();
  });
});
