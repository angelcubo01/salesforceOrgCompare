import { describe, it, expect } from 'vitest';
import {
  formatSfUserLabel,
  orgDisplayNameForUserLabel,
  resolveTelemetryOrgId,
  buildSfUserTelemetryFields,
  applyUserContextToEntry
} from '../shared/telemetryUserContext.js';

describe('formatSfUserLabel', () => {
  it('formatea Name (org) sin username', () => {
    expect(formatSfUserLabel('user@example.com', 'John Doe', 'Acme Corp')).toBe(
      'John Doe (Acme Corp)'
    );
    expect(formatSfUserLabel('ignored@x.com', 'Administrador de sistema', 'SILK Aplicaciones S.L.U')).toBe(
      'Administrador de sistema (SILK Aplicaciones S.L.U)'
    );
  });

  it('trunca labels largos', () => {
    const long = 'x'.repeat(300);
    expect(formatSfUserLabel(long, 'Name', 'Org').length).toBeLessThanOrEqual(200);
  });

  it('devuelve vacío sin name', () => {
    expect(formatSfUserLabel('user@x.com', '', 'Org')).toBe('');
  });
});

describe('resolveTelemetryOrgId', () => {
  const map = {
    left: { id: 'left', displayName: 'Left Org' },
    right: { id: 'right', displayName: 'Right Org' },
    first: { id: 'first', displayName: 'First Org' }
  };

  it('prioriza org derecha', () => {
    expect(
      resolveTelemetryOrgId({ rightOrgId: 'right', leftOrgId: 'left' }, map)
    ).toBe('right');
  });

  it('usa org izquierda si no hay derecha', () => {
    expect(resolveTelemetryOrgId({ leftOrgId: 'left' }, map)).toBe('left');
  });

  it('usa primera org guardada como fallback', () => {
    expect(resolveTelemetryOrgId({}, map)).toBe('left');
  });
});

describe('orgDisplayNameForUserLabel', () => {
  it('usa displayName de Salesforce', () => {
    expect(orgDisplayNameForUserLabel({ displayName: 'CaixaBank', label: 'UAT' })).toBe(
      'CaixaBank'
    );
  });
});

describe('buildSfUserTelemetryFields', () => {
  it('construye solo sfUserLabel (sin username)', () => {
    const fields = buildSfUserTelemetryFields({
      username: 'a@b.com',
      name: 'Alice',
      orgDisplayName: 'Org'
    });
    expect(fields).toEqual({ sfUserLabel: 'Alice (Org)' });
  });
});

describe('applyUserContextToEntry', () => {
  it('añade solo sfUserLabel al entry', () => {
    const out = applyUserContextToEntry(
      { kind: 'codeComparison' },
      { sfUserLabel: 'N (O)' }
    );
    expect(out.sfUserLabel).toBe('N (O)');
    expect(out.sfUsername).toBeUndefined();
  });
});
