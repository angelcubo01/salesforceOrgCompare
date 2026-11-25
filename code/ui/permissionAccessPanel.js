import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { t } from '../../shared/i18n.js';
import {
  buildPermissionPreview,
  resolveDesiredPermissions
} from '../../shared/permissionAccessCore.js';
import { guardToolAction } from './featureControlsUi.js';
import { confirmSfocOrgAction } from './sfocModal.js';
import { getSelectedArtifactType } from './artifactTypeUi.js';

const OBJECT_KEYS = ['read', 'create', 'edit', 'delete', 'viewAllRecords', 'modifyAllRecords', 'viewAllFields'];
const FIELD_KEYS = ['read', 'edit'];
const PERMISSION_ICONS = Object.freeze({
  read: 'shield-check',
  create: 'file-code-2',
  edit: 'settings',
  delete: 'trash',
  viewAllRecords: 'database-search',
  modifyAllRecords: 'shield-cog',
  viewAllFields: 'schema'
});
const PREVIEW_CHUNK_SIZE = 500;

const queue = new Map();
let selectedObject = null;
let selectedResource = null;
let describedFields = [];
let targets = [];
let targetOrgId = '';
let matrixRows = [];
let lastResults = [];
let operationCounter = 0;
let matrixRequestVersion = 0;
let objectSearchVersion = 0;
let initialized = false;

const byId = (id) => document.getElementById(id);

function status(message, kind = '') {
  const element = byId('permissionAccessStatus');
  if (!element) return;
  element.textContent = message || '';
  element.dataset.kind = kind;
}

function debounce(fn, wait = 180) {
  let timer = 0;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

function targetKey(target) {
  return `${target.type}:${target.id}`;
}

function resourceKey(resource) {
  return resource?.type === 'field'
    ? `field:${resource.objectApiName}.${resource.fieldApiName}`
    : `object:${resource?.objectApiName || ''}`;
}

function operationKey(target, resource) {
  return `${targetKey(target)}|${resourceKey(resource)}`;
}

function permissionKeys(resource = selectedResource) {
  return resource?.type === 'field' ? FIELD_KEYS : OBJECT_KEYS;
}

function permissionLabel(resource, key) {
  return t(resource?.type === 'field' && key === 'read'
    ? 'permissionAccess.permission.view'
    : `permissionAccess.permission.${key}`);
}

function objectDisplayValue(object = selectedObject) {
  return object ? `${object.label || object.name} (${object.name})` : '';
}

function fieldDisplayValue(fieldApiName = selectedResource?.fieldApiName) {
  if (!selectedObject || !fieldApiName) return '';
  const field = describedFields.find((item) => item.name === fieldApiName);
  return `${field?.label || fieldApiName} (${selectedObject.name}.${fieldApiName})`;
}

function createIcon(name, label = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('permission-access-column-icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  if (label) svg.setAttribute('aria-label', label);
  else svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#icon-${name}`);
  svg.appendChild(use);
  return svg;
}

function closeSuggestions(host, input, restoreFocus = false) {
  if (host) host.hidden = true;
  input?.setAttribute('aria-expanded', 'false');
  input?.removeAttribute('aria-activedescendant');
  input?.closest('.permission-access-combobox')?.classList.remove('slds-is-open');
  if (restoreFocus) input?.focus();
}

function closeSuggestionsOnOutsidePointer(event) {
  [
    ['permissionAccessObjectSearch', 'permissionAccessObjectSuggestions'],
    ['permissionAccessFieldSearch', 'permissionAccessFieldSuggestions']
  ].forEach(([inputId, hostId]) => {
    const input = byId(inputId);
    const host = byId(hostId);
    const search = input?.closest('.permission-access-search-wrap');
    if (!search?.contains(event.target)) closeSuggestions(host, input);
  });
}

function moveSuggestionFocus(host, input, current, offset) {
  const buttons = [...(host?.querySelectorAll('button:not(:disabled)') || [])];
  if (!buttons.length) return;
  const currentIndex = buttons.indexOf(current);
  const nextIndex = currentIndex < 0
    ? (offset > 0 ? 0 : buttons.length - 1)
    : (currentIndex + offset + buttons.length) % buttons.length;
  const next = buttons[nextIndex];
  next.focus();
  input?.setAttribute('aria-activedescendant', next.id);
}

function bindSuggestionKeyboard(inputId, hostId) {
  const input = byId(inputId);
  const host = byId(hostId);
  input?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeSuggestions(host, input);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveSuggestionFocus(host, input, null, event.key === 'ArrowDown' ? 1 : -1);
    }
  });
}

