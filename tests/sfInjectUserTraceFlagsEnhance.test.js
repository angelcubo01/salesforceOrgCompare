import { describe, expect, it } from 'vitest';
import { normalizeTraceFlagId } from '../sfInject/content/matchers/traceFlagIds.js';
import {
  detectClassicDateOrder,
  formatClassicDateTime,
  parseClassicDateTimeMs
} from '../sfInject/content/matchers/classicDateTime.js';
import {
  extractTraceFlagIdFromRow,
  findExpirationColumnIndex,
  findTraceActionsHost,
  findTraceActionLinksInRow,
  findUserTraceFlagRows,
  findUserTraceFlagsTable,
  isUserTraceFlagRow,
  readRowCellText,
  setRowFilteredHidden
} from '../sfInject/content/injectors/userTraceFlagsEnhanceDom.js';
import { resolveRowFilterState } from '../sfInject/content/injectors/userTraceFlagsEnhance.js';
import {
  normalizeSfInjectConfig,
  normalizeSfInjectPrefs
} from '../sfInject/lib/settings.js';
import { SF_INJECT_INTEGRATION_IDS } from '../sfInject/lib/registry.js';

const DEL_SELECTOR_RE = /delTraceFlag/;

/**
 * Mock de fila `tr.dataRow` como la genera listApexTraces.apexp.
 * @param {{ id: string, start?: string, expiration?: string, delHref?: string }} opts
 */
function createMockTraceRow({
  id,
  start = '16/7/2026, 16:09',
  expiration = '16/7/2026, 16:39',
  delHref
}) {
  const deleteHref =
    delHref ||
    `javascript:srcSelf(%27%2Fsetup%2Fui%2FlistApexTraces.apexp%3FdelTraceFlag%3D${id}%26isdtp%3Dp1%27)`;

  const mkLink = (text, href) => ({
    tagName: 'A',
    className: 'actionLink',
    textContent: text,
    getAttribute(name) {
      if (name === 'href') return href;
      if (name === 'title') return `${text} - Record 1 - ${id}`;
      return null;
    },
    matches: (sel) => String(sel).includes('a')
  });

  const actionLinks = [
    mkLink('Delete', deleteHref),
    mkLink('Edit', `javascript:srcUp(%27%2Fudd%2FTraceFlag%2FeditTraceFlag.apexp%3FId%3D${id}%27)`),
    mkLink('Filters', `javascript:srcUp(%27%2Fudd%2FDebugLevel%2FeditDebugLevel.apexp%3Ftraceflag_id%3D${id}%27)`)
  ];

  const mkCell = (tag, className, textContent, children = []) => ({
    tagName: tag,
    className,
    textContent,
    children,
    appendChild() {},
    querySelector: () => null,
    querySelectorAll: () => []
  });

  const delLink = DEL_SELECTOR_RE.test(deleteHref) ? actionLinks[0] : null;

  const actionCell = {
    ...mkCell('TD', 'actionColumn', 'Delete | Edit | Filters', actionLinks),
    querySelector(sel) {
      const s = String(sel);
      if (DEL_SELECTOR_RE.test(s)) return delLink;
      if (s.includes('a')) return actionLinks[0];
      return null;
    },
    querySelectorAll: (sel) => (String(sel).includes('a') ? actionLinks : [])
  };

  const cells = [
    actionCell,
    mkCell('TH', 'dataCell', id),
    mkCell('TD', 'dataCell', 'AAC Negocio'),
    mkCell('TD', 'dataCell', start),
    mkCell('TD', 'dataCell', expiration),
    mkCell('TD', 'dataCell', 'USER_DEBUG'),
    mkCell('TD', 'dataCell', 'SFDC_DevConsole')
  ];

  const attrs = {};
  const row = {
    tagName: 'TR',
    className: 'dataRow even first',
    classList: { contains: (c) => String(row.className).split(' ').includes(c) },
    textContent: `Delete Edit Filters ${id}`,
    style: { display: '', opacity: '' },
    getAttribute: (name) => attrs[name] ?? null,
    setAttribute(name, value) {
      attrs[name] = value;
    },
    removeAttribute(name) {
      delete attrs[name];
    },
    closest: () => null,
    querySelector(sel) {
      const s = String(sel);
      if (s === 'table') return null;
      if (DEL_SELECTOR_RE.test(s)) return delLink;
      if (s.includes('actionColumn')) return actionCell;
      const all = row.querySelectorAll(sel);
      return all[0] || null;
    },
    querySelectorAll(sel) {
      const s = String(sel);
      if (s.includes('td, th') || s.includes('td,th')) return cells;
      if (s.includes('a')) return actionLinks;
      return [];
    }
  };

  return { row, actionCell, actionLinks, cells };
}

