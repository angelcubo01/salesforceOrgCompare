import { helpToolTitleKey, helpToolBodyKeys } from './helpToolIds.js';

let modalEl = null;

function ensureModal() {
  if (modalEl) return modalEl;
  modalEl = document.createElement('div');
  modalEl.className = 'apex-log-help-modal';
  modalEl.hidden = true;
  modalEl.innerHTML = `
    <div class="apex-log-help-backdrop" data-close="1"></div>
    <div class="apex-log-help-dialog" role="dialog" aria-modal="true" aria-labelledby="apexLogHelpTitle">
      <header class="apex-log-help-header">
        <h2 id="apexLogHelpTitle"></h2>
        <button type="button" class="apex-log-help-close" data-close="1" aria-label="Close">×</button>
      </header>
      <div class="apex-log-help-body" id="apexLogHelpBody"></div>
    </div>`;
  document.body.appendChild(modalEl);
  modalEl.querySelectorAll('[data-close]').forEach((el) => {
    el.addEventListener('click', () => closeStandaloneToolHelpModal());
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalEl && !modalEl.hidden) closeStandaloneToolHelpModal();
  });
  return modalEl;
}

export function closeStandaloneToolHelpModal() {
  if (modalEl) modalEl.hidden = true;
}

/**
 * @param {(key: string) => string} t
 * @param {string} toolId
 */
export function openStandaloneToolHelpModal(t, toolId) {
  const modal = ensureModal();
  const titleEl = modal.querySelector('#apexLogHelpTitle');
  const bodyEl = modal.querySelector('#apexLogHelpBody');
  const closeBtn = modal.querySelector('.apex-log-help-close');
  if (!titleEl || !bodyEl) return;

  const titleKey = helpToolTitleKey(toolId);
  const title = t(titleKey);
  titleEl.textContent = title !== titleKey ? title : t('help.title');
  if (closeBtn) closeBtn.setAttribute('aria-label', t('help.close'));

  bodyEl.innerHTML = '';
  for (const bodyKey of helpToolBodyKeys(toolId)) {
    const text = t(bodyKey);
    if (!text || text === bodyKey) continue;
    const p = document.createElement('p');
    p.className = 'apex-log-help-paragraph';
    p.textContent = text;
    bodyEl.appendChild(p);
  }

  modal.hidden = false;
  bodyEl.scrollTop = 0;
  closeBtn?.focus();
}
