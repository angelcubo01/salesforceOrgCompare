/**
 * Lógica pura de las acciones por ejecución del hub de Apex Tests
 * (copiar fallos, tiempos por método, ficheros del ZIP de logs, pool de peticiones).
 * Sin DOM ni chrome.*: se puede probar en Node.
 */
import { apexTestResultRowFromSf, sanitizeApexTestsExportBaseName } from './apexTestsExportCore.js';
import { isTestSetupApexTestResult } from './apexTestMakeDataMethod.js';

/**
 * Ordena los métodos de una ejecución por tiempo (`ApexTestResult.RunTime`, en ms) y calcula
 * el reparto del tiempo acumulado. Las filas sin `RunTime` numérico no cuentan.
 *
 * El total es la suma de los métodos, no el tiempo de reloj: Salesforce ejecuta clases en paralelo.
 *
 * @param {unknown[]} rows filas `ApexTestResult` (tooling) con `ApexClass.Name`, `MethodName`, `RunTime`...
 * @param {{ limit?: number }} [opts]
 * @returns {{
 *   count: number,
 *   totalMs: number,
 *   truncated: boolean,
 *   top: {
 *     className: string, methodName: string, outcome: string,
 *     runTime: number, share: number, isTestSetup: boolean
 *   }[]
 * }}
 */
export function summarizeApexTestTimings(rows, { limit = 50 } = {}) {
  const timed = [];
  for (const raw of rows || []) {
    const ms = raw?.RunTime == null || raw.RunTime === '' ? NaN : Number(raw.RunTime);
    if (!Number.isFinite(ms) || ms < 0) continue;
    const row = apexTestResultRowFromSf(raw);
    if (!row.methodName) continue;
    timed.push({
      className: row.className,
      methodName: row.methodName,
      outcome: row.outcome,
      runTime: ms,
      isTestSetup: isTestSetupApexTestResult(raw)
    });
  }
  timed.sort(
    (a, b) =>
      b.runTime - a.runTime ||
      a.className.localeCompare(b.className) ||
      a.methodName.localeCompare(b.methodName)
  );
  const totalMs = timed.reduce((sum, row) => sum + row.runTime, 0);
  const cap = Math.max(1, limit | 0);
  const top = timed.slice(0, cap).map((row) => ({
    ...row,
    share: totalMs > 0 ? row.runTime / totalMs : 0
  }));
  return { count: timed.length, totalMs, truncated: timed.length > top.length, top };
}

/**
 * Duración legible: `850 ms`, `1.2 s`, `2 min 5 s`.
 * @param {number} ms
 * @param {string} [locale] separador decimal (`es-ES` → `1,2 s`)
 */
export function formatApexRunTime(ms, locale = 'en-GB') {
  if (ms == null || ms === '') return '—';
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return '—';
  if (Math.round(n) < 1000) return `${Math.round(n)} ms`;
  const tenths = Math.round(n / 100) / 10;
  if (tenths < 60) return `${tenths.toLocaleString(locale, { maximumFractionDigits: 1 })} s`;
  const totalSeconds = Math.round(n / 1000);
  return `${Math.floor(totalSeconds / 60)} min ${totalSeconds % 60} s`;
}

function indentLines(text) {
  return String(text)
    .split(/\r?\n/)
    .map((line) => `  ${line}`)
    .join('\n');
}

/**
 * Texto listo para pegar en un ticket o chat: `Clase.metodo (Outcome)` + mensaje + stack trace.
 * @param {unknown[]} failureRows filas `ApexTestResult` (tooling) con `ApexClass.Name`, `MethodName`...
 * @returns {{ text: string, count: number }}
 */
export function formatApexTestFailuresText(failureRows) {
  const blocks = [];
  for (const raw of failureRows || []) {
    const row = apexTestResultRowFromSf(raw);
    const name = [row.className, row.methodName].filter(Boolean).join('.');
    if (!name) continue;
    const lines = [row.outcome ? `${name} (${row.outcome})` : name];
    if (row.message) lines.push(indentLines(row.message));
    if (row.stackTrace) lines.push(indentLines(row.stackTrace));
    blocks.push(lines.join('\n'));
  }
  return { text: blocks.join('\n\n'), count: blocks.length };
}

function sanitizeLogEntryBase(logId) {
  const s = String(logId || '')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  return s || 'log';
}

/**
 * Entradas `{ name, data }` para el ZIP: `<ApexLogId>.log`, sin colisiones de nombre.
 * @param {{ logId: string, body: string }[]} logs
 */
export function buildApexLogZipEntries(logs) {
  const used = new Set();
  return (logs || []).map(({ logId, body }) => {
    const base = sanitizeLogEntryBase(logId);
    let name = `${base}.log`;
    for (let n = 2; used.has(name.toLowerCase()); n += 1) name = `${base}-${n}.log`;
    used.add(name.toLowerCase());
    return { name, data: String(body ?? '') };
  });
}

/**
 * @param {string} baseName normalmente la etiqueta del entorno o el Id del job
 * @param {Date} [now]
 */
export function apexTestLogsZipFileName(baseName, now = new Date()) {
  const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `apex-test-logs-${sanitizeApexTestsExportBaseName(baseName || 'run')}-${stamp}.zip`;
}

/**
 * Ejecuta `worker` sobre cada elemento con como máximo `limit` en paralelo, conservando el orden.
 * @template T, R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T, index: number) => Promise<R>} worker
 * @returns {Promise<R[]>}
 */
export async function mapWithConcurrency(items, limit, worker) {
  const list = Array.from(items || []);
  const results = new Array(list.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(Math.max(1, limit | 0), list.length) }, async () => {
    while (cursor < list.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(list[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}
