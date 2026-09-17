import { describe, expect, it } from 'vitest';
import {
  CLOCK_WARNING_THRESHOLD_MS,
  calculateSalesforceClockOffset,
  hasMeaningfulSalesforceClockOffset,
  isValidUtcRange,
  serverNowFromOffset,
  toUtcIsoFromLocalDateTime,
  formatDateTimeForDisplay
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

  it('interpreta de forma estricta el formato elegido y no intercambia día y mes', () => {
    expect(toUtcIsoFromLocalDateTime('13/09/2026 14:20', 'dmy')).toBeTruthy();
    expect(toUtcIsoFromLocalDateTime('09/13/2026 14:20', 'mdy')).toBeTruthy();
    expect(toUtcIsoFromLocalDateTime('13/09/2026 14:20', 'mdy')).toBe('');
    expect(toUtcIsoFromLocalDateTime('31/02/2026 14:20', 'dmy')).toBe('');
  });

  it('muestra las fechas con DD/MM/AAAA por defecto', () => {
    expect(formatDateTimeForDisplay('2026-09-13T14:20:00.000Z')).toMatch(/^13\/09\/2026 /);
  });
});

describe('normalización de Id Salesforce', () => {
  it('hace coincidir la versión de 15 caracteres con la de 18', () => {
    expect(normalizeSalesforceIdKey('005xx0000012345')).toBe('005xx0000012345');
    expect(normalizeSalesforceIdKey('005XX0000012345AAA')).toBe('005xx0000012345');
  });
});
