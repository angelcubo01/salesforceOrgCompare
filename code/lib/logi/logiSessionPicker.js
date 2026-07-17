import { escapeHtml } from '../../../shared/htmlEscape.js';
import { t } from '../../../shared/i18n.js';
import { listLogiSessions } from '../../../shared/logi/logiAdvisorSession.js';

/**
 * @param {HTMLElement} modal
 * @param {{ currentKey?: string, orgId?: string, onSelect?: (key: string) => void }} opts
 */
export async function refreshLogiSessionPicker(modal, opts = {}) {
  const select = modal?.querySelector('#logiAdvisorSessionPicker');
  if (!select) return;

  const currentKey = String(opts.currentKey || '');
  const orgId = String(opts.orgId || '').trim();
  const sessions = await listLogiSessions({ orgId, limit: 20 });

  if (!sessions.length) {
    select.hidden = true;
    select.innerHTML = '';
    return;
  }

  select.hidden = false;
  select.innerHTML = [
    `<option value="">${escapeHtml(t('apexLogViewer.logi.sessionPickerPlaceholder'))}</option>`,
    ...sessions.map(({ key, label, session }) => {
      const turns = session.messages.filter((m) => m.role === 'user').length;
      const stamp = session.updatedAt
        ? new Date(session.updatedAt).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })
        : '';
      const suffix = turns ? ` · ${turns}` : '';
      const text = `${label}${suffix}${stamp ? ` · ${stamp}` : ''}`;
      const selected = key === currentKey ? ' selected' : '';
      return `<option value="${escapeHtml(key)}"${selected}>${escapeHtml(text)}</option>`;
    })
  ].join('');
}

/**
 * @param {HTMLElement} modal
 * @param {{ currentKey?: string, orgId?: string, onSelect?: (key: string) => void }} opts
 */
export function mountLogiSessionPicker(modal, opts = {}) {
  const select = modal?.querySelector('#logiAdvisorSessionPicker');
  if (!select || select.dataset.logiPickerBound === '1') return;
  select.dataset.logiPickerBound = '1';

  select.addEventListener('change', () => {
    const key = String(select.value || '').trim();
    if (!key || key === opts.currentKey) return;
    opts.onSelect?.(key);
  });

  void refreshLogiSessionPicker(modal, opts);
}
