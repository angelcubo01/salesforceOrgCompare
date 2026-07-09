/**
 * Desplegable personalizado del selector de org que muestra el usuario Salesforce conectado.
 *
 * No sustituye la lógica de selección: los `<select id="leftOrg">` / `#rightOrg` siguen siendo
 * la fuente de verdad (los usan muchos módulos). Este componente los oculta visualmente y
 * pinta una barra + lista propias que fijan `select.value` y disparan `change`.
 */
import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { t } from '../../shared/i18n.js';
import {
  buildConnectedUserTooltipLines,
  hasConnectedUser
} from '../../shared/orgConnectedUserView.js';
import { syncOrgsWhenOpeningSelector } from './orgs.js';

const SIDES = [
  { side: 'left', selectId: 'leftOrg', wrapperSel: '.org-dropdown-left' },
  { side: 'right', selectId: 'rightOrg', wrapperSel: '.org-dropdown-right' }
];

/** @type {Map<string, object | null>} usuario conectado por orgId (null = comprobado y sin conexión). */
const userCache = new Map();
/** @type {Set<string>} orgIds con petición en curso. */
const inFlight = new Set();

/** @type {Record<string, { wrapper: HTMLElement, container: HTMLElement, select: HTMLSelectElement, trigger: HTMLElement, label: HTMLElement, badge: HTMLElement, popup: HTMLElement, highlightIndex: number }>} */
const ui = {};

let outsideHandler = null;
let popupKeydownAttached = false;
let popupRepositionHandler = null;
let suppressTriggerClick = false;

const POPUP_FLOAT_CLASS = 'org-cd-popup--floating';

/** @type {HTMLElement | null} Cuadro de tooltip flotante único (bonito), compartido por barra y filas. */
let floatingTip = null;

function getFloatingTip() {
  if (floatingTip) return floatingTip;
  floatingTip = document.createElement('div');
  floatingTip.className = 'org-cd-tooltip ph-no-capture';
  floatingTip.hidden = true;
  document.body.appendChild(floatingTip);
  return floatingTip;
}

/** Rellena el tooltip con nodos de texto seguros (sin innerHTML de datos). */
function fillTooltip(tip, user) {
  tip.textContent = '';
  const lines = buildConnectedUserTooltipLines(user, t);
  for (const r of lines) {
    const row = document.createElement('div');
    row.className = 'org-cd-tt-row';
    const label = document.createElement('span');
    label.className = 'org-cd-tt-label';
    label.textContent = `${r.label}:`;
    const value = document.createElement('span');
    value.className = 'org-cd-tt-value';
    value.textContent = r.value;
    row.appendChild(label);
    row.appendChild(value);
    tip.appendChild(row);
  }
  return lines.length;
}

/** Muestra el tooltip flotante junto a `anchorEl` (posición fija, dentro de la ventana). */
function showTooltip(anchorEl, user) {
  if (!anchorEl || !hasConnectedUser(user)) return;
  const tip = getFloatingTip();
  if (!fillTooltip(tip, user)) return;
  tip.hidden = false;
  const r = anchorEl.getBoundingClientRect();
  const tw = tip.offsetWidth;
  const th = tip.offsetHeight;
  let left = r.right - tw;
  if (left < 8) left = 8;
  if (left + tw > window.innerWidth - 8) left = window.innerWidth - 8 - tw;
  let top = r.bottom + 6;
  if (top + th > window.innerHeight - 8) top = r.top - th - 6;
  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
}

function hideTooltip() {
  if (floatingTip) floatingTip.hidden = true;
}

function isAuthActive(orgId) {
  if (!orgId) return false;
  return (state.authStatuses && state.authStatuses[orgId]) === 'active';
}

/** Pide (si hace falta) el usuario conectado de una org y refresca la UI al llegar. */
function ensureUserFetched(orgId, { force = false } = {}) {
  const id = String(orgId || '').trim();
  if (!id || !isAuthActive(id)) return;
  if (!force && (userCache.has(id) || inFlight.has(id))) return;
  inFlight.add(id);
  void (async () => {
    try {
      const res = await bg({ type: 'getOrgConnectedUser', orgId: id, force });
      userCache.set(id, res?.ok ? res.user || null : null);
    } catch {
      userCache.set(id, null);
    } finally {
      inFlight.delete(id);
      refreshOrgUserDropdowns();
      updateOpenPopupRows();
    }
  })();
}

