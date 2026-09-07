import { describe, expect, it } from 'vitest';
import {
  CLOCK_WARNING_THRESHOLD_MS,
  calculateSalesforceClockOffset,
  hasMeaningfulSalesforceClockOffset,
  isValidUtcRange,
  serverNowFromOffset,
  toUtcIsoFromLocalDateTime
} from '../shared/salesforceTime.js';
import { normalizeSalesforceIdKey } from '../shared/salesforceIds.js';

describe('hora de Salesforce', () => {
  it('compensa un equipo retrasado diez minutos', () => {
    const local = Date.parse('2025-01-01T10:00:00.000Z');
    const server = Date.parse('2025-01-01T10:10:00.000Z');
    const offset = calculateSalesforceClockOffset(server, local, local);
    expect(serverNowFromOffset(offset, local)).toBe(server);
    expect(hasMeaningfulSalesforceClockOffset(offset)).toBe(true);
  });

  it('marca solo desfases superiores a un minuto', () => {
    expect(hasMeaningfulSalesforceClockOffset(CLOCK_WARNING_THRESHOLD_MS)).toBe(false);
    expect(hasMeaningfulSalesforceClockOffset(-CLOCK_WARNING_THRESHOLD_MS - 1)).toBe(true);
  });

  it('convierte la fecha local a ISO UTC y valida rangos', () => {
    const since = toUtcIsoFromLocalDateTime('2025-01-01T09:00');
    const until = toUtcIsoFromLocalDateTime('2025-01-01T10:00');
    expect(since.endsWith('Z')).toBe(true);
    expect(isValidUtcRange(since, until)).toBe(true);
    expect(isValidUtcRange(until, since)).toBe(false);
  });
});

describe('normalización de Id Salesforce', () => {
  it('hace coincidir la versión de 15 caracteres con la de 18', () => {
    expect(normalizeSalesforceIdKey('005xx0000012345')).toBe('005xx0000012345');
    expect(normalizeSalesforceIdKey('005XX0000012345AAA')).toBe('005xx0000012345');
  });
});
