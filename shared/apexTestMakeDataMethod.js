/**
 * Filas de `ApexTestResult` que corresponden a métodos anotados con `@TestSetup`.
 * El campo API `IsTestSetup` existe en ApexTestResult desde API 60+ (Summer '24).
 *
 * @param {Record<string, unknown> | null | undefined} row
 */
export function isTestSetupApexTestResult(row) {
  if (!row || typeof row !== 'object') return false;
  if (row.IsTestSetup === true) return true;
  if (row.IsTestSetup === 'true') return true;
  return false;
}
