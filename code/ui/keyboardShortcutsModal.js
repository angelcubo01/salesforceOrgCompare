import { t } from '../../shared/i18n.js';

let wired = false;

function isTypingTarget(el) {
  if (!el || typeof el !== 'object') return false;
  const tag = String(el.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return false;
}

function isHelpKey(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  if (e.key === '?') return true;
  if (e.code === 'Slash' && e.shiftKey) return true;
  return false;
}

function rows() {
  return [
    { keys: t('shortcuts.keys.prevNextDiff'), desc: t('shortcuts.desc.prevNextDiff') },
    { keys: t('shortcuts.keys.escapeModals'), desc: t('shortcuts.desc.escapeModals') },
    { keys: t('shortcuts.keys.searchEnter'), desc: t('shortcuts.desc.searchEnter') },
    { keys: t('shortcuts.keys.quickEditEnter'), desc: t('shortcuts.desc.quickEditEnter') },
    { keys: t('shortcuts.keys.apexMethodCtrlClick'), desc: t('shortcuts.desc.apexMethodCtrlClick') },
    { keys: t('shortcuts.keys.apexStackCtrlClick'), desc: t('shortcuts.desc.apexStackCtrlClick') },
    { keys: t('shortcuts.keys.monaco'), desc: t('shortcuts.desc.monaco') },
    { keys: t('shortcuts.keys.openThisHelp'), desc: t('shortcuts.desc.openThisHelp') }
  ];
}

function renderBody(body) {
  if (!body) return;
  const list = rows();
  const table = document.createElement('table');
  table.className = 'keyboard-shortcuts-table';
  const thead = document.createElement('thead');
  thead.innerHTML = `<tr><th scope="col">${t('shortcuts.colKeys')}</th><th scope="col">${t('shortcuts.colDesc')}</th></tr>`;
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const row of list) {
    const tr = document.createElement('tr');
    const td1 = document.createElement('td');
    td1.className = 'keyboard-shortcuts-keys';
    td1.textContent = row.keys;
    const td2 = document.createElement('td');
    td2.textContent = row.desc;
    tr.appendChild(td1);
    tr.appendChild(td2);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  body.innerHTML = '';
  body.appendChild(table);
}

export function openKeyboardShortcutsModal() {
  const modal = document.getElementById('keyboardShortcutsModal');
  const body = document.getElementById('keyboardShortcutsModalBody');
  if (!modal) return;
  renderBody(body);
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  const closeBtn = document.getElementById('keyboardShortcutsModalClose');
  closeBtn?.focus();
}

export function closeKeyboardShortcutsModal() {
  const modal = document.getElementById('keyboardShortcutsModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

export function setupKeyboardShortcutsModal() {
  if (wired) return;
  wired = true;
  const modal = document.getElementById('keyboardShortcutsModal');
  const closeBtn = document.getElementById('keyboardShortcutsModalClose');
  const helpBtn = document.getElementById('keyboardShortcutsHelpBtn');
  const backdrop = modal?.querySelector('[data-keyboard-shortcuts-close]');

  const close = () => closeKeyboardShortcutsModal();
  closeBtn?.addEventListener('click', close);
  backdrop?.addEventListener('click', close);
  helpBtn?.addEventListener('click', () => openKeyboardShortcutsModal());

  document.addEventListener('keydown', (e) => {
    if (modal && !modal.classList.contains('hidden')) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
      return;
    }
    if (!isHelpKey(e)) return;
    if (isTypingTarget(e.target)) return;
    e.preventDefault();
    openKeyboardShortcutsModal();
  });
}
