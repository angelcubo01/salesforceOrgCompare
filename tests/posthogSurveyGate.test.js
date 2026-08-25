import { describe, expect, it, vi } from 'vitest';
import {
  POSTHOG_SURVEY_HOST_SELECTOR,
  isPosthogSurveyPopupOpen,
  waitForPosthogSurveyPopupToClose
} from '../code/ui/posthogSurveyGate.js';

function popup({ hidden = false, ariaHidden = null, classHidden = false } = {}) {
  return {
    hidden,
    getAttribute: (name) => (name === 'aria-hidden' ? ariaHidden : null),
    classList: { contains: (name) => name === 'hidden' && classHidden }
  };
}

describe('posthogSurveyGate', () => {
  it('detecta solo hosts visibles de encuestas PostHog', () => {
    expect(POSTHOG_SURVEY_HOST_SELECTOR).toContain('PostHogSurvey-');
    expect(isPosthogSurveyPopupOpen({ querySelector: () => null })).toBe(false);
    expect(isPosthogSurveyPopupOpen({ querySelector: () => popup() })).toBe(true);
    expect(isPosthogSurveyPopupOpen({ querySelector: () => popup({ hidden: true }) })).toBe(false);
    expect(isPosthogSurveyPopupOpen({ querySelector: () => popup({ ariaHidden: 'true' }) })).toBe(false);
  });

  it('continua inmediatamente cuando no hay popup', async () => {
    await expect(waitForPosthogSurveyPopupToClose({ querySelector: () => null }, null))
      .resolves.toBeUndefined();
  });

  it('espera hasta que el host de PostHog desaparece', async () => {
    let currentPopup = popup();
    let mutationCallback = null;
    const disconnect = vi.fn();
    class FakeMutationObserver {
      constructor(callback) { mutationCallback = callback; }
      observe() {}
      disconnect() { disconnect(); }
    }
    const doc = {
      documentElement: {},
      querySelector: () => currentPopup
    };
    const onContinue = vi.fn();
    const waiting = waitForPosthogSurveyPopupToClose(doc, FakeMutationObserver).then(onContinue);

    await Promise.resolve();
    expect(onContinue).not.toHaveBeenCalled();

    currentPopup = null;
    mutationCallback();
    await waiting;
    expect(disconnect).toHaveBeenCalledOnce();
    expect(onContinue).toHaveBeenCalledOnce();
  });
});