function renderSuggestions(host, items, onSelect, labelFn, options = {}) {
  if (!host) return;
  const input = document.querySelector(`[aria-controls="${host.id}"]`);
  host.replaceChildren();
  if (!items?.length && options.emptyLabel) {
    const empty = document.createElement('div');
    empty.className = 'permission-access-suggestion permission-access-suggestion-empty';
    empty.setAttribute('role', 'option');
    empty.setAttribute('aria-disabled', 'true');
    empty.textContent = options.emptyLabel;
    host.appendChild(empty);
  }
  for (const [index, item] of (items || []).entries()) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'permission-access-suggestion slds-listbox__option slds-listbox__option_plain';
    button.id = `${host.id}-option-${index}`;
    button.setAttribute('role', 'option');
    button.disabled = options.disabledFn?.(item) === true;
    if (options.iconName) button.appendChild(createIcon(options.iconName));
    const copy = document.createElement('span');
    copy.className = 'permission-access-suggestion-copy';
    const label = document.createElement('span');
    label.textContent = labelFn(item);
    copy.appendChild(label);
    const hint = options.hintFn?.(item);
    if (hint) {
      const secondary = document.createElement('small');
      secondary.textContent = hint;
      copy.appendChild(secondary);
    }
    button.appendChild(copy);
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => {
      void onSelect(item);
      closeSuggestions(host, input);
    });
    button.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeSuggestions(host, input, true);
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        moveSuggestionFocus(host, input, button, event.key === 'ArrowDown' ? 1 : -1);
      }
    });
    host.appendChild(button);
  }
  const open = !!items?.length || !!options.emptyLabel;
  host.hidden = !open;
  input?.setAttribute('aria-expanded', String(open));
  input?.closest('.permission-access-combobox')?.classList.toggle('slds-is-open', open);
}

async function searchObjects() {
  if (!state.leftOrgId) return;
  const requestVersion = ++objectSearchVersion;
  const input = byId('permissionAccessObjectSearch');
  const inputValue = String(input?.value || '').trim();
  const queryText = inputValue === objectDisplayValue() ? '' : inputValue;
  const response = await bg({
    type: 'permissionAccess:searchObjects', orgId: state.leftOrgId, queryText
  });
  if (requestVersion !== objectSearchVersion) return;
  if (!response.ok) {
    status(response.error || t('permissionAccess.loadObjectsError'), 'error');
    return;
  }
  renderSuggestions(
    byId('permissionAccessObjectSuggestions'),
    response.items,
    selectObject,
    (item) => `${item.label} (${item.name})`,
    { iconName: 'database', emptyLabel: t('permissionAccess.noObjectsMatch') }
  );
}

async function loadAllTargets() {
  if (!state.leftOrgId) return [];
  if (targetOrgId === state.leftOrgId && targets.length) return targets;
  const [profiles, permissionSets] = await Promise.all([
    bg({ type: 'permissionAccess:searchTargets', orgId: state.leftOrgId, targetType: 'Profile', queryText: '' }),
    bg({ type: 'permissionAccess:searchTargets', orgId: state.leftOrgId, targetType: 'PermissionSet', queryText: '' })
  ]);
  if (!profiles.ok) throw new Error(profiles.error || t('permissionAccess.loadTargetsError'));
  if (!permissionSets.ok) throw new Error(permissionSets.error || t('permissionAccess.loadTargetsError'));
  targets = [...(profiles.items || []), ...(permissionSets.items || [])];
  targetOrgId = state.leftOrgId;
  return targets;
}

function prepareFieldSearch() {
  const input = byId('permissionAccessFieldSearch');
  if (!input) return;
  input.disabled = false;
  input.value = '';
  input.setAttribute('aria-expanded', 'false');
  byId('permissionAccessFieldSuggestions')?.setAttribute('hidden', '');
}

function fieldUnavailableReason(field) {
  if (!field.permissionable) return t('permissionAccess.notPermissionable');
  if (field.required) return t('permissionAccess.requiredField');
  return '';
}

