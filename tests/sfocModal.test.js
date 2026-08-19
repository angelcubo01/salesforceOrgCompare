import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  requiresTypedOrgConfirmation,
  resolveSfocOrgConfirmationContext
} from '../code/ui/sfocModal.js';

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
    expect(source).toContain("setAttribute('aria-modal', 'true')");
    expect(source).toContain("event.key !== 'Tab'");
    expect(source).toContain("event.key !== 'Escape'");
    expect(source).toContain('focusTarget.focus()');
  });
});