/** Pide en lote los usuarios de las orgs listadas (al abrir el desplegable). */
function ensureUsersFetchedBatch(orgIds) {
  const ids = [...new Set((orgIds || []).map((x) => String(x || '').trim()).filter(Boolean))]
    .filter((id) => isAuthActive(id) && !userCache.has(id) && !inFlight.has(id));
  if (!ids.length) return;
  ids.forEach((id) => inFlight.add(id));
  void (async () => {
    try {
      const res = await bg({ type: 'getOrgConnectedUsers', orgIds: ids });
      const users = res?.ok && res.users ? res.users : {};
      ids.forEach((id) => userCache.set(id, users[id] || null));
    } catch {
      ids.forEach((id) => userCache.set(id, null));
    } finally {
      ids.forEach((id) => inFlight.delete(id));
      refreshOrgUserDropdowns();
      updateOpenPopupRows();
    }
  })();
}

function getUserForOrg(orgId) {
  const id = String(orgId || '').trim();
  if (!id || !isAuthActive(id)) return null;
  return userCache.get(id) || null;
}

function selectedOptionLabel(select) {
  const opt = select.options[select.selectedIndex];
  return opt ? opt.textContent || '' : '';
}

function getPopupRows(entry) {
  return Array.from(entry.popup.querySelectorAll('.org-cd-row'));
}

function getRowIndexForValue(entry, value) {
  return getPopupRows(entry).findIndex((row) => row.dataset.value === value);
}

function setPopupHighlight(entry, index) {
  const rows = getPopupRows(entry);
  if (!rows.length) return;
  const clamped = ((index % rows.length) + rows.length) % rows.length;
  entry.highlightIndex = clamped;
  rows.forEach((row, i) => {
    row.classList.toggle('is-keyboard-active', i === clamped);
  });
  rows[clamped].scrollIntoView({ block: 'nearest' });
}

function getOpenPopupSide() {
  return Object.keys(ui).find((side) => {
    const entry = ui[side];
    return entry && !entry.popup.hidden;
  });
}

function confirmPopupSelection(side) {
  const entry = ui[side];
  if (!entry || entry.popup.hidden) return;
  const rows = getPopupRows(entry);
  const row = rows[entry.highlightIndex ?? 0];
  if (row) chooseOrg(side, row.dataset.value || '');
}

function onPopupKeydown(ev) {
  const openSide = getOpenPopupSide();
  if (!openSide) return;
  const entry = ui[openSide];
  const rows = getPopupRows(entry);
  if (!rows.length) return;

  switch (ev.key) {
    case 'ArrowDown':
      ev.preventDefault();
      setPopupHighlight(entry, (entry.highlightIndex ?? 0) + 1);
      break;
    case 'ArrowUp':
      ev.preventDefault();
      setPopupHighlight(entry, (entry.highlightIndex ?? 0) - 1);
      break;
    case 'Home':
      ev.preventDefault();
      setPopupHighlight(entry, 0);
      break;
    case 'End':
      ev.preventDefault();
      setPopupHighlight(entry, rows.length - 1);
      break;
    case 'Enter':
    case ' ':
      ev.preventDefault();
      ev.stopPropagation();
      hideTooltip();
      confirmPopupSelection(openSide);
      break;
    case 'Escape':
      ev.preventDefault();
      closeAllPopups();
      entry.trigger.focus();
      break;
    case 'Tab':
      closeAllPopups();
      break;
    default:
      break;
  }
}

function positionFloatingPopup(entry) {
  const { trigger, popup } = entry;
  const rect = trigger.getBoundingClientRect();
  popup.classList.add(POPUP_FLOAT_CLASS);
  if (popup.parentElement !== document.body) {
    document.body.appendChild(popup);
  }
  popup.style.top = `${Math.round(rect.bottom + 4)}px`;
  popup.style.left = `${Math.round(rect.left)}px`;
  popup.style.width = `${Math.round(rect.width)}px`;
}

function dockPopup(entry) {
  const { container, popup } = entry;
  popup.classList.remove(POPUP_FLOAT_CLASS);
  popup.style.top = '';
  popup.style.left = '';
  popup.style.width = '';
  if (popup.parentElement !== container) {
    container.appendChild(popup);
  }
}

function attachPopupReposition() {
  if (popupRepositionHandler) return;
  popupRepositionHandler = () => {
    const openSide = getOpenPopupSide();
    if (!openSide) return;
    positionFloatingPopup(ui[openSide]);
  };
  window.addEventListener('resize', popupRepositionHandler);
  window.addEventListener('scroll', popupRepositionHandler, true);
}

function detachPopupReposition() {
  if (!popupRepositionHandler) return;
  window.removeEventListener('resize', popupRepositionHandler);
  window.removeEventListener('scroll', popupRepositionHandler, true);
  popupRepositionHandler = null;
}