function searchFields() {
  const input = byId('permissionAccessFieldSearch');
  const inputValue = String(input?.value || '').trim();
  const query = (inputValue === fieldDisplayValue() ? '' : inputValue).toLocaleLowerCase();
  const matches = describedFields
    .filter((field) => !query || `${field.label || ''} ${field.name || ''} ${selectedObject?.name || ''}.${field.name || ''}`.toLocaleLowerCase().includes(query))
    .sort((left, right) => String(left.label || left.name).localeCompare(String(right.label || right.name)))
    .slice(0, 100);
  renderSuggestions(
    byId('permissionAccessFieldSuggestions'),
    matches,
    (field) => selectField(field.name),
    (field) => `${field.label} (${selectedObject?.name}.${field.name})`,
    {
      iconName: 'schema',
      disabledFn: (field) => !!fieldUnavailableReason(field),
      hintFn: fieldUnavailableReason,
      emptyLabel: t('permissionAccess.noFieldsMatch')
    }
  );
}

function invalidateObjectSelectionForSearch(inputValue) {
  if (!selectedObject || inputValue === objectDisplayValue()) return;
  matrixRequestVersion += 1;
  selectedObject = null;
  selectedResource = null;
  describedFields = [];
  matrixRows = [];
  setMatrixLoading(false);
  const fieldInput = byId('permissionAccessFieldSearch');
  if (fieldInput) { fieldInput.disabled = true; fieldInput.value = ''; }
  closeSuggestions(byId('permissionAccessFieldSuggestions'), fieldInput);
  renderMatrix();
  status(t('permissionAccess.ready'));
}

function invalidateFieldSelectionForSearch(inputValue) {
  if (selectedResource?.type !== 'field' || inputValue === fieldDisplayValue()) return false;
  matrixRequestVersion += 1;
  selectedResource = null;
  matrixRows = [];
  setMatrixLoading(false);
  renderMatrix();
  return true;
}

async function selectObject(object) {
  objectSearchVersion += 1;
  const objectApiName = object.name;
  selectedObject = object;
  selectedResource = { type: 'object', objectApiName };
  matrixRows = [];
  renderMatrix();
  const input = byId('permissionAccessObjectSearch');
  if (input) input.value = objectDisplayValue(object);
  const fieldInput = byId('permissionAccessFieldSearch');
  if (fieldInput) { fieldInput.disabled = true; fieldInput.value = ''; fieldInput.setAttribute('aria-expanded', 'false'); }
  byId('permissionAccessFieldSuggestions')?.setAttribute('hidden', '');
  status(t('permissionAccess.loadingFields'));
  const response = await bg({
    type: 'permissionAccess:describeObject', orgId: state.leftOrgId, objectApiName
  });
  if (selectedObject?.name !== objectApiName) return;
  if (!response.ok) {
    describedFields = [];
    status(response.error || t('permissionAccess.loadFieldsError'), 'error');
    return;
  }
  describedFields = response.object?.fields || [];
  prepareFieldSearch();
  await loadMatrix();
}

async function selectField(fieldApiName) {
  if (!selectedObject) return;
  selectedResource = fieldApiName
    ? { type: 'field', objectApiName: selectedObject.name, fieldApiName }
    : { type: 'object', objectApiName: selectedObject.name };
  const input = byId('permissionAccessFieldSearch');
  if (input) input.value = fieldApiName ? fieldDisplayValue(fieldApiName) : '';
  input?.setAttribute('aria-expanded', 'false');
  byId('permissionAccessFieldSuggestions')?.setAttribute('hidden', '');
  await loadMatrix();
}

function keepDesired(resource) {
  return Object.fromEntries(permissionKeys(resource).map((key) => [key, 'keep']));
}

function chunks(items, size) {
  const output = [];
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size));
  return output;
}

function setMatrixLoading(loading) {
  byId('permissionAccessMatrixLoading')?.classList.toggle('hidden', !loading);
  byId('permissionAccessMatrixGroups')?.classList.toggle('hidden', loading || !matrixRows.length);
  if (loading) byId('permissionAccessMatrixEmpty')?.classList.add('hidden');
}

