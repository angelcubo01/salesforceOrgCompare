import { describe, it, expect } from 'vitest';
import {
  INTEGRATION_ID,
  extractLogIdFromRow
} from '../sfInject/content/injectors/debugLogOpenViewerDom.js';
import {
  countSfocInject,
  findInjectedForLog,
  hasSfocInject
} from '../sfInject/content/injectors/dom.js';

/** Minimal DOM mock for dedup tests (no jsdom). */
function createMockRow(logId, injectExisting = false) {
  const children = [];
  const attrs = { 'data-row-key-value': logId };
  const row = {
    getAttribute(name) {
      return attrs[name] ?? null;
    },
    querySelector(sel) {
      if (sel.includes('data-sfoc-inject')) {
        for (const c of children) {
          if (c.matches?.(sel)) return c;
        }
        for (const c of menuChildren) {
          if (c.matches?.(sel)) return c;
        }
        return null;
      }
      if (sel.includes('07L') || sel.includes('data-record-id')) return null;
      if (sel.includes('Show actions')) {
        return { closest: () => actionCell };
      }
      if (sel.includes('slds-dropdown__list') || sel.includes('role="menu"')) {
        return menu;
      }
      return null;
    },
    querySelectorAll(sel) {
      if (sel.includes('td') || sel.includes('gridcell')) return [actionCell];
      return [];
    },
    closest() {
      return null;
    },
    textContent: logId,
    appendChild(el) {
      children.push(el);
    }
  };

  const actionCell = {
    appendChild(el) {
      row.appendChild(el);
    },
    querySelector(sel) {
      return row.querySelector(sel);
    },
    closest: () => actionCell
  };

  const menuChildren = [];
  const menu = {
    appendChild(el) {
      menuChildren.push(el);
    },
    querySelector(sel) {
      for (const c of menuChildren) {
        if (c.matches?.(sel)) return c;
      }
      return null;
    }
  };

  if (injectExisting) {
    children.push({
      matches(sel) {
        return (
          sel.includes(`data-sfoc-inject="${INTEGRATION_ID}"`) &&
          sel.includes('data-sfoc-key="row-link"')
        );
      },
      getAttribute(n) {
        if (n === 'data-sfoc-inject') return INTEGRATION_ID;
        if (n === 'data-sfoc-key') return 'row-link';
        if (n === 'data-sfoc-log-id') return logId;
        return null;
      }
    });
  }

  return { row, actionCell, menu, children, menuChildren };
}

function createMockDocument(rows) {
  const doc = {
    querySelector(sel) {
      for (const r of rows) {
        const hit = r.row.querySelector(sel);
        if (hit) return hit;
      }
      for (const r of rows) {
        const hit = r.menu.querySelector(sel);
        if (hit) return hit;
      }
      return null;
    },
    querySelectorAll(sel) {
      if (sel.includes('tbody tr') || sel.includes('role="row"')) {
        return rows.map((r) => r.row);
      }
      if (sel.includes('data-sfoc-inject')) {
        const out = [];
        for (const r of rows) {
          for (const c of r.children) {
            if (c.getAttribute?.('data-sfoc-inject') === INTEGRATION_ID) out.push(c);
          }
          for (const c of r.menuChildren) {
            if (c.getAttribute?.('data-sfoc-inject') === INTEGRATION_ID) out.push(c);
          }
        }
        return out;
      }
      return [];
    },
    body: { appendChild: () => {} }
  };
  return doc;
}

describe('debugLogOpenViewer DOM dedup', () => {
  it('extracts log id from row key', () => {
    const { row } = createMockRow('07L000000000001');
    expect(extractLogIdFromRow(row)).toBe('07L000000000001');
  });

  it('detects existing inject marker', () => {
    const { row } = createMockRow('07L000000000001', true);
    expect(hasSfocInject(row, INTEGRATION_ID, 'row-link')).toBe(true);
    expect(
      findInjectedForLog(row, INTEGRATION_ID, 'row-link', '07L000000000001')
    ).toBeTruthy();
  });

  it('counts inject nodes without duplicate keys per log', () => {
    const rows = [
      createMockRow('07L000000000001'),
      createMockRow('07L000000000002')
    ];
    const doc = createMockDocument(rows);

    rows[0].children.push({
      getAttribute(n) {
        const map = {
          'data-sfoc-inject': INTEGRATION_ID,
          'data-sfoc-key': 'row-link',
          'data-sfoc-log-id': '07L000000000001'
        };
        return map[n] ?? null;
      },
      matches(sel) {
        return sel.includes(INTEGRATION_ID) && sel.includes('row-link');
      }
    });
    rows[1].children.push({
      getAttribute(n) {
        const map = {
          'data-sfoc-inject': INTEGRATION_ID,
          'data-sfoc-key': 'row-link',
          'data-sfoc-log-id': '07L000000000002'
        };
        return map[n] ?? null;
      },
      matches(sel) {
        return sel.includes(INTEGRATION_ID) && sel.includes('row-link');
      }
    });

    expect(countSfocInject(doc, INTEGRATION_ID)).toBe(2);

    rows[0].children.push({
      getAttribute(n) {
        const map = {
          'data-sfoc-inject': INTEGRATION_ID,
          'data-sfoc-key': 'row-link',
          'data-sfoc-log-id': '07L000000000001'
        };
        return map[n] ?? null;
      },
      matches(sel) {
        return sel.includes(INTEGRATION_ID) && sel.includes('row-link');
      }
    });

    const uniqueLogIds = new Set(
      [...doc.querySelectorAll(`[data-sfoc-inject="${INTEGRATION_ID}"][data-sfoc-key="row-link"]`)].map(
        (n) => n.getAttribute('data-sfoc-log-id')
      )
    );
    expect(uniqueLogIds.size).toBe(2);
  });
});

describe('debugLogOpenViewer inject idempotency (source)', () => {
  it('checks findInjectedForLog before creating controls', async () => {
    const fs = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { dirname, join } = await import('node:path');
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const code = fs.readFileSync(
      join(root, 'sfInject/content/injectors/debugLogOpenViewer.js'),
      'utf8'
    );
    expect(code).toContain('findInjectedForLog');
    expect(code).toContain('mountDebouncedDomObserver');
    const observerCode = fs.readFileSync(
      join(root, 'sfInject/content/injectors/observer.js'),
      'utf8'
    );
    expect(observerCode).toContain('MutationObserver');
  });
});