describe('normalizeTraceFlagId', () => {
  it('extracts 15-char TraceFlag ids', () => {
    expect(normalizeTraceFlagId('7tf000000000001')).toBe('7tf000000000001');
    expect(normalizeTraceFlagId('/x?id=7tf000000000002AAA')).toBe('7tf000000000002');
    expect(normalizeTraceFlagId('07L000000000001')).toBe(null);
  });

  it('extracts ids from URL-encoded Classic hrefs', () => {
    const href =
      "javascript:srcSelf(%27%2Fsetup%2Fui%2FlistApexTraces.apexp%3FdelTraceFlag%3D7tfbd000000GEv3AAG%27)";
    expect(normalizeTraceFlagId(href)).toBe('7tfbd000000GEv3');
  });
});

describe('parseClassicDateTimeMs', () => {
  it('parses day-first Spanish format', () => {
    const ms = parseClassicDateTimeMs('16/7/2026, 16:39', 'dmy');
    const d = new Date(ms);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(16);
    expect(d.getHours()).toBe(16);
    expect(d.getMinutes()).toBe(39);
  });

  it('parses English AM/PM format with mdy order', () => {
    const d = new Date(parseClassicDateTimeMs('7/16/2026, 4:39 PM', 'mdy'));
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(16);
    expect(d.getHours()).toBe(16);
  });

  it('disambiguates by day greater than 12 regardless of order', () => {
    const d = new Date(parseClassicDateTimeMs('25/6/2026, 12:08', 'mdy'));
    expect(d.getDate()).toBe(25);
    expect(d.getMonth()).toBe(5);
  });

  it('treats ambiguous dates as day-first by default (EU/ES)', () => {
    const d = new Date(parseClassicDateTimeMs('10/7/2026, 12:00', 'dmy'));
    expect(d.getDate()).toBe(10);
    expect(d.getMonth()).toBe(6);
  });

  it('returns NaN for unparseable text', () => {
    expect(Number.isNaN(parseClassicDateTimeMs('', 'dmy'))).toBe(true);
    expect(Number.isNaN(parseClassicDateTimeMs('Expiration Date', 'dmy'))).toBe(true);
  });
});

describe('detectClassicDateOrder', () => {
  it('detects day-first from unambiguous samples', () => {
    expect(detectClassicDateOrder(['16/7/2026, 16:39', '9/2/2026, 10:00'])).toBe('dmy');
  });
});

describe('formatClassicDateTime', () => {
  it('formats day-first like Classic ES pages', () => {
    const iso = new Date(2026, 6, 27, 13, 23, 0).toISOString();
    expect(formatClassicDateTime(iso, 'dmy')).toBe('27/7/2026, 13:23');
  });

  it('formats month-first when order is mdy', () => {
    const iso = new Date(2026, 6, 27, 13, 23, 0).toISOString();
    expect(formatClassicDateTime(iso, 'mdy')).toBe('7/27/2026, 13:23');
  });
});

describe('userTraceFlagsEnhance DOM helpers', () => {
  it('extracts TraceFlag id from the Delete link and finds action host', () => {
    const { row, actionCell } = createMockTraceRow({ id: '7tfbd000000GEv3' });
    expect(extractTraceFlagIdFromRow(row)).toBe('7tfbd000000GEv3');
    expect(isUserTraceFlagRow(row)).toBe(true);
    expect(findTraceActionLinksInRow(row)).toHaveLength(3);
    expect(findTraceActionsHost(row)).toBe(actionCell);
  });

  it('rejects rows without delTraceFlag (Debug Logs rows)', () => {
    const { row } = createMockTraceRow({
      id: '7tf000000000099',
      delHref: '/setup/ui/deleteApexLog.apexp?id=07L000000000099'
    });
    expect(isUserTraceFlagRow(row)).toBe(false);
  });

  it('rejects the section wrapper row that contains a nested table', () => {
    const { row } = createMockTraceRow({ id: '7tf000000000001' });
    const sectionRow = {
      ...row,
      querySelector(sel) {
        if (String(sel) === 'table') return { tagName: 'TABLE' };
        return row.querySelector(sel);
      }
    };
    expect(isUserTraceFlagRow(sectionRow)).toBe(false);
  });

  it('reads cell text by column index', () => {
    const { row } = createMockTraceRow({ id: '7tf000000000001' });
    expect(readRowCellText(row, 4)).toBe('16/7/2026, 16:39');
  });

  it('finds expiration column index from header cells', () => {
    const cells = [
      'Action',
      'Trace Flag ID',
      'Name',
      'Start Date',
      'Expiration Date',
      'Log Type',
      'Debug Level Name'
    ].map((text) => ({ textContent: text }));
    const headerRow = { querySelectorAll: () => cells };
    const table = {
      querySelector: (sel) =>
        String(sel).includes('thead') || String(sel).includes('tr') ? headerRow : null
    };
    expect(findExpirationColumnIndex(/** @type {any} */ (table))).toBe(4);
  });

  it('resolves the innermost table via the delTraceFlag link, not an ancestor', () => {
    const innerTable = { tagName: 'TABLE', className: 'list' };
    const link = {
      tagName: 'A',
      closest: (sel) => (String(sel) === 'table' ? innerTable : null)
    };
    const doc = {
      querySelector: (sel) => (DEL_SELECTOR_RE.test(String(sel)) ? link : null)
    };
    expect(findUserTraceFlagsTable(/** @type {any} */ (doc))).toBe(innerTable);
  });

  it('collects only data rows inside the list table', () => {
    const { row: dataRow } = createMockTraceRow({ id: '7tfbd000000GEv3' });
    const headerRow = {
      tagName: 'TR',
      className: 'headerRow',
      classList: { contains: (c) => c === 'headerRow' },
      querySelector: () => null,
      querySelectorAll: () => []
    };
    const table = {
      tagName: 'TABLE',
      querySelectorAll: (sel) => (String(sel) === 'tr' ? [headerRow, dataRow] : [])
    };
    const link = { closest: () => table };
    const doc = { querySelector: (sel) => (DEL_SELECTOR_RE.test(String(sel)) ? link : null) };

    const rows = findUserTraceFlagRows(/** @type {any} */ (doc));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toBe(dataRow);
  });

  it('hides filtered rows with display none', () => {
    const { row } = createMockTraceRow({ id: '7tf000000000099' });
    setRowFilteredHidden(row, true);
    expect(row.getAttribute('data-sfoc-utf-hidden')).toBe('1');
    expect(row.style.display).toBe('none');
    setRowFilteredHidden(row, false);
    expect(row.getAttribute('data-sfoc-utf-hidden')).toBe(null);
    expect(row.style.display).toBe('');
  });
});