function closeAllPopups() {
  hideTooltip();
  for (const side of Object.keys(ui)) {
    const entry = ui[side];
    if (entry && !entry.popup.hidden) {
      entry.popup.hidden = true;
      entry.trigger.setAttribute('aria-expanded', 'false');
      entry.container.classList.remove('is-open');
      dockPopup(entry);
    }
  }
  detachPopupReposition();
  if (outsideHandler) {
    document.removeEventListener('mousedown', outsideHandler, true);
    outsideHandler = null;
  }
  if (popupKeydownAttached) {
    document.removeEventListener('keydown', onPopupKeydown, true);
    popupKeydownAttached = false;
  }
}

function openPopup(side, { initialHighlightIndex } = {}) {
  const entry = ui[side];
  if (!entry || entry.trigger.getAttribute('aria-disabled') === 'true') return;
  // Cierra otros y prepara cierre por click fuera.
  closeAllPopups();
  renderPopupRows(side);
  entry.popup.hidden = false;
  entry.trigger.setAttribute('aria-expanded', 'true');
  entry.container.classList.add('is-open');

  const selectedIdx = getRowIndexForValue(entry, entry.select.value);
  const highlightIdx =
    typeof initialHighlightIndex === 'number' && initialHighlightIndex >= 0
      ? initialHighlightIndex
      : selectedIdx >= 0
        ? selectedIdx
        : 0;
  setPopupHighlight(entry, highlightIdx);
  positionFloatingPopup(entry);
  attachPopupReposition();

  // Detectar org de la pestaña activa (equivalente al focus/mousedown del select nativo).
  void syncOrgsWhenOpeningSelector();
  // Cargar usuarios de todas las orgs listadas.
  const ids = Array.from(entry.select.options).map((o) => o.value).filter(Boolean);
  ensureUsersFetchedBatch(ids);

  outsideHandler = (ev) => {
    if (!entry.popup.contains(ev.target) && !entry.trigger.contains(ev.target)) {
      closeAllPopups();
    }
  };
  document.addEventListener('mousedown', outsideHandler, true);
  document.addEventListener('keydown', onPopupKeydown, true);
  popupKeydownAttached = true;
}

function chooseOrg(side, orgId) {
  const entry = ui[side];
  if (!entry) return;
  suppressTriggerClick = true;
  if (entry.select.value === orgId) {
    closeAllPopups();
    entry.trigger.focus();
    queueMicrotask(() => {
      suppressTriggerClick = false;
    });
    return;
  }
  entry.select.value = orgId;
  entry.select.dispatchEvent(new Event('change', { bubbles: true }));
  closeAllPopups();
  refreshOrgUserDropdowns();
  entry.trigger.focus();
  queueMicrotask(() => {
    suppressTriggerClick = false;
  });
}

function renderPopupRows(side, { preserveHighlight = false } = {}) {
  const entry = ui[side];
  if (!entry) return;
  const popup = entry.popup;
  const options = Array.from(entry.select.options);
  const prevHighlight = preserveHighlight ? entry.highlightIndex : undefined;
  popup.textContent = '';
  const selectedValue = entry.select.value;
  for (const opt of options) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'org-cd-row';
    row.setAttribute('role', 'option');
    row.dataset.value = opt.value;
    if (opt.value === selectedValue) {
      row.classList.add('is-selected');
      row.setAttribute('aria-selected', 'true');
    }

    const status = opt.value ? (state.authStatuses?.[opt.value] || 'expired') : '';
    if (status === 'active') row.classList.add('is-connected');
    else if (status === 'expired') row.classList.add('is-disconnected');

    const main = document.createElement('span');
    main.className = 'org-cd-row-label';
    main.textContent = opt.textContent || '';
    row.appendChild(main);

    const user = getUserForOrg(opt.value);
    if (hasConnectedUser(user)) {
      const info = document.createElement('span');
      info.className = 'org-cd-row-info';
      info.textContent = 'i';
      info.setAttribute('aria-label', 'info');
      info.addEventListener('mouseenter', () => showTooltip(info, user));
      info.addEventListener('mouseleave', hideTooltip);
      row.appendChild(info);
    }

    row.addEventListener('click', () => chooseOrg(side, opt.value));
    row.addEventListener('mouseenter', () => {
      const rows = getPopupRows(entry);
      const idx = rows.indexOf(row);
      if (idx >= 0) setPopupHighlight(entry, idx);
    });
    popup.appendChild(row);
  }

  let highlightIndex = prevHighlight;
  if (highlightIndex == null || highlightIndex < 0 || highlightIndex >= options.length) {
    highlightIndex = options.findIndex((opt) => opt.value === selectedValue);
    if (highlightIndex < 0) highlightIndex = 0;
  }
  setPopupHighlight(entry, highlightIndex);
}

