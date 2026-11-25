import { element as el, button, icon, link, message, errorPanel, formatUserDate } from './userManagementUi.js';
import { isUserDebugTraceActive, USER_DEBUG_TRACE_MAX_WINDOW_MS } from '../../shared/userDebugTraceFlagStatus.js';
export function userTraceState(trace, now = Date.now()) {
  if (!trace) return 'none';
  if (Date.parse(trace.startIso) > now) return 'scheduled';
  if (!isUserDebugTraceActive(trace, now)) return 'expired';
  return Date.parse(trace.expirationIso) - now < 5 * 60000 ? 'soon' : 'active';
}
export function createUserLogsPanel(doc, initial, copy, handlers, lang) {
  let state = initial; let busy = false; let destroyed = false;
  const root = el(doc, 'section', 'sfoc-um-logs'); const notice = el(doc, 'div'); const confirmation = el(doc, 'div');
  const status = el(doc, 'div', 'sfoc-um-trace-status'); const details = el(doc, 'dl', 'sfoc-um-trace-details');
  const form = el(doc, 'div', 'sfoc-um-log-form');
  const levelLabel = el(doc, 'label', 'sfoc-um-field', copy.debugLevel);
  const level = el(doc, 'select', 'sfoc-um-input'); level.setAttribute('aria-label', copy.debugLevel); levelLabel.append(level);
  const durationLabel = el(doc, 'label', 'sfoc-um-field', copy.duration);
  const duration = el(doc, 'select', 'sfoc-um-input'); duration.setAttribute('aria-label', copy.duration);
  for (const n of [15, 30, 60]) { const option = el(doc, 'option', '', n + ' ' + copy.minutes); option.value = String(n); duration.append(option); } duration.value = '30'; durationLabel.append(duration);
  const actions = el(doc, 'div', 'sfoc-um-toolbar');
  const activate = button(doc, copy.activate, 'logs', () => run('activate', () => handlers.activate(level.value, +duration.value)), { variant: 'success' });
  const renew = button(doc, copy.renew, 'refresh', () => run('renew', () => handlers.renew(+duration.value)), { variant: 'success' });
  const saveLevel = button(doc, copy.changeLevel, 'check', () => run('level', () => handlers.changeLevel(level.value)));
  const disable = button(doc, copy.deactivate, 'minus', () => {
    confirmation.replaceChildren();
    const panel = message(doc, copy.confirmDisable, 'warning');
    panel.append(button(doc, copy.cancel, 'close', () => confirmation.replaceChildren()), button(doc, copy.deactivate, 'minus', () => run('delete', handlers.remove), { variant: 'danger' }));
    confirmation.append(panel); panel.querySelector('button').focus();
  }, { variant: 'danger' });
  const openLogs = link(doc, copy.openLogs, handlers.openLogsPath);
  openLogs.append(doc.createTextNode(copy.openLogs));
  const refresh = button(doc, copy.refresh, 'refresh', () => handlers.refresh(), { iconOnly: true });
  actions.append(activate, renew, saveLevel, disable, openLogs, refresh); form.append(levelLabel, durationLabel);
  root.append(status, details, form, actions, confirmation, notice);
  function render() {
    const flag = state.trace; const condition = userTraceState(flag);
    status.className = 'sfoc-um-trace-status sfoc-um-trace-status--' + condition;
    status.replaceChildren(icon(doc, condition === 'active' ? 'check' : condition === 'none' ? 'logs' : 'clock'), el(doc, 'strong', '', copy['trace_' + condition]));
    const remaining = !flag ? copy.unavailable : condition === 'expired' ? copy.expired : condition === 'scheduled' ? copy.notStarted : Math.max(1, Math.ceil((Date.parse(flag.expirationIso) - Date.now()) / 60000)) + ' ' + copy.minutes;
    const values = [[copy.start, formatUserDate(flag?.startIso, lang, copy.unavailable)], [copy.expires, formatUserDate(flag?.expirationIso, lang, copy.unavailable)], [copy.remaining, remaining], [copy.traceId, flag?.id || copy.unavailable]];
    details.replaceChildren(...values.map(([label, value]) => {
      const field = el(doc, 'div', 'sfoc-um-field'); field.append(el(doc, 'dt', '', label), el(doc, 'dd', '', value)); return field;
    }));
    const old = level.value;
    level.replaceChildren(...(state.debugLevels || []).map((l) => { const option = el(doc, 'option', '', l.label || l.developerName); option.value = l.id; return option; }));
    level.value = (state.debugLevels || []).some((l) => l.id === old) ? old : flag?.debugLevelId || state.debugLevels?.find((l) => l.developerName === state.preferredDebugLevel)?.id || state.debugLevels?.[0]?.id || '';
    activate.hidden = !!flag && ['active', 'soon', 'scheduled'].includes(condition);
    renew.hidden = !flag; saveLevel.hidden = !flag; disable.hidden = !flag;
    const maxed = flag && Date.parse(flag.expirationIso) >= Date.parse(flag.startIso) + USER_DEBUG_TRACE_MAX_WINDOW_MS && ['active', 'soon'].includes(condition);
    for (const control of [level, duration, activate, renew, saveLevel, disable, refresh]) control.disabled = busy;
    if (!level.value) { activate.disabled = true; saveLevel.disabled = true; }
    renew.disabled ||= !!maxed; renew.title = maxed ? copy.errors.MAX_WINDOW : copy.renew;
    root.querySelector('[data-no-levels]')?.remove();
    if (!state.debugLevels?.length) { const note = message(doc, copy.noLevels, 'warning'); note.dataset.noLevels = ''; root.append(note); }
    root.querySelector('[data-trace-link]')?.remove();
    if (flag) { const a = link(doc, copy.openTrace, '/lightning/setup/ApexDebugLogs/page?address=' + encodeURIComponent('/udd/TraceFlag/editTraceFlag.apexp?Id=' + flag.id)); a.dataset.traceLink = ''; a.append(doc.createTextNode(copy.openTrace)); actions.append(a); }
  }
  async function run(name, action) {
    if (busy) return; busy = true; confirmation.replaceChildren(); notice.replaceChildren(message(doc, copy.saving)); render();
    let response; try { response = await action(); } catch { response = { ok: false, reason: 'API_ERROR' }; }
    if (destroyed) return; busy = false;
    notice.replaceChildren(response?.ok ? message(doc, copy.done, 'success') : errorPanel(doc, copy, response?.reason)); render();
  }
  render();
  const timer = setInterval(() => { if (!destroyed && !root.hidden && !busy) render(); }, 15000);
  return {
    element: root, update(data) { state = data; if (!destroyed) render(); },
    escape() { if (confirmation.childElementCount) { confirmation.replaceChildren(); disable.focus(); return true; } return false; },
    destroy() { destroyed = true; clearInterval(timer); }
  };
}
