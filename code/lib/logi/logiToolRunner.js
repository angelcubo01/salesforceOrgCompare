import {
  enrichLocalToolResult,
  fetchLogLines,
  fetchParsedSection,
  getHotspots,
  getStackAround,
  highlightLogLines,
  searchLog
} from '../../../shared/logi/apexLogAiContext.js';

/**
 * @param {string} name
 * @param {Record<string, unknown>} args
 * @param {{ raw: string, parsed: object, lang: 'es' | 'en' }} ctx
 * @returns {string}
 */
export function runLocalToolCall(name, args, ctx) {
  const { raw, parsed, lang } = ctx;
  let toolResult = '';

  if (name === 'fetch_log_lines') {
    const fetched = fetchLogLines(raw, args.start_line, args.end_line);
    toolResult = JSON.stringify(enrichLocalToolResult(name, fetched, lang));
  } else if (name === 'fetch_parsed_section') {
    toolResult = JSON.stringify(
      enrichLocalToolResult(name, fetchParsedSection(parsed, args.section), lang)
    );
  } else if (name === 'search_log') {
    toolResult = JSON.stringify(
      enrichLocalToolResult(
        name,
        searchLog(raw, args.query, {
          maxResults: args.max_results,
          caseSensitive: args.case_sensitive
        }),
        lang
      )
    );
  } else if (name === 'get_stack_around') {
    toolResult = JSON.stringify(
      enrichLocalToolResult(
        name,
        getStackAround(raw, parsed, args.line, { radius: args.radius, reason: args.reason }),
        lang
      )
    );
  } else if (name === 'get_hotspots') {
    toolResult = JSON.stringify(
      enrichLocalToolResult(name, getHotspots(parsed, { reason: args.reason }), lang)
    );
  } else if (name === 'highlight_log_lines') {
    const highlighted = highlightLogLines(args.start_line, args.end_line, args.reason);
    try {
      window.dispatchEvent(
        new CustomEvent('sfoc-logi-highlight-lines', {
          detail: {
            startLine: highlighted.start_line,
            endLine: highlighted.end_line
          }
        })
      );
    } catch {
      /* ignore */
    }
    toolResult = JSON.stringify(enrichLocalToolResult(name, highlighted, lang));
  } else {
    toolResult = JSON.stringify(
      enrichLocalToolResult(name, { error: 'unknown_tool', retryable: false }, lang)
    );
  }

  return toolResult;
}

/**
 * @param {object[]} localCalls
 * @param {{ raw: string, parsed: object, lang: 'es' | 'en' }} ctx
 * @returns {{ tc: object, name: string, args: Record<string, unknown>, toolResult: string }[]}
 */
export function executeLocalToolCalls(localCalls, ctx) {
  /** @type {{ tc: object, name: string, args: Record<string, unknown>, toolResult: string }[]} */
  const results = [];
  for (const tc of localCalls) {
    const name = tc?.function?.name;
    let args = {};
    try {
      args = JSON.parse(tc.function?.arguments || '{}');
    } catch {
      args = {};
    }
    const toolResult = runLocalToolCall(name, args, ctx);
    results.push({ tc, name, args, toolResult });
  }
  return results;
}
