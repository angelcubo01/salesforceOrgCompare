import { element as el, button, icon, link, loading, errorPanel, message } from './userManagementUi.js';
const key = (id) => String(id || '').slice(0, 15);
const searchText = (item) => [item.label, item.developerName, item.namespace, ...(item.sources || []).map((s) => s.label)].join(' ').toLocaleLowerCase();

/** Assigned-first view with an on-demand, paginated add panel. */
export function createUserPermissionSelector(opts) {
  const { document: doc, copy } = opts;
  const root = el(doc, 'section', 'sfoc-um-permissions');
  const toolbar = el(doc, 'div', 'sfoc-um-toolbar');
  const filter = el(doc, 'input', 'sfoc-um-input'); filter.type = 'search'; filter.placeholder = copy.search; filter.setAttribute('aria-label', copy.assigned + ': ' + copy.search);
  const count = el(doc, 'span', 'sfoc-um-count');
  const assignedList = el(doc, 'div', 'sfoc-um-permission-list');
  const availableHost = el(doc, 'section', 'sfoc-um-add-panel'); availableHost.hidden = true;
  const notice = el(doc, 'div'); const confirmation = el(doc, 'div');
  let data = opts.assigned || []; let available = []; let nextCursor = null;
  const chosen = new Map(); const removals = new Set(); let busy = false; let destroyed = false; let timer; let generation = 0; let query = ''; let addOpen = false;
  const selectedCount = el(doc, 'span', 'sfoc-um-count');
  const removeButton = button(doc, copy.remove, 'minus', () => confirmRemoval(), { variant: 'danger' });
  const addButton = button(doc, copy.add, 'plus', () => openAdd(), { variant: 'primary' });
  const refreshButton = button(doc, copy.refresh, 'refresh', () => opts.onRefresh(), { iconOnly: true });
  toolbar.append(filter, count, removeButton, addButton, refreshButton);
  const availableToolbar = el(doc, 'div', 'sfoc-um-toolbar');
  const availableFilter = el(doc, 'input', 'sfoc-um-input'); availableFilter.type = 'search'; availableFilter.maxLength = 100;
  availableFilter.placeholder = copy.search; availableFilter.setAttribute('aria-label', copy.available + ': ' + copy.search);
  const assignButton = button(doc, copy.assign, 'plus', () => mutate(false), { variant: 'success' });
  const closeAdd = button(doc, copy.close, 'close', () => closeAddPanel(), { iconOnly: true });
  const availableList = el(doc, 'div', 'sfoc-um-permission-list');
  const more = button(doc, copy.loadMore, 'plus', () => searchAvailable(true));
  const availableStatus = el(doc, 'div');
  availableToolbar.append(availableFilter, selectedCount, assignButton, closeAdd);
  availableHost.append(el(doc, 'h3', 'sfoc-um-section-title', copy.available), availableToolbar, availableStatus, availableList, more);
  root.append(toolbar, notice, confirmation, assignedList, availableHost, el(doc, 'p', 'sfoc-um-hint', copy.effectiveHint));
  const statusLabel = (item) => ({ Updated: copy.updated, Updating: copy.groupUpdating, Outdated: copy.groupOutdated, Failed: copy.groupFailed }[item.status] || item.status);
  function updateActions() {
    removeButton.disabled = busy || !removals.size;
    assignButton.disabled = busy || !chosen.size;
    assignButton.querySelector('span').textContent = copy.assign + (chosen.size ? ' ' + chosen.size : '');
    assignButton.setAttribute('aria-label', assignButton.textContent); assignButton.title = assignButton.textContent;
    selectedCount.textContent = chosen.size ? chosen.size + ' ' + copy.selected : '';
    removeButton.querySelector('span').textContent = copy.remove + (removals.size ? ' ' + removals.size : '');
    removeButton.setAttribute('aria-label', removeButton.textContent); removeButton.title = removeButton.textContent;
    addButton.disabled = busy; refreshButton.disabled = busy; more.disabled = busy;
  }
  function itemRow(item, availableSide) {
    const row = el(doc, 'div', 'sfoc-um-permission-row');
    const checkbox = el(doc, 'input'); checkbox.type = 'checkbox';
    const isAlreadyAssigned = availableSide && data.some((a) => a.direct && key(a.id) === key(item.id));
    const blocked = item.blockedReason || (isAlreadyAssigned ? 'DUPLICATE' : '');
    const canSelect = availableSide ? !blocked : item.direct && !item.profile;
    checkbox.disabled = busy || !canSelect; checkbox.checked = availableSide ? chosen.has(key(item.id)) : removals.has(key(item.id));
    checkbox.setAttribute('aria-label', (availableSide ? copy.assign : copy.remove) + ': ' + item.label);
    checkbox.title = canSelect ? item.label : (copy.errors[blocked] || copy.inheritedHint);
    checkbox.addEventListener('change', () => {
      if (availableSide) checkbox.checked ? chosen.set(key(item.id), item) : chosen.delete(key(item.id));
      else checkbox.checked ? removals.add(key(item.id)) : removals.delete(key(item.id));
      confirmation.replaceChildren(); updateActions();
    });
    const text = el(doc, 'div', 'sfoc-um-permission-text');
    text.append(el(doc, 'strong', '', item.label));
    const sources = el(doc, 'div', 'sfoc-um-tags');
    if (availableSide) {
      if (item.status) sources.append(el(doc, 'span', 'sfoc-um-tag', statusLabel(item)));
      if (blocked) sources.append(el(doc, 'span', 'sfoc-um-tag sfoc-um-tag--warning', copy.errors[blocked] || copy.unavailable));
    } else for (const source of item.sources || []) {
      const tag = el(doc, 'span', 'sfoc-um-tag' + (source.type === 'direct' ? ' sfoc-um-tag--direct' : ''));
      tag.append(icon(doc, source.type === 'group' ? 'group' : 'shield'), doc.createTextNode(source.type === 'direct' ? copy.direct : source.type === 'profile' ? copy.viaProfile : copy.viaGroup + ': ' + source.label));
      sources.append(tag);
    }
    if (!availableSide && item.status) sources.append(el(doc, 'span', 'sfoc-um-tag', statusLabel(item)));
    text.append(sources);
    row.append(checkbox, text, link(doc, copy.open + ': ' + item.label, opts.openPath(item.id)));
    return row;
  }
  function renderAssigned() {
    const filtered = data.filter((item) => searchText(item).includes(filter.value.toLocaleLowerCase().trim()));
    count.textContent = filtered.length + ' / ' + data.length;
    assignedList.replaceChildren(...filtered.map((item) => itemRow(item, false)));
    if (!filtered.length) assignedList.append(el(doc, 'p', 'sfoc-um-empty', copy.emptyAssigned));
    updateActions();
  }
  function renderAvailable() {
    availableList.replaceChildren(...available.map((item) => itemRow(item, true)));
    if (!available.length) availableList.append(el(doc, 'p', 'sfoc-um-empty', copy.emptyAvailable));
    more.hidden = !nextCursor; updateActions();
  }
  async function searchAvailable(append = false) {
    const token = ++generation; const cursor = append ? nextCursor : null;
    if (!append) { available = []; availableList.replaceChildren(); nextCursor = null; }
    availableStatus.replaceChildren(loading(doc, copy)); more.disabled = true;
    const response = await opts.search({ query, cursor });
    if (destroyed || token !== generation) return;
    availableStatus.replaceChildren();
    if (!response?.ok) { availableStatus.append(errorPanel(doc, copy, response?.reason, () => searchAvailable(append))); return; }
    available = append ? [...available, ...response.items] : response.items;
    nextCursor = response.nextCursor; renderAvailable();
  }
  function closeAddPanel() { addOpen = false; availableHost.hidden = true; ++generation; clearTimeout(timer); addButton.focus(); }
  function openAdd() {
    addOpen = true; availableHost.hidden = false; availableFilter.focus();
    if (!available.length) void searchAvailable();
  }
  function confirmRemoval() {
    confirmation.replaceChildren();
    const panel = message(doc, copy.confirmRemove, 'warning');
    panel.append(el(doc, 'p', 'sfoc-um-hint', copy.removalHint),
      button(doc, copy.cancel, 'close', () => confirmation.replaceChildren()),
      button(doc, copy.remove + ' ' + removals.size, 'minus', () => mutate(true), { variant: 'danger' }));
    confirmation.append(panel); panel.querySelector('button').focus();
  }
  async function mutate(remove) {
    if (busy) return;
    busy = true; confirmation.replaceChildren(); notice.replaceChildren(loading(doc, { ...copy, loading: copy.saving }));
    const selected = remove ? data.filter((i) => removals.has(key(i.id))) : [...chosen.values()];
    const ids = remove ? selected.flatMap((i) => i.assignmentIds) : selected.map((i) => i.id);
    renderAssigned(); renderAvailable();
    let result;
    try { result = await (remove ? opts.remove(ids) : opts.assign(ids)); }
    catch { result = { ok: false, reason: 'API_ERROR' }; }
    if (destroyed) return;
    busy = false; notice.replaceChildren();
    if (!result?.ok) notice.append(errorPanel(doc, copy, result?.reason));
    else {
      notice.append(message(doc, result.partial ? copy.partial : copy.done, result.partial ? 'warning' : 'success'));
      for (const item of selected) {
        const succeeded = remove ? item.assignmentIds.every((id) => result.results.some((r) => key(r.id) === key(id) && r.ok)) : result.results.some((r) => key(r.id) === key(item.id) && r.ok);
        if (succeeded) { chosen.delete(key(item.id)); removals.delete(key(item.id)); }
      }
      for (const failure of result.results.filter((r) => !r.ok)) {
        const item = selected.find((i) => key(i.id) === key(failure.id) || i.assignmentIds.some((a) => key(a) === key(failure.id)));
        notice.append(message(doc, (item?.label || failure.id) + ': ' + (copy.errors[failure.reason] || copy.errors.API_ERROR), 'error'));
      }
    }
    renderAssigned(); renderAvailable();
  }
  filter.addEventListener('input', renderAssigned);
  availableFilter.addEventListener('input', () => {
    query = availableFilter.value; ++generation; clearTimeout(timer); timer = setTimeout(() => searchAvailable(), 250);
  });
  renderAssigned();
  return {
    element: root,
    update(next, partial = false) { data = next; renderAssigned(); if (addOpen) renderAvailable(); if (partial) notice.replaceChildren(message(doc, copy.partialData, 'warning')); },
    escape() { if (confirmation.childElementCount) { confirmation.replaceChildren(); removeButton.focus(); return true; } if (addOpen) { closeAddPanel(); return true; } return false; },
    destroy() { destroyed = true; ++generation; clearTimeout(timer); }
  };
}
