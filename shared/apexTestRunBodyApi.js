/**
 * Normaliza el cuerpo de `runTestsAsynchronous` antes de enviarlo a Salesforce.
 * `className` es solo UI cuando ya hay `classId`; sin `classId` debe conservarse para la API.
 */

/**
 * @param {unknown} body
 * @returns {unknown}
 */
export function sanitizeRunTestsBodyForApi(body) {
  if (!body || typeof body !== 'object') return body;
  const tests = body.tests;
  if (!Array.isArray(tests)) return body;
  return {
    ...body,
    tests: tests.map((te) => {
      if (!te || typeof te !== 'object') return te;
      const classId = te.classId != null ? String(te.classId).trim() : '';
      if (classId) {
        const { className: _omit, ...rest } = te;
        return { ...rest, classId };
      }
      return te;
    })
  };
}

/**
 * @param {unknown} body
 * @returns {string | null} Mensaje de error o null si es válido.
 */
export function validateRunTestsBodyForApi(body) {
  if (!body || typeof body !== 'object') return null;
  const tests = body.tests;
  if (!Array.isArray(tests) || !tests.length) return null;
  for (const te of tests) {
    if (!te || typeof te !== 'object') {
      return 'Each test entry must be an object with classId or className';
    }
    const classId = te.classId != null ? String(te.classId).trim() : '';
    const className = te.className != null ? String(te.className).trim() : '';
    if (!classId && !className) {
      return 'Each test entry needs classId or className';
    }
  }
  return null;
}