/** Si hay un popup abierto, reconstruye sus filas (p. ej. tras llegar datos de usuario). */
function updateOpenPopupRows() {
  for (const side of Object.keys(ui)) {
    const entry = ui[side];
    if (entry && !entry.popup.hidden) renderPopupRows(side, { preserveHighlight: true });
  }
}

/** Refresca barra (label, insignia, estado disabled y color auth) de ambos lados. */
export function refreshOrgUserDropdowns() {
  for (const { side } of SIDES) {
    const entry = ui[side];
    if (!entry) continue;
    const { select, trigger, label, badge } = entry;

    label.textContent = selectedOptionLabel(select);

    // Estado disabled / bloqueado.
    const disabled = !!select.disabled;
    trigger.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    trigger.classList.toggle('is-disabled', disabled);

    // Color de autenticación (espeja el estado del select nativo).
    trigger.classList.toggle('auth-active', select.classList.contains('auth-active'));
    trigger.classList.toggle('auth-expired', select.classList.contains('auth-expired'));

    const orgId = select.value;
    const user = getUserForOrg(orgId);
    if (hasConnectedUser(user)) {
      badge.hidden = false;
      trigger.classList.add('has-user');
    } else {
      badge.hidden = true;
      trigger.classList.remove('has-user');
    }

    // Lanzar carga del usuario del entorno seleccionado si aún no la tenemos.
    if (orgId) ensureUserFetched(orgId);
  }
}

function buildSideUi(side, selectId, wrapperSel) {
  const select = /** @type {HTMLSelectElement | null} */ (document.getElementById(selectId));
  const wrapper = /** @type {HTMLElement | null} */ (document.querySelector(wrapperSel));
  if (!select || !wrapper) return;
  if (wrapper.dataset.orgCdReady === '1') return;

  select.classList.add('org-cd-native-hidden');

  const container = document.createElement('div');
  container.className = 'org-cd';
  container.dataset.side = side;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'org-cd-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');

  const label = document.createElement('span');
  label.className = 'org-cd-label';
  trigger.appendChild(label);

  const badge = document.createElement('span');
  badge.className = 'org-cd-badge';
  badge.textContent = 'i';
  badge.setAttribute('aria-label', 'info');
  badge.hidden = true;
  trigger.appendChild(badge);

  const popup = document.createElement('div');
  popup.className = 'org-cd-popup ph-no-capture';
  popup.setAttribute('role', 'listbox');
  popup.hidden = true;

  container.appendChild(trigger);
  container.appendChild(popup);
  wrapper.insertBefore(container, select);

  trigger.addEventListener('click', (ev) => {
    ev.preventDefault();
    if (suppressTriggerClick) {
      suppressTriggerClick = false;
      return;
    }
    if (!popup.hidden) {
      closeAllPopups();
    } else {
      openPopup(side);
    }
  });
  trigger.addEventListener('keydown', (ev) => {
    if (trigger.getAttribute('aria-disabled') === 'true') return;

    if (!popup.hidden) {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        ev.stopPropagation();
        confirmPopupSelection(side);
      }
      return;
    }

    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp' || ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      const selectedIdx = Array.from(select.options).findIndex((opt) => opt.value === select.value);
      let initialHighlightIndex = selectedIdx >= 0 ? selectedIdx : 0;
      if (ev.key === 'ArrowDown') initialHighlightIndex = initialHighlightIndex + 1;
      else if (ev.key === 'ArrowUp') initialHighlightIndex = initialHighlightIndex - 1;
      openPopup(side, { initialHighlightIndex });
    }
  });
  // El tooltip (bonito) solo aparece al pasar cerca de la "i", no por toda la barra.
  badge.addEventListener('mouseenter', () => {
    if (!badge.hidden) showTooltip(badge, getUserForOrg(select.value));
  });
  badge.addEventListener('mouseleave', hideTooltip);

  wrapper.dataset.orgCdReady = '1';
  ui[side] = { wrapper, container, select, trigger, label, badge, popup, highlightIndex: 0 };
}

/** Inicializa los desplegables personalizados y hace el primer refresco. */
export function initOrgUserDropdowns() {
  for (const { side, selectId, wrapperSel } of SIDES) {
    buildSideUi(side, selectId, wrapperSel);
  }
  refreshOrgUserDropdowns();
}