async function loadMatrix() {
  const requestVersion = ++matrixRequestVersion;
  if (!state.leftOrgId || !selectedResource) return;
  setMatrixLoading(true);
  status(t('permissionAccess.loadingMatrix'));
  try {
    const allTargets = await loadAllTargets();
    const operations = allTargets.map((target, index) => ({
      operationId: `permission-matrix-${index + 1}`,
      target,
      resource: selectedResource,
      desired: keepDesired(selectedResource)
    }));
    const results = [];
    for (const block of chunks(operations, PREVIEW_CHUNK_SIZE)) {
      const response = await bg({
        type: 'permissionAccess:preview', orgId: state.leftOrgId, operations: block
      });
      if (!response.ok) throw new Error(response.error || t('permissionAccess.previewError'));
      results.push(...(response.results || []));
    }
    if (requestVersion !== matrixRequestVersion) return;
    matrixRows = results;
    renderMatrix();
    status(t('permissionAccess.matrixLoaded', {
      profiles: matrixRows.filter((row) => row.target.type === 'Profile').length,
      permissionSets: matrixRows.filter((row) => row.target.type === 'PermissionSet').length
    }), 'success');
  } catch (error) {
    if (requestVersion !== matrixRequestVersion) return;
    matrixRows = [];
    renderMatrix();
    status(error instanceof Error ? error.message : String(error), 'error');
  } finally {
    if (requestVersion === matrixRequestVersion) setMatrixLoading(false);
  }
}

function desiredForFinal(resource, current, final) {
  return Object.fromEntries(permissionKeys(resource).map((key) => [
    key,
    final[key] === current[key] ? 'keep' : final[key] ? 'grant' : 'revoke'
  ]));
}

function currentFinalForRow(row) {
  const queued = queue.get(operationKey(row.target, row.resource));
  return queued
    ? resolveDesiredPermissions(row.resource, row.current, queued.desired)
    : row.current;
}

function matrixHeader() {
  const row = document.createElement('tr');
  const target = document.createElement('th');
  target.scope = 'col';
  target.textContent = t('permissionAccess.target');
  row.appendChild(target);
  for (const key of permissionKeys(selectedResource)) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.className = 'permission-access-permission-head';
    const label = permissionLabel(selectedResource, key);
    th.title = label;
    th.appendChild(createIcon(PERMISSION_ICONS[key], label));
    const text = document.createElement('span');
    text.textContent = label;
    th.appendChild(text);
    row.appendChild(th);
  }
  return row;
}

function onMatrixCheckboxChange(row, changedCheckbox, rowElement) {
  const requested = {};
  for (const checkbox of rowElement.querySelectorAll('input[data-permission-key]')) {
    requested[checkbox.dataset.permissionKey] = checkbox.checked;
  }
  const desired = desiredForFinal(row.resource, row.current, requested);
  const final = resolveDesiredPermissions(row.resource, row.current, desired);
  const normalizedDesired = desiredForFinal(row.resource, row.current, final);
  for (const checkbox of rowElement.querySelectorAll('input[data-permission-key]')) {
    checkbox.checked = final[checkbox.dataset.permissionKey] === true;
  }
  const key = operationKey(row.target, row.resource);
  const changed = Object.values(normalizedDesired).some((value) => value !== 'keep');
  const existing = queue.get(key);
  if (changed) {
    queue.set(key, {
      operationId: existing?.operationId || `permission-access-${++operationCounter}`,
      target: row.target,
      resource: row.resource,
      desired: normalizedDesired,
      baseline: row.current
    });
  } else {
    queue.delete(key);
  }
  if (existing?.operationId) {
    lastResults = lastResults.filter((result) => result.operationId !== existing.operationId);
  }
  rowElement.classList.toggle('is-modified', changed);
  for (const checkbox of rowElement.querySelectorAll('input[data-permission-key]')) {
    checkbox.closest('td')?.classList.toggle(
      'is-modified',
      normalizedDesired[checkbox.dataset.permissionKey] !== 'keep'
    );
  }
  refreshLocalQueueResults();
  status(changed
    ? t('permissionAccess.changeQueued', { target: row.target.label || row.target.name })
    : t('permissionAccess.changeRemoved'), changed ? 'success' : '');
  changedCheckbox.focus();
}

