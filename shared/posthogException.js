/**
 * Propiedades $exception para Capture API (service worker).
 * En páginas con posthog-js usar siempre posthog.captureException().
 */

const STACK_LINE_RE = /^\s*at\s+(?:(.+?)\s+\()?(?:(.+?):(\d+):(\d+)|\s*(.+))\)?$/;

/**
 * @param {string | undefined} stack
 * @returns {Array<Record<string, string | number | boolean>>}
 */
export function parseJavascriptStackFrames(stack) {
  if (!stack || typeof stack !== 'string') {
    return [
      {
        platform: 'custom',
        lang: 'javascript',
        function: 'unknown',
        in_app: true
      }
    ];
  }

  /** @type {Array<Record<string, string | number | boolean>>} */
  const frames = [];
  for (const line of stack.split('\n').slice(1, 40)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = STACK_LINE_RE.exec(trimmed);
    if (m) {
      frames.push({
        platform: 'custom',
        lang: 'javascript',
        function: String(m[1] || m[5] || 'anonymous').slice(0, 256),
        filename: String(m[2] || '').slice(0, 420),
        lineno: Number(m[3]) || 0,
        colno: Number(m[4]) || 0,
        in_app: true
      });
      continue;
    }
    frames.push({
      platform: 'custom',
      lang: 'javascript',
      function: trimmed.slice(0, 256),
      in_app: true
    });
  }

  return frames.length
    ? frames
    : [
        {
          platform: 'custom',
          lang: 'javascript',
          function: 'unknown',
          in_app: true
        }
      ];
}

/**
 * @param {unknown} error
 * @param {{ handled?: boolean }} [opts]
 */
/**
 * Fingerprint estable para agrupar issues en PostHog Error tracking.
 * @param {Error} err
 */
export function buildPosthogExceptionFingerprint(err) {
  const type = String(err.name || 'Error').slice(0, 128);
  const msg = String(err.message || 'unknown').slice(0, 200);
  const frames = parseJavascriptStackFrames(err.stack);
  const top = frames[0];
  const loc = top?.filename
    ? `${top.filename}:${top.lineno || 0}`
    : '';
  return [type, msg, loc].filter(Boolean).join('|').slice(0, 256);
}

export function buildPosthogExceptionList(error, opts = {}) {
  const err = error instanceof Error ? error : new Error(String(error ?? 'unknown'));
  const handled = opts.handled === true;
  return [
    {
      type: String(err.name || 'Error').slice(0, 128),
      value: String(err.message || 'unknown').slice(0, 2000),
      mechanism: {
        handled,
        synthetic: false
      },
      stacktrace: {
        type: 'raw',
        frames: parseJavascriptStackFrames(err.stack)
      }
    }
  ];
}
