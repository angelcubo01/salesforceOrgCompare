import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { option } from '../core/persistence.js';
import { t } from '../../shared/i18n.js';
import { buildOrgPicklistLabel } from '../../shared/orgPrefs.js';

export async function loadSavedOrgs() {
  const [res, auth, extras] = await Promise.all([
    bg({ type: 'listSavedOrgs' }),
    bg({ type: 'auth:getStatuses' }),
    chrome.storage.sync.get(['orgAliases', 'orgGroups'])
  ]);
  state.authStatuses = auth.ok ? (auth.statuses || {}) : {};
  const aliases = extras.orgAliases || {};
  const groups = extras.orgGroups || {};
  const orgs = res.ok ? (res.orgs || []) : [];
  state.orgsList = orgs;
  const left = document.getElementById('leftOrg');
  const right = document.getElementById('rightOrg');
  left.innerHTML = '';
  right.innerHTML = '';
  left.appendChild(option('', t('orgs.none')));
  right.appendChild(option('', t('orgs.none')));
  const extrasForLabel = { aliases, groups };
  for (const o of orgs) {
    const label = buildOrgPicklistLabel(o, extrasForLabel);
    left.appendChild(option(o.id, label));
    right.appendChild(option(o.id, label));
  }
  if (!state.leftOrgId && orgs.length > 0) {
    state.leftOrgId = orgs[0].id;
    left.value = state.leftOrgId;
  }
  if (!state.rightOrgId && orgs.length >= 2) {
    state.rightOrgId = orgs[1].id;
    right.value = state.rightOrgId;
  }
  ensureRightOrgDistinctFromLeft();
  updateAuthIndicators();
}

/** Si izquierda y derecha son la misma org con ≥2 guardadas, asigna a la derecha otra distinta (p. ej. tras ?orgId=). */
export function ensureRightOrgDistinctFromLeft() {
  const orgs = state.orgsList || [];
  const right = document.getElementById('rightOrg');
  if (orgs.length < 2 || !state.leftOrgId || !state.rightOrgId) return;
  if (String(state.leftOrgId) !== String(state.rightOrgId)) return;
  const other = orgs.find((o) => String(o.id) !== String(state.leftOrgId));
  if (!other) return;
  state.rightOrgId = other.id;
  if (right) right.value = state.rightOrgId;
  updateAuthIndicators();
}

export function updateOrgDropdownLayout() {
  const leftDropdown = document.querySelector('.org-dropdown-left');
  const rightDropdown = document.querySelector('.org-dropdown-right');
  if (!leftDropdown || !rightDropdown) return;

  if (
    document.body.classList.contains('artifact-generate-package-xml') ||
    document.body.classList.contains('artifact-apex-tests')
  ) {
    rightDropdown.classList.add('hidden');
    leftDropdown.classList.remove('single-mode');
    return;
  }
  if (document.body.classList.contains('artifact-field-dependency')) {
    rightDropdown.classList.remove('hidden');
    leftDropdown.classList.remove('single-mode');
    return;
  }
  rightDropdown.classList.remove('hidden');

  if (!state.rightOrgId) {
    // Single org mode - left dropdown takes 2/3 width; right dropdown stays visible
    leftDropdown.classList.add('single-mode');
    rightDropdown.classList.remove('hidden');
  } else {
    // Dual org mode - both dropdowns visible with 50-50 split
    leftDropdown.classList.remove('single-mode');
    rightDropdown.classList.remove('hidden');
  }
}

export function updateAuthIndicators() {
  const leftReauth = document.getElementById('leftReauthBtn');
  const rightReauth = document.getElementById('rightReauthBtn');
  const leftSelect = document.getElementById('leftOrg');
  const rightSelect = document.getElementById('rightOrg');

  const leftStatus = state.leftOrgId ? (state.authStatuses[state.leftOrgId] || 'expired') : null;
  const rightStatus = state.rightOrgId ? (state.authStatuses[state.rightOrgId] || 'expired') : null;

  // Left
  if (leftStatus) {
    leftSelect.classList.remove('auth-active', 'auth-expired');
    leftSelect.classList.add(leftStatus === 'active' ? 'auth-active' : 'auth-expired');
    if (leftStatus === 'expired') leftReauth.classList.remove('hidden');
    else leftReauth.classList.add('hidden');
  } else {
    leftSelect.classList.remove('auth-active', 'auth-expired');
    leftReauth.classList.add('hidden');
  }

  // Right
  if (rightStatus) {
    rightSelect.classList.remove('auth-active', 'auth-expired');
    rightSelect.classList.add(rightStatus === 'active' ? 'auth-active' : 'auth-expired');
    if (rightStatus === 'expired') rightReauth.classList.remove('hidden');
    else rightReauth.classList.add('hidden');
  } else {
    rightSelect.classList.remove('auth-active', 'auth-expired');
    rightReauth.classList.add('hidden');
  }
}

export async function refreshAuthStatuses() {
  const auth = await bg({ type: 'auth:getStatuses' });
  state.authStatuses = auth.ok ? (auth.statuses || {}) : {};
  updateAuthIndicators();
}