function matrixRow(row) {
  const tr = document.createElement('tr');
  const queued = queue.get(operationKey(row.target, row.resource));
  tr.classList.toggle('is-modified', !!queued);
  const name = document.createElement('td');
  const title = document.createElement('strong');
  title.textContent = row.target.label || row.target.name;
  const meta = document.createElement('span');
  meta.className = 'permission-access-target-meta';
  const typeBadge = document.createElement('span');
  typeBadge.className = `permission-access-target-type is-${row.target.type === 'Profile' ? 'profile' : 'permission-set'}`;
  typeBadge.appendChild(createIcon(row.target.type === 'Profile' ? 'shield-lock' : 'shield-check'));
  const typeLabel = document.createElement('span');
  typeLabel.textContent = t(row.target.type === 'Profile'
    ? 'permissionAccess.profile'
    : 'permissionAccess.permissionSet');
  typeBadge.appendChild(typeLabel);
  meta.appendChild(typeBadge);
  name.append(title, meta);
  tr.appendChild(name);
  const final = currentFinalForRow(row);
  for (const key of permissionKeys(row.resource)) {
    const cell = document.createElement('td');
    cell.className = 'permission-access-checkbox-cell';
    cell.classList.toggle('is-modified', queued?.desired?.[key] && queued.desired[key] !== 'keep');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = final[key] === true;
    checkbox.dataset.permissionKey = key;
    checkbox.setAttribute('aria-label', `${row.target.label || row.target.name}: ${permissionLabel(row.resource, key)}`);
    checkbox.addEventListener('change', () => onMatrixCheckboxChange(row, checkbox, tr));
    cell.appendChild(checkbox);
    tr.appendChild(cell);
  }
  return tr;
}

function renderTargets() {
  const search = String(byId('permissionAccessTargetsSearch')?.value || '').trim().toLocaleLowerCase();
  const rows = matrixRows;
  const filtered = rows.filter((row) => {
    const typeLabel = t(row.target.type === 'Profile'
      ? 'permissionAccess.profile'
      : 'permissionAccess.permissionSet');
    return !search || `${row.target.label || ''} ${row.target.name || ''} ${typeLabel}`.toLocaleLowerCase().includes(search);
  });
  const head = byId('permissionAccessTargetsHead');
  const body = byId('permissionAccessTargetsBody');
  const count = byId('permissionAccessTargetsCount');
  const empty = byId('permissionAccessTargetsEmpty');
  if (head) head.replaceChildren(matrixHeader());
  if (body) body.replaceChildren(...filtered.map(matrixRow));
  if (count) count.textContent = t('permissionAccess.targetCounts', {
    visible: filtered.length,
    total: rows.length,
    profiles: rows.filter((row) => row.target.type === 'Profile').length,
    permissionSets: rows.filter((row) => row.target.type === 'PermissionSet').length
  });
  empty?.classList.toggle('hidden', filtered.length > 0);
}

function renderMatrix() {
  const groups = byId('permissionAccessMatrixGroups');
  const empty = byId('permissionAccessMatrixEmpty');
  const hasRows = matrixRows.length > 0;
  if (groups) {
    if (selectedResource?.type) groups.dataset.resourceType = selectedResource.type;
    else delete groups.dataset.resourceType;
  }
  groups?.classList.toggle('hidden', !hasRows);
  if (empty) {
    empty.textContent = t(selectedResource
      ? 'permissionAccess.noTargetsAvailable'
      : selectedObject
        ? 'permissionAccess.selectFieldPrompt'
        : 'permissionAccess.selectResourcePrompt');
    empty.classList.toggle('hidden', hasRows);
  }
  if (!hasRows) return;
  renderTargets();
}

function enabledPermissions(value, resource) {
  if (!value) return '—';
  const enabled = Object.entries(value)
    .filter(([, granted]) => granted === true)
    .map(([key]) => permissionLabel(resource, key));
  return enabled.length ? enabled.join(', ') : t('permissionAccess.none');
}

function resultLabel(result) {
  if (!result?.status) return t('permissionAccess.queued');
  const key = ['success', 'failed', 'unchanged', 'pending'].includes(result.status) ? result.status : 'pending';
  return t(`permissionAccess.status.${key}`);
}

function refreshLocalQueueResults() {
  const existingById = new Map(lastResults.map((result) => [result.operationId, result]));
  lastResults = [...queue.values()].map((operation) => {
    const existing = existingById.get(operation.operationId);
    if (existing?.status === 'success' || existing?.status === 'failed') return existing;
    return buildPermissionPreview(operation, operation.baseline || {});
  });
  renderQueue();
}

