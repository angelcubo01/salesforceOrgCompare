import {
  canEditRecordField,
  recordViewerEditorType,
  recordViewerPicklistOptions
} from '../shared/recordViewerCore.js';
import { getDateDisplayFormat } from '../shared/extensionSettings.js';
import { localDateTimeValueFromParts, parseLocalDateTimeParts } from '../shared/dateDisplay.js';
import { createDateTimePicker } from './ui/dateTimeRangePicker.js';
import {
  RECORD_VIEWER_QUICK_ACTIONS_KEY,
  buildRecordViewerQuickActionUpdates,
  normalizeRecordViewerQuickActions,
  recordViewerQuickActionsFor,
  recordViewerTargetPathKey
} from '../shared/recordViewerQuickActions.js';

const byId = (id) => document.getElementById(id);
const uid = (prefix) => `${prefix}-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
const clone = (value) => structuredClone(value);

function option(value, label) {
  const element = document.createElement('option');
  element.value = value;
  element.textContent = label;
  return element;
}

function fieldLabel(field) {
  return `${field.label || field.name} (${field.name})`;
}

function targetLabel(context, path, tr) {
  const base = context?.objectLabel || context?.objectApiName || tr('quickActionCurrentRecord');
  return path.length ? `${base} · ${path.join(' → ')}` : `${tr('quickActionCurrentRecord')} · ${base}`;
}

function editableFields(context) {
  return (context?.describe?.fields || []).filter((field) => canEditRecordField({
    objectPermissions: context.objectPermissions,
    recordAccess: context.recordAccess,
    field,
    orgReadOnly: context.orgReadOnly,
    writePolicyAllowed: true
  }).editable).sort((left, right) => fieldLabel(left).localeCompare(fieldLabel(right)));
}

function relatedFields(context) {
  return (context?.describe?.fields || []).filter((field) => (
    field.type === 'reference'
    && field.accessible !== false
    && field.valuePresent !== false
    && context.record?.[field.name]
  )).sort((left, right) => fieldLabel(left).localeCompare(fieldLabel(right)));
}

function createSearchPicker({ id, placeholder, emptyLabel, items, selectedValue, onSelect }) {
  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'record-viewer-quick-action-search';
  input.placeholder = placeholder;
  input.autocomplete = 'off';
  const itemByValue = new Map();
  for (const item of items) {
    itemByValue.set(item.value, item);
  }
  input.value = itemByValue.get(selectedValue)?.label || '';
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', id);
  const results = document.createElement('div');
  results.id = id;
  results.className = 'record-viewer-quick-action-search-results';
  results.setAttribute('role', 'listbox');
  results.hidden = true;
  let matchingItems = [];
  let activeIndex = -1;
  let blurTimer = null;
  const close = (remove = false) => {
    results.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    activeIndex = -1;
    if (remove) results.remove();
  };
  const select = (item) => {
    if (!item) return;
    input.value = item.label;
    close(true);
    onSelect(item.value);
  };
  const positionResults = () => {
    const bounds = input.getBoundingClientRect();
    const viewportPadding = 12;
    const below = window.innerHeight - bounds.bottom - viewportPadding;
    const above = bounds.top - viewportPadding;
    const openUpward = below < 150 && above > below;
    results.style.left = `${Math.max(viewportPadding, bounds.left)}px`;
    results.style.width = `${Math.min(bounds.width, window.innerWidth - Math.max(viewportPadding, bounds.left) - viewportPadding)}px`;
    results.style.maxHeight = `${Math.max(80, Math.min(232, (openUpward ? above : below)))}px`;
    results.style.top = openUpward ? 'auto' : `${bounds.bottom + 4}px`;
    results.style.bottom = openUpward ? `${window.innerHeight - bounds.top + 4}px` : 'auto';
  };
  const setActive = (index) => {
    const choices = [...results.querySelectorAll('[role="option"]')];
    activeIndex = Math.max(-1, Math.min(index, choices.length - 1));
    choices.forEach((choice, choiceIndex) => choice.classList.toggle('is-active', choiceIndex === activeIndex));
    if (activeIndex >= 0) {
      const choice = choices[activeIndex];
      input.setAttribute('aria-activedescendant', choice.id);
      choice.scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  };
  const render = (query = '') => {
    const normalized = String(query || '').trim().toLocaleLowerCase();
    matchingItems = items.filter((item) => !normalized || `${item.label} ${item.value}`.toLocaleLowerCase().includes(normalized)).slice(0, 100);
    results.replaceChildren();
    if (!matchingItems.length) {
      const empty = document.createElement('p');
      empty.className = 'record-viewer-quick-action-search-empty';
      empty.textContent = emptyLabel;
      results.append(empty);
    } else {
      matchingItems.forEach((item, index) => {
        const choice = document.createElement('button');
        choice.type = 'button';
        choice.id = `${id}-option-${index}`;
        choice.className = 'record-viewer-quick-action-search-result';
        choice.setAttribute('role', 'option');
        choice.setAttribute('aria-selected', 'false');
        choice.textContent = item.label;
        choice.addEventListener('mousedown', (event) => event.preventDefault());
        choice.addEventListener('click', () => select(item));
        results.append(choice);
      });
    }
    if (!results.isConnected) document.body.append(results);
    positionResults();
    results.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    setActive(-1);
  };
  input.addEventListener('input', () => render(input.value));
  input.addEventListener('focus', () => {
    if (blurTimer != null) { clearTimeout(blurTimer); blurTimer = null; }
    render('');
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (results.hidden) render(input.value);
      setActive(activeIndex + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (results.hidden) render(input.value);
      setActive(activeIndex - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      select(matchingItems[activeIndex] || items.find((item) => item.label === input.value || item.value === input.value));
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
    }
  });
  input.addEventListener('blur', () => {
    blurTimer = setTimeout(() => close(true), 100);
  });
  const wrap = document.createElement('span');
  wrap.className = 'record-viewer-quick-action-search-picker';
  wrap.append(input);
  return wrap;
}

function environmentName(environment) {
  return String(environment?.label || environment?.name || environment?.username || environment?.instanceUrl || environment?.id || '').trim();
}

function localDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value).slice(0, 19);
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function isoDateTimeFromPicker(value) {
  const parts = parseLocalDateTimeParts(value, getDateDisplayFormat());
  const date = new Date(parts ? localDateTimeValueFromParts(parts) : value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : value;
}

function createValueEditor(field, value, tr, onChange) {
  const editorType = recordViewerEditorType(field?.type);
  let input;
  let read;
  if (editorType === 'list' || editorType === 'booleanList') {
    input = document.createElement('select');
    const choices = editorType === 'booleanList'
      ? [
          ...(field.nillable ? [{ label: 'empty', value: '' }] : []),
          { label: 'true', value: 'true' },
          { label: 'false', value: 'false' }
        ]
      : recordViewerPicklistOptions(field, tr('emptyValue'));
    for (const choice of choices) input.append(option(choice.value, choice.label));
    input.value = value == null ? '' : editorType === 'booleanList' ? String(value).toLowerCase() : String(value);
    read = () => {
      if (input.value === '' && field.nillable) return null;
      return editorType === 'booleanList' ? input.value === 'true' : input.value;
    };
  } else if (editorType === 'textarea') {
    input = document.createElement('textarea');
    input.rows = 3;
    input.value = value == null ? '' : String(value);
    read = () => input.value;
  } else {
    input = document.createElement('input');
    input.type = editorType === 'number' ? 'number' : editorType === 'date' ? 'date' : editorType === 'datetime' ? 'datetime-local' : editorType === 'time' ? 'time' : 'text';
    if (editorType === 'datetime' || editorType === 'time') input.step = '1';
    input.value = editorType === 'datetime' ? localDateTime(value) : value == null ? '' : String(value).replace(/\.000Z$/, '');
    read = () => {
      if (!input.value && field.nillable && editorType !== 'input') return null;
      if (editorType === 'number') return input.value === '' ? null : Number(input.value);
      if (editorType === 'datetime') return isoDateTimeFromPicker(input.value);
      if (editorType === 'time') return input.value ? `${input.value.length === 5 ? `${input.value}:00` : input.value}.000Z` : null;
      return input.value;
    };
  }
  input.classList.add('record-viewer-quick-action-value');
  input.addEventListener('input', () => onChange(read()));
  input.addEventListener('change', () => onChange(read()));
  if (editorType === 'datetime') {
    input.id = uid('quick-action-datetime');
    createDateTimePicker(input);
    return input.parentElement || input;
  }
  return input;
}

export function createRecordViewerQuickActionsController(options) {
  const { bg, tr, getPayload, executeUpdates, setStatus } = options;
  let allActions = [];
  let modalDraft = null;
  let renderSequence = 0;
  let contexts = new Map();
  let availableEnvironments = [];
  let executing = false;

  const rootContext = () => getPayload();
  const applicableActions = () => {
    const current = rootContext();
    return current ? recordViewerQuickActionsFor(allActions, current.org?.id, current.objectApiName) : [];
  };

  async function readActions() {
    const stored = await chrome.storage.local.get(RECORD_VIEWER_QUICK_ACTIONS_KEY);
    allActions = normalizeRecordViewerQuickActions(stored?.[RECORD_VIEWER_QUICK_ACTIONS_KEY]);
    renderMenu();
  }

  async function writeActions() {
    allActions = normalizeRecordViewerQuickActions(allActions);
    await chrome.storage.local.set({ [RECORD_VIEWER_QUICK_ACTIONS_KEY]: allActions });
    renderMenu();
  }

  async function loadAvailableEnvironments(current) {
    const result = await bg({ type: 'listSavedOrgs' }).catch(() => null);
    const saved = Array.isArray(result?.orgs) ? result.orgs : [];
    const environments = saved.filter((environment) => String(environment?.id || '').trim());
    if (!environments.some((environment) => environment.id === current.org?.id) && current.org?.id) {
      environments.push(current.org);
    }
    availableEnvironments = environments;
  }

  function renderEnvironmentChecks() {
    const container = byId('recordViewerQuickActionEnvironments');
    container.replaceChildren();
    if (!modalDraft || !availableEnvironments.length) {
      const empty = document.createElement('p');
      empty.className = 'record-viewer-quick-action-environments-empty';
      empty.textContent = tr('quickActionNoEnvironments');
      container.append(empty);
      return;
    }
    const selected = new Set(modalDraft.environmentIds);
    const selector = document.createElement('details');
    selector.className = 'record-viewer-quick-action-environment-selector';
    const summary = document.createElement('summary');
    const summaryText = document.createElement('span');
    summary.append(summaryText);
    const panel = document.createElement('div');
    panel.className = 'record-viewer-quick-action-environment-panel';
    const selectAllLabel = document.createElement('label');
    selectAllLabel.className = 'record-viewer-quick-action-environment-all';
    const selectAll = document.createElement('input');
    selectAll.type = 'checkbox';
    const selectAllText = document.createElement('span');
    selectAllText.textContent = tr('quickActionAllEnvironments');
    selectAllLabel.append(selectAll, selectAllText);
    const list = document.createElement('div');
    list.className = 'record-viewer-quick-action-environment-list';
    const updateSummary = () => {
      const count = selected.size;
      const total = availableEnvironments.length;
      summaryText.textContent = count === total
        ? tr('quickActionAllEnvironmentsSelected', { count: total })
        : tr('quickActionEnvironmentsSelected', { count, total });
      selectAll.checked = count === total;
      selectAll.indeterminate = count > 0 && count < total;
    };
    selectAll.addEventListener('change', () => {
      selected.clear();
      if (selectAll.checked) availableEnvironments.forEach((environment) => selected.add(environment.id));
      modalDraft.environmentIds = [...selected];
      for (const checkbox of list.querySelectorAll('input[type="checkbox"]')) {
        checkbox.checked = selected.has(checkbox.value);
      }
      updateSummary();
    });
    for (const environment of availableEnvironments) {
      const label = document.createElement('label');
      label.className = 'record-viewer-quick-action-environment';
      label.title = environment.id;
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = environment.id;
      checkbox.checked = selected.has(environment.id);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selected.add(environment.id);
        else selected.delete(environment.id);
        modalDraft.environmentIds = [...selected];
        updateSummary();
      });
      const text = document.createElement('span');
      text.textContent = environmentName(environment);
      label.append(checkbox, text);
      list.append(label);
    }
    updateSummary();
    panel.append(selectAllLabel, list);
    selector.append(summary, panel);
    container.append(selector);
  }

  function closeMenu() {
    byId('recordViewerQuickActions').classList.remove('is-open');
    byId('recordViewerQuickActionsButton').setAttribute('aria-expanded', 'false');
  }

  function renderMenu() {
    const list = byId('recordViewerQuickActionsList');
    list.replaceChildren();
    const actions = applicableActions();
    if (!actions.length) {
      const empty = document.createElement('p');
      empty.className = 'record-viewer-quick-actions-empty';
      empty.textContent = tr('quickActionsEmpty');
      list.append(empty);
      return;
    }
    for (const action of actions) {
      const row = document.createElement('div');
      row.className = 'record-viewer-quick-action-row';
      row.setAttribute('role', 'none');
      const run = document.createElement('button');
      run.type = 'button';
      run.className = 'record-viewer-quick-action-run';
      run.setAttribute('role', 'menuitem');
      const name = document.createElement('strong');
      name.textContent = action.name;
      const detail = document.createElement('small');
      detail.textContent = tr('quickActionUpdatesCount', { count: action.operations.length });
      run.append(name, detail);
      run.addEventListener('click', () => void execute(action));
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'record-viewer-quick-action-edit';
      edit.textContent = '✎';
      edit.title = tr('quickActionEdit');
      edit.setAttribute('aria-label', tr('quickActionEdit'));
      edit.addEventListener('click', (event) => { event.stopPropagation(); void openModal(action); });
      row.append(run, edit);
      list.append(row);
    }
  }

  async function ensureContext(path) {
    const key = recordViewerTargetPathKey(path);
    if (contexts.has(key)) return contexts.get(key);
    const current = rootContext();
    if (!current) throw new Error(tr('quickActionTargetUnavailable'));
    const result = await bg({
      type: 'recordViewer:resolveTarget',
      requestId: current.requestId,
      ...current.direct,
      path
    });
    if (!result?.ok || !result.target) throw new Error(result?.error || tr('quickActionTargetUnavailable'));
    contexts.set(key, result.target);
    return result.target;
  }

  async function execute(action) {
    if (executing) return;
    executing = true;
    const launcher = byId('recordViewerQuickActions');
    launcher.classList.add('is-executing', 'is-dismissed');
    closeMenu();
    byId('recordViewerQuickActionsButton').focus({ preventScroll: true });
    setStatus(tr('quickActionPreparing', { name: action.name }));
    try {
      const resolved = await Promise.all(action.operations.map(async (operation) => {
        const context = await ensureContext(operation.path);
        const field = (context.describe?.fields || []).find((candidate) => candidate.name === operation.field);
        if (!field) throw new Error(tr('quickActionFieldMissing', { field: operation.field }));
        const decision = canEditRecordField({
          objectPermissions: context.objectPermissions,
          recordAccess: context.recordAccess,
          field,
          orgReadOnly: context.orgReadOnly,
          writePolicyAllowed: true
        });
        if (!decision.editable) throw new Error(tr('quickActionFieldNotEditable', { field: operation.field }));
        return { operation, context, field };
      }));
      const result = await executeUpdates(action, buildRecordViewerQuickActionUpdates(resolved));
      if (result?.cancelled) return;
      if (!result?.ok) throw new Error(result?.error || tr('quickActionFailed', { name: action.name }));
      setStatus(tr('quickActionCompleted', { name: action.name }));
    } catch (error) {
      setStatus(String(error?.message || error), true);
    } finally {
      executing = false;
      launcher.classList.remove('is-executing');
    }
  }

  function closeModal() {
    byId('recordViewerQuickActionModal').classList.add('hidden');
    modalDraft = null;
  }

  async function openModal(action = null) {
    const current = rootContext();
    if (!current) return;
    closeMenu();
    await loadAvailableEnvironments(current);
    modalDraft = action ? clone(action) : {
      id: uid('quick-action'),
      name: '',
      environmentIds: availableEnvironments.map((environment) => environment.id),
      objectApiName: current.objectApiName,
      operations: [{ id: uid('operation'), path: [], field: '', value: '' }]
    };
    modalDraft.environmentIds = Array.isArray(modalDraft.environmentIds) && modalDraft.environmentIds.length
      ? modalDraft.environmentIds
      : availableEnvironments.map((environment) => environment.id);
    modalDraft.objectApiName = current.objectApiName;
    byId('recordViewerQuickActionModalTitle').textContent = action ? tr('quickActionEditTitle') : tr('quickActionNewTitle');
    byId('recordViewerQuickActionDelete').classList.toggle('hidden', !action);
    byId('recordViewerQuickActionName').value = modalDraft.name;
    renderEnvironmentChecks();
    byId('recordViewerQuickActionModalError').textContent = '';
    byId('recordViewerQuickActionModal').classList.remove('hidden');
    void renderOperations();
    requestAnimationFrame(() => byId('recordViewerQuickActionName').focus());
  }

  async function renderOperations() {
    if (!modalDraft) return;
    const sequence = ++renderSequence;
    const container = byId('recordViewerQuickActionOperations');
    container.replaceChildren();
    for (const [index, operation] of modalDraft.operations.entries()) {
      const card = document.createElement('article');
      card.className = 'record-viewer-quick-action-operation';
      const header = document.createElement('header');
      const title = document.createElement('strong');
      title.textContent = tr('quickActionUpdateNumber', { number: index + 1 });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.title = tr('quickActionRemoveUpdate');
      remove.disabled = modalDraft.operations.length === 1;
      remove.addEventListener('click', () => {
        modalDraft.operations.splice(index, 1);
        void renderOperations();
      });
      header.append(title, remove);
      const loading = document.createElement('p');
      loading.className = 'record-viewer-quick-action-loading';
      loading.textContent = tr('quickActionLoadingTarget');
      card.append(header, loading);
      container.append(card);
      try {
        const context = await ensureContext(operation.path);
        if (sequence !== renderSequence || !modalDraft) return;
        loading.remove();

        const target = document.createElement('div');
        target.className = 'record-viewer-quick-action-target';
        const targetName = document.createElement('span');
        targetName.textContent = targetLabel(context, operation.path, tr);
        target.append(targetName);
        if (operation.path.length) {
          const back = document.createElement('button');
          back.type = 'button';
          back.textContent = tr('quickActionRelationBack');
          back.addEventListener('click', () => {
            operation.path.pop();
            operation.field = '';
            operation.value = '';
            void renderOperations();
          });
          target.append(back);
        }

        const relationLabel = document.createElement('div');
        relationLabel.className = 'record-viewer-form-field';
        const relationText = document.createElement('span');
        relationText.textContent = tr('quickActionRelatedTarget');
        const relation = createSearchPicker({
          id: uid('quick-action-relation-options'),
          placeholder: tr('quickActionSearchRelation'),
          emptyLabel: tr('quickActionSearchNoResults'),
          items: relatedFields(context).map((field) => ({ value: field.name, label: fieldLabel(field) })),
          selectedValue: '',
          onSelect: (relationName) => {
          if (!relationName) return;
          operation.path.push(relationName);
          operation.field = '';
          operation.value = '';
          void renderOperations();
          }
        });
        relationLabel.append(relationText, relation);

        const fieldWrap = document.createElement('div');
        fieldWrap.className = 'record-viewer-form-field';
        const fieldText = document.createElement('span');
        fieldText.textContent = tr('quickActionField');
        const fields = editableFields(context);
        const fieldSelect = createSearchPicker({
          id: uid('quick-action-field-options'),
          placeholder: tr('quickActionSearchField'),
          emptyLabel: tr('quickActionSearchNoResults'),
          items: fields.map((field) => ({ value: field.name, label: fieldLabel(field) })),
          selectedValue: operation.field,
          onSelect: (fieldName) => {
            operation.field = fieldName;
            const field = fields.find((candidate) => candidate.name === operation.field);
            operation.value = field?.type === 'boolean' ? false : field?.nillable ? null : '';
            void renderOperations();
          }
        });
        fieldWrap.append(fieldText, fieldSelect);

        const valueWrap = document.createElement('label');
        valueWrap.className = 'record-viewer-form-field';
        const valueText = document.createElement('span');
        valueText.textContent = tr('quickActionValue');
        valueWrap.append(valueText);
        const selectedField = fields.find((field) => field.name === operation.field);
        if (selectedField) {
          valueWrap.append(createValueEditor(selectedField, operation.value, tr, (value) => { operation.value = value; }));
        } else {
          const placeholder = document.createElement('input');
          placeholder.disabled = true;
          placeholder.placeholder = tr('quickActionSelectFieldFirst');
          valueWrap.append(placeholder);
        }
        card.append(target, relationLabel, fieldWrap, valueWrap);
      } catch (error) {
        loading.classList.add('is-error');
        loading.textContent = String(error?.message || error);
      }
    }
  }

  async function saveModal() {
    if (!modalDraft) return;
    modalDraft.name = byId('recordViewerQuickActionName').value.trim();
    modalDraft.objectApiName = rootContext()?.objectApiName || '';
    const error = !modalDraft.name
      ? tr('quickActionNameRequired')
      : !modalDraft.environmentIds.length
        ? tr('quickActionEnvironmentsRequired')
      : modalDraft.operations.some((operation) => !operation.field)
        ? tr('quickActionFieldsRequired')
        : '';
    if (error) {
      byId('recordViewerQuickActionModalError').textContent = error;
      return;
    }
    const existing = allActions.findIndex((action) => action.id === modalDraft.id);
    if (existing >= 0) allActions[existing] = clone(modalDraft);
    else allActions.push(clone(modalDraft));
    await writeActions();
    closeModal();
    setStatus(tr('quickActionConfigurationSaved'));
  }

  async function deleteModalAction() {
    if (!modalDraft || !window.confirm(tr('quickActionDeleteConfirm', { name: modalDraft.name }))) return;
    allActions = allActions.filter((action) => action.id !== modalDraft.id);
    await writeActions();
    closeModal();
    setStatus(tr('quickActionDeleted'));
  }

  function bindUi() {
    const launcher = byId('recordViewerQuickActions');
    const button = byId('recordViewerQuickActionsButton');
    const setOpen = (open) => {
      launcher.classList.toggle('is-open', open);
      button.setAttribute('aria-expanded', String(open));
    };
    launcher.addEventListener('pointerenter', () => {
      if (executing) return;
      launcher.classList.remove('is-dismissed');
      setOpen(true);
    });
    launcher.addEventListener('pointerleave', () => {
      setOpen(false);
    });
    launcher.addEventListener('focusin', () => {
      if (executing) return;
      launcher.classList.remove('is-dismissed');
      setOpen(true);
    });
    launcher.addEventListener('focusout', (event) => { if (!launcher.contains(event.relatedTarget)) setOpen(false); });
    button.addEventListener('click', () => {
      launcher.classList.remove('is-dismissed');
      setOpen(!launcher.classList.contains('is-open'));
    });
    byId('recordViewerQuickActionAdd').addEventListener('click', () => void openModal());
    byId('recordViewerQuickActionClose').addEventListener('click', closeModal);
    byId('recordViewerQuickActionCancel').addEventListener('click', closeModal);
    byId('recordViewerQuickActionModal').addEventListener('click', (event) => { if (event.target === event.currentTarget) closeModal(); });
    byId('recordViewerQuickActionAddChange').addEventListener('click', () => {
      if (!modalDraft || modalDraft.operations.length >= 25) return;
      modalDraft.operations.push({ id: uid('operation'), path: [], field: '', value: '' });
      void renderOperations();
    });
    byId('recordViewerQuickActionSave').addEventListener('click', () => void saveModal());
    byId('recordViewerQuickActionDelete').addEventListener('click', () => void deleteModalAction());
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !byId('recordViewerQuickActionModal').classList.contains('hidden')) closeModal();
    });
  }

  return {
    async init() {
      bindUi();
      await readActions();
    },
    setPayload(nextPayload) {
      contexts = new Map();
      if (nextPayload) contexts.set('', nextPayload);
      renderMenu();
    },
    openAction(actionId) {
      const action = applicableActions().find((item) => item.id === String(actionId || ''));
      if (action) void openModal(action);
    },
    pendingCount() {
      return 0;
    },
    hasPendingChanges() {
      return false;
    },
    discardAll() {
      // Las Quick Actions se ejecutan de forma inmediata y no dejan borradores.
    },
    updates() {
      return [];
    }
  };
}
