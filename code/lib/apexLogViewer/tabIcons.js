/** @typedef {'text'|'tree'|'debug'|'timeline'|'soql'|'dml'} ApexLogTabId */

/** @type {Record<ApexLogTabId, string>} */
export const APEX_LOG_TAB_ICONS = {
  text: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8M8 9h2"/></svg>`,
  tree: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3v6"/><path d="M6 9h12"/><path d="M8 9v4"/><path d="M16 9v4"/><path d="M6 17h6"/><path d="M14 17h4"/></svg>`,
  debug: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 2v4"/><path d="M16 2v4"/><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M8 11h.01M12 11h.01M16 11h.01M8 15h8"/></svg>`,
  timeline: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 18h4V8H4z"/><path d="M10 18h4V5h-4z"/><path d="M16 18h4V12h-4z"/><path d="M3 20h18"/></svg>`,
  soql: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>`,
  dml: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3v18"/><path d="M5 8h14"/><path d="M7 12h10"/><path d="M9 16h6"/></svg>`
};