function renderQueue(results = lastResults) {
  const body = byId('permissionAccessQueueBody');
  const empty = byId('permissionAccessQueueEmpty');
  if (!body) return;
  const resultById = new Map((results || []).map((item) => [item.operationId, item]));
  body.replaceChildren();
  for (const [key, operation] of queue) {
    const result = resultById.get(operation.operationId);
    const row = document.createElement('tr');
    if (result?.status) row.dataset.status = result.status;
    const target = document.createElement('td');
    target.textContent = operation.target.label || operation.target.name;
    const resource = document.createElement('td');
    resource.textContent = operation.resource.type === 'field'
      ? `${operation.resource.objectApiName}.${operation.resource.fieldApiName}`
      : operation.resource.objectApiName;
    const current = document.createElement('td'); current.textContent = enabledPermissions(result?.current || operation.baseline, operation.resource);
    const final = document.createElement('td'); final.textContent = enabledPermissions(result?.final, operation.resource);
    const outcome = document.createElement('td');
    outcome.textContent = resultLabel(result);
    if (result?.error) { outcome.title = result.error; outcome.textContent += `: ${result.error}`; }
    const action = document.createElement('td');
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'sfoc-btn sfoc-btn--ghost permission-access-remove-btn';
    remove.appendChild(createIcon('trash'));
    remove.setAttribute('aria-label', t('permissionAccess.removeOperation'));
    remove.addEventListener('click', () => {
      queue.delete(key);
      lastResults = lastResults.filter((item) => item.operationId !== operation.operationId);
      renderQueue();
      renderMatrix();
    });
    action.appendChild(remove);
    row.append(target, resource, current, final, outcome, action);
    body.appendChild(row);
  }
  empty?.classList.toggle('hidden', queue.size > 0);
  const pending = lastResults.some((result) => result.status === 'pending' || result.status === 'unchanged');
  const apply = byId('permissionAccessApplyBtn');
  if (apply) apply.disabled = !pending;
}

async function previewQueue() {
  if (!state.leftOrgId || !queue.size) { renderQueue([]); return []; }
  status(t('permissionAccess.previewing'));
  const operations = [...queue.values()].map(({ operationId, target, resource, desired }) => ({
    operationId, target, resource, desired
  }));
  const response = await bg({ type: 'permissionAccess:preview', orgId: state.leftOrgId, operations });
  if (!response.ok) {
    status(response.error || t(`permissionAccess.error.${response.reason || 'generic'}`), 'error');
    return [];
  }
  lastResults = response.results || [];
  renderQueue();
  return lastResults;
}

function renderSummary(summary) {
  const element = byId('permissionAccessSummary');
  if (element) element.textContent = summary ? t('permissionAccess.summary', summary) : '';
}

async function applyOperations(operations, retry = false) {
  if (!state.leftOrgId || !operations.length || guardToolAction('deploy')) return;
  if (!retry) {
    const changeCount = lastResults.reduce((total, item) => total + Object.keys(item.changes || {}).length, 0);
    if (!changeCount) { status(t('permissionAccess.noPendingChanges')); return; }
    const confirmed = await confirmSfocOrgAction({
      orgId: state.leftOrgId,
      title: t('permissionAccess.confirmTitle'),
      description: t('permissionAccess.confirmDescription', { count: changeCount }),
      confirmLabel: t('permissionAccess.confirmApply'),
      risk: 'write',
      variant: 'destructive'
    });
    if (!confirmed) return;
  }
  const apply = byId('permissionAccessApplyBtn');
  const retryButton = byId('permissionAccessRetryBtn');
  if (apply) apply.disabled = true;
  if (retryButton) retryButton.disabled = true;
  status(t('permissionAccess.applying', { count: operations.length }));
  const response = await bg({ type: 'permissionAccess:applyBatch', orgId: state.leftOrgId, operations });
  if (!response.ok) {
    status(response.error || t(`permissionAccess.error.${response.reason || 'generic'}`), 'error');
  } else {
    const incoming = new Map((response.results || []).map((item) => [item.operationId, item]));
    lastResults = lastResults.map((item) => incoming.get(item.operationId) || item);
    renderQueue();
    renderSummary(response.summary);
    const failed = lastResults.filter((item) => item.status === 'failed');
    retryButton?.classList.toggle('hidden', failed.length === 0);
    status(failed.length ? t('permissionAccess.completedWithErrors', { count: failed.length }) : '', failed.length ? 'warning' : '');
  }
  if (retryButton) retryButton.disabled = false;
}

