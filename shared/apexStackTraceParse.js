/**
 * Parsea una línea de StackTrace de ApexTestResult (Salesforce).
 * Ej.: `Class.CC_MiTest.miMetodo: line 237, column 1`
 * @param {string} line
 * @returns {{ className: string, line: number } | null}
 */
export function parseApexStackFrameLine(line) {
  const s = String(line ?? '').trim();
  if (!s) return null;
  const m = s.match(/(?:^|\s)(?:at\s+)?Class\.(.+?):\s*line\s+(\d+)/i);
  if (!m) return null;
  const beforeLine = m[1].trim();
  const lineNum = parseInt(m[2], 10);
  if (!Number.isFinite(lineNum) || lineNum < 1) return null;
  const lastDot = beforeLine.lastIndexOf('.');
  const className = (lastDot >= 0 ? beforeLine.slice(0, lastDot) : beforeLine).trim();
  if (!className) return null;
  return { className, line: lineNum };
}

/**
 * Líneas del stack con clase y número de línea (una por frame Apex).
 * @param {string} stackText
 * @returns {Array<{ className: string, line: number, rawLine: string }>}
 */
export function parseApexStackTraceFrames(stackText) {
  const frames = [];
  for (const rawLine of String(stackText ?? '').split(/\r?\n/)) {
    const parsed = parseApexStackFrameLine(rawLine);
    if (parsed) frames.push({ ...parsed, rawLine: rawLine.trim() });
  }
  return frames;
}
