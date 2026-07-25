import { describe, it, expect, beforeEach } from 'vitest';
import {
  findDebugLogsSectionRow,
  findUserTraceFlagsSectionRow,
  isApexDebugLogsSetupDocument,
  isDebugLogsAboveUserTraceFlags,
  reorderDebugLogsAboveUserTraceFlags
} from '../sfInject/content/injectors/debugLogsTableOrderDom.js';

/** @typedef {{ tagName: string, id?: string, parentElement: El | null, children: El[], attrs?: Record<string, string> }} El */

const DOCUMENT_POSITION_FOLLOWING = 4;

/**
 * @param {string} tagName
 * @param {Partial<El> & { id?: string }} init
 * @returns {El}
 */
function el(tagName, init = {}) {
  const node = {
    tagName: tagName.toUpperCase(),
    id: init.id,
    parentElement: init.parentElement ?? null,
    children: init.children ?? [],
    attrs: init.attrs ?? {},
    textContent: init.textContent ?? ''
  };
  for (const child of node.children) child.parentElement = node;
  return node;
}

/**
 * @param {El} root
 * @returns {Document}
 */
function createMockDocument(root) {
  /** @type {Map<string, El>} */
  const byId = new Map();

  function walk(node) {
    if (node.id) byId.set(node.id, node);
    for (const child of node.children) walk(child);
  }
  walk(root);

  function queryAll(node, selector) {
    const out = [];
    function visit(n) {
      if (selector.includes('h2.mainTitle') && n.tagName === 'H2') out.push(n);
      if (selector.includes('tbody > tr') && n.tagName === 'TR' && n.parentElement?.tagName === 'TBODY') {
        out.push(n);
      }
      if (selector.startsWith('[id="') && n.id === selector.slice(5, -2)) out.push(n);
      for (const child of n.children) visit(child);
    }
    visit(node);
    return out;
  }

  function enhance(node) {
    node.querySelector = (sel) => queryAll(node, sel)[0] || null;
    node.querySelectorAll = (sel) => queryAll(node, sel);
    node.closest = function closest(tag) {
      let n = this;
      const wanted = String(tag).toUpperCase();
      while (n) {
        if (n.tagName === wanted) return n;
        n = n.parentElement;
      }
      return null;
    };
    node.compareDocumentPosition = function compareDocumentPosition(other) {
      const order = flatten(root);
      const a = order.indexOf(this);
      const b = order.indexOf(other);
      if (a < 0 || b < 0) return 0;
      return a < b ? DOCUMENT_POSITION_FOLLOWING : 0;
    };
    node.insertBefore = function insertBefore(child, before) {
      const idx = this.children.indexOf(before);
      if (idx === -1) throw new Error('before not found');
      const prevIdx = this.children.indexOf(child);
      if (prevIdx !== -1) this.children.splice(prevIdx, 1);
      this.children.splice(idx, 0, child);
      child.parentElement = this;
    };
    node.appendChild = function appendChild(child) {
      this.children.push(child);
      child.parentElement = this;
    };
    node.previousElementSibling = null;
    node.nextElementSibling = null;
    node.textContent =
      node.children.length > 0
        ? node.children.map((c) => c.textContent || '').join('')
        : node.textContent || '';
    node.setAttribute = function setAttribute(name, value) {
      this.attrs[name] = value;
    };
    for (const child of node.children) enhance(child);
  }

  function flatten(node) {
    const out = [node];
    for (const child of node.children) out.push(...flatten(child));
    return out;
  }

  function linkSiblings(parent) {
    for (let i = 0; i < parent.children.length; i++) {
      parent.children[i].previousElementSibling = i > 0 ? parent.children[i - 1] : null;
      parent.children[i].nextElementSibling =
        i < parent.children.length - 1 ? parent.children[i + 1] : null;
      linkSiblings(parent.children[i]);
    }
  }

  enhance(root);
  linkSiblings(root);

  const html = el('HTML', {
    children: [el('BODY', { children: [root] })]
  });
  enhance(html);
  html.children[0].parentElement = html;

  const doc = {
    body: html.children[0],
    documentElement: html,
    getElementById(id) {
      return byId.get(id) || null;
    },
    querySelector(sel) {
      return queryAll(html, sel)[0] || null;
    },
    querySelectorAll(sel) {
      return queryAll(html, sel);
    }
  };

  return /** @type {Document} */ (doc);
}

function buildPage() {
  const pagination = el('SPAN', { id: 'Apex_Trace_List:traceForm:traceTableNextPrev' });
  const debugTitle = el('H2', {
    attrs: { class: 'mainTitle' },
    children: [el('TEXT', { textContent: 'Debug Logs' })]
  });
  const traceTable = el('DIV', { id: 'Apex_Trace_List:traceForm:traceTable', children: [debugTitle] });
  const traceForm = el('FORM', {
    id: 'Apex_Trace_List:traceForm',
    children: [pagination, traceTable]
  });
  const debugRow = el('TR', { id: 'debug-logs-row', children: [el('TD', { children: [traceForm] })] });

  const utfTitle = el('H2', {
    attrs: { class: 'mainTitle' },
    children: [el('TEXT', { textContent: 'User Trace Flags' })]
  });
  const monitoredForm = el('FORM', {
    id: 'Apex_Trace_List:monitoredUsersForm',
    children: [utfTitle]
  });
  const userRow = el('TR', { id: 'user-trace-row', children: [el('TD', { children: [monitoredForm] })] });

  const tbody = el('TBODY', { children: [userRow, debugRow] });
  const table = el('TABLE', { children: [tbody] });
  return createMockDocument(table);
}

describe('debugLogsTableOrderDom', () => {
  /** @type {Document} */
  let doc;

  beforeEach(() => {
    doc = buildPage();
  });

  it('detects setup iframe document', () => {
    expect(isApexDebugLogsSetupDocument(doc)).toBe(true);
    const empty = createMockDocument(el('DIV', {}));
    expect(isApexDebugLogsSetupDocument(empty)).toBe(false);
  });

  it('finds debug and user trace section rows', () => {
    const debugTr = findDebugLogsSectionRow(doc);
    const userTr = findUserTraceFlagsSectionRow(doc, debugTr);
    expect(debugTr?.id).toBe('debug-logs-row');
    expect(userTr?.id).toBe('user-trace-row');
  });

  it('starts with user trace flags above debug logs', () => {
    expect(isDebugLogsAboveUserTraceFlags(doc)).toBe(false);
  });

  it('reorders debug logs above user trace flags', () => {
    const result = reorderDebugLogsAboveUserTraceFlags(doc);
    expect(result.ok).toBe(true);
    expect(result.reason).toBe('reordered');
    expect(isDebugLogsAboveUserTraceFlags(doc)).toBe(true);

    const tbody = findDebugLogsSectionRow(doc)?.parentElement;
    expect(tbody?.children[0].id).toBe('debug-logs-row');
    expect(tbody?.children[1].id).toBe('user-trace-row');
  });

  it('is idempotent when already reordered', () => {
    reorderDebugLogsAboveUserTraceFlags(doc);
    const second = reorderDebugLogsAboveUserTraceFlags(doc);
    expect(second.ok).toBe(true);
    expect(second.reason).toBe('already-ordered');
    expect(isDebugLogsAboveUserTraceFlags(doc)).toBe(true);
  });

  it('keeps pagination inside the moved debug logs row', () => {
    reorderDebugLogsAboveUserTraceFlags(doc);
    const debugTr = findDebugLogsSectionRow(doc);
    expect(debugTr?.querySelector('[id="Apex_Trace_List:traceForm:traceTableNextPrev"]')).toBeTruthy();
  });
});