describe('resolveRowFilterState', () => {
  const now = new Date(2026, 6, 16, 17, 0, 0).getTime();

  it('keeps active traces visible', () => {
    const { row } = createMockTraceRow({ id: '7tf1', expiration: '16/7/2026, 18:00' });
    const state = resolveRowFilterState(row, 4, 'dmy', now);
    expect(state).toMatchObject({ known: true, visible: true, recentlyExpired: false });
  });

  it('keeps traces expired within 30 min and flags them', () => {
    const { row } = createMockTraceRow({ id: '7tf2', expiration: '16/7/2026, 16:45' });
    const state = resolveRowFilterState(row, 4, 'dmy', now);
    expect(state).toMatchObject({ known: true, visible: true, recentlyExpired: true });
  });

  it('hides traces expired long ago', () => {
    const { row } = createMockTraceRow({ id: '7tf3', expiration: '16/7/2026, 15:00' });
    const state = resolveRowFilterState(row, 4, 'dmy', now);
    expect(state).toMatchObject({ known: true, visible: false });
  });

  it('hides ambiguous expired dates when order is day-first', () => {
    const { row } = createMockTraceRow({ id: '7tf5', expiration: '10/7/2026, 12:00' });
    const state = resolveRowFilterState(row, 4, 'dmy', now);
    expect(state).toMatchObject({ known: true, visible: false });
  });

  it('prefers API dates over DOM text when a trace match exists', () => {
    const { row } = createMockTraceRow({ id: '7tf6', expiration: '10/7/2026, 12:00' });
    const state = resolveRowFilterState(row, 4, 'dmy', now, {
      startIso: '2026-07-16T10:00:00.000Z',
      expirationIso: '2026-07-16T18:00:00.000Z'
    });
    expect(state.visible).toBe(true);
  });

  it('keeps rows visible when the date cannot be parsed', () => {
    const { row } = createMockTraceRow({ id: '7tf4', expiration: '' });
    const state = resolveRowFilterState(row, 4, 'dmy', now);
    expect(state).toMatchObject({ known: false, visible: true });
  });
});

describe('sfInject prefs', () => {
  it('defaults userTraceFlagsActiveOnly to false', () => {
    const cfg = normalizeSfInjectConfig({});
    expect(cfg.prefs.userTraceFlagsActiveOnly).toBe(false);
    expect(SF_INJECT_INTEGRATION_IDS).toContain('userTraceFlagsEnhance');
    expect(cfg.integrations.userTraceFlagsEnhance).toBe(false);
  });

  it('normalizes prefs true only when explicitly true', () => {
    expect(normalizeSfInjectPrefs({ userTraceFlagsActiveOnly: true }).userTraceFlagsActiveOnly).toBe(
      true
    );
    expect(normalizeSfInjectPrefs({ userTraceFlagsActiveOnly: false }).userTraceFlagsActiveOnly).toBe(
      false
    );
    const cfg = normalizeSfInjectConfig({ prefs: { userTraceFlagsActiveOnly: true } });
    expect(cfg.prefs.userTraceFlagsActiveOnly).toBe(true);
  });

  it('preserves prefs when only integrations change in normalize merge shape', () => {
    const cfg = normalizeSfInjectConfig({
      enabled: true,
      integrations: { debugLogOpenViewer: false },
      prefs: { userTraceFlagsActiveOnly: false }
    });
    expect(cfg.prefs.userTraceFlagsActiveOnly).toBe(false);
    expect(cfg.integrations.debugLogOpenViewer).toBe(false);
  });
});