async function applyQueue() {
  const preview = await previewQueue();
  const operations = preview
    .filter((item) => item.status === 'pending')
    .map(({ operationId, target, resource, desired }) => ({ operationId, target, resource, desired }));
  await applyOperations(operations);
}

async function retryFailed() {
  const operations = lastResults
    .filter((item) => item.status === 'failed')
    .map(({ operationId, target, resource, desired }) => ({ operationId, target, resource, desired }));
  await applyOperations(operations, true);
}

function clearQueue() {
  queue.clear();
  lastResults = [];
  renderQueue();
  renderMatrix();
  renderSummary(null);
  byId('permissionAccessRetryBtn')?.classList.add('hidden');
  status(t('permissionAccess.queueCleared'));
}

function resetPanel() {
  matrixRequestVersion += 1;
  objectSearchVersion += 1;
  queue.clear();
  lastResults = [];
  selectedObject = null;
  selectedResource = null;
  describedFields = [];
  matrixRows = [];
  targets = [];
  targetOrgId = '';
  const objectInput = byId('permissionAccessObjectSearch');
  if (objectInput) objectInput.value = '';
  const fieldInput = byId('permissionAccessFieldSearch');
  if (fieldInput) { fieldInput.disabled = true; fieldInput.value = ''; fieldInput.setAttribute('aria-expanded', 'false'); }
  const targetsSearch = byId('permissionAccessTargetsSearch');
  if (targetsSearch) targetsSearch.value = '';
  byId('permissionAccessObjectSearch')?.setAttribute('aria-expanded', 'false');
  byId('permissionAccessObjectSuggestions')?.setAttribute('hidden', '');
  byId('permissionAccessFieldSuggestions')?.setAttribute('hidden', '');
  byId('permissionAccessRetryBtn')?.classList.add('hidden');
  renderQueue();
  renderMatrix();
  renderSummary(null);
  status(state.leftOrgId ? t('permissionAccess.ready') : t('common.selectLeftOrg'));
}

export function setupPermissionAccessPanel() {
  if (initialized || !byId('permissionAccessPanel')) return;
  initialized = true;
  const objectInput = byId('permissionAccessObjectSearch');
  const debouncedObjectSearch = debounce(searchObjects);
  objectInput?.addEventListener('input', (event) => {
    closeSuggestions(byId('permissionAccessObjectSuggestions'), objectInput);
    invalidateObjectSelectionForSearch(String(event.target.value || '').trim());
    debouncedObjectSearch();
  });
  objectInput?.addEventListener('focus', () => {
    if (selectedObject && objectInput.value === objectDisplayValue()) objectInput.select();
    void searchObjects();
  });
  bindSuggestionKeyboard('permissionAccessObjectSearch', 'permissionAccessObjectSuggestions');
  const debouncedFieldSearch = debounce(searchFields);
  byId('permissionAccessFieldSearch')?.addEventListener('input', (event) => {
    closeSuggestions(byId('permissionAccessFieldSuggestions'), event.target);
    const value = String(event.target.value || '').trim();
    const invalidated = invalidateFieldSelectionForSearch(value);
    if (!value && invalidated) void selectField('');
    debouncedFieldSearch();
  });
  byId('permissionAccessFieldSearch')?.addEventListener('focus', (event) => {
    if (selectedResource?.type === 'field' && event.target.value === fieldDisplayValue()) event.target.select();
    searchFields();
  });
  bindSuggestionKeyboard('permissionAccessFieldSearch', 'permissionAccessFieldSuggestions');
  document.addEventListener('pointerdown', closeSuggestionsOnOutsidePointer);
  byId('permissionAccessTargetsSearch')?.addEventListener('input', renderTargets);
  byId('permissionAccessApplyBtn')?.addEventListener('click', () => void applyQueue());
  byId('permissionAccessRetryBtn')?.addEventListener('click', () => void retryFailed());
  byId('permissionAccessClearBtn')?.addEventListener('click', clearQueue);
  resetPanel();
}

export async function refreshPermissionAccessPanel() {
  if (getSelectedArtifactType() !== 'PermissionAccess') return;
  resetPanel();
}
