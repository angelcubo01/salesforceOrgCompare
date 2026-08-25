import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  matchesSfocConfirmationText,
  requiresTypedOrgConfirmation,
  resolveSfocOrgConfirmationContext
} from '../code/ui/sfocModal.js';
import { setLang, t } from '../shared/i18n.js';

describe('sfoc modal safety', () => {
  it('distingue sandbox, producción y entorno desconocido sin depender del color', () => {
    const orgs = [
      { id: 'sandbox', alias: 'QA', isSandbox: true },
      { id: 'prod', alias: 'PROD', isSandbox: false },
      { id: 'unknown', alias: 'LEGACY' }
    ];
    expect(resolveSfocOrgConfirmationContext('sandbox', orgs).environment.productionLike).toBe(false);
    expect(resolveSfocOrgConfirmationContext('prod', orgs).environment.productionLike).toBe(true);
    expect(resolveSfocOrgConfirmationContext('unknown', orgs).environment.productionLike).toBe(true);
    expect(resolveSfocOrgConfirmationContext('prod', orgs).label).toBe('PROD');
  });

  it('exige escribir la org para escrituras en producción o entorno desconocido', () => {
    expect(requiresTypedOrgConfirmation(true, 'write')).toBe(false);
    expect(requiresTypedOrgConfirmation(false, 'write')).toBe(true);
    expect(requiresTypedOrgConfirmation(undefined, 'destructive')).toBe(true);
    expect(requiresTypedOrgConfirmation(false, 'read')).toBe(false);
  });

  it('implementa dialog accesible, focus trap, Escape y restauración', async () => {
    const source = await readFile(new URL('../code/ui/sfocModal.js', import.meta.url), 'utf8');
    const focusSource = await readFile(new URL('../shared/dialogFocus.js', import.meta.url), 'utf8');
    expect(source).toContain("setAttribute('aria-modal', 'true')");
    expect(source).toContain('activateDialogFocus(dialog');
    expect(focusSource).toContain("event.key !== 'Tab'");
    expect(source).toContain("event.key === 'Escape' && entry.escapeSafe");
    expect(source).toContain('focusTarget.focus()');
  });

  it('usa CONFIRMO o CONFIRM en vez del nombre de la empresa', async () => {
    setLang('es');
    expect(t('modal.confirmationWord')).toBe('CONFIRMO');
    expect(matchesSfocConfirmationText(' confirmo ', t('modal.confirmationWord'))).toBe(true);
    expect(matchesSfocConfirmationText('CaixaBank', t('modal.confirmationWord'))).toBe(false);

    setLang('en');
    expect(t('modal.confirmationWord')).toBe('CONFIRM');
    expect(matchesSfocConfirmationText('confirm', t('modal.confirmationWord'))).toBe(true);

    const source = await readFile(new URL('../code/ui/sfocModal.js', import.meta.url), 'utf8');
    expect(source).toContain("const confirmationWord = t('modal.confirmationWord')");
    expect(source).toContain('requiredText: needsTypedConfirmation ? confirmationWord : undefined');
    expect(source).not.toContain('requiredText: needsTypedConfirmation ? context.label : undefined');
  });
});
