import { escapeHtml } from '../../../shared/htmlEscape.js';
import { formatLogSize, formatMs } from '../../../shared/apexLogParser.js';

function card(item, t) {
  const meta = item.meta || {};
  return `<button type="button" class="apex-log-compare-candidate" data-compare-log="${escapeHtml(item.id)}">
    <span class="apex-log-compare-candidate__title">${escapeHtml(meta.name || item.title || t('apexLogViewer.compare.unknownEntry'))}</span>
    <span class="apex-log-compare-candidate__details">${escapeHtml(meta.user || '—')} · ${escapeHtml(meta.type || '—')} · ${escapeHtml(meta.result || '—')}</span>
    <span class="apex-log-compare-candidate__details">${escapeHtml(meta.method || '—')} · ${formatLogSize(Number(meta.sizeBytes) || 0)} · ${formatMs(Number(meta.durationMs) || 0)}</span>
  </button>`;
}

function candidateMatchesEntry(item, expectedEntry) {
  if (!expectedEntry?.key) return true;
  const name = String(item?.meta?.name || '').trim()
    .replace(/\([^)]*\)$/, '')
    .split('.')[0]
    .trim()
    .toLowerCase();
  // Un candidato sin punto de entrada confirmado no se ofrece: evita cargar otra clase.
  return Boolean(name) && name === String(expectedEntry.key).toLowerCase();
}

function showIncompatibleLogModal(t, expectedEntry, actualEntry) {
  const dialog = document.createElement('dialog');
  dialog.className = 'apex-log-compare-incompatible-dialog';
  const expected = [expectedEntry?.type, expectedEntry?.name, expectedEntry?.method !== 'N/A' ? expectedEntry?.method : ''].filter(Boolean).join(' · ');
  const actual = [actualEntry?.type, actualEntry?.name, actualEntry?.method !== 'N/A' ? actualEntry?.method : ''].filter(Boolean).join(' · ');
  dialog.innerHTML = `<form method="dialog" class="apex-log-compare-incompatible-dialog__body"><header><span class="apex-log-compare-incompatible-dialog__icon" aria-hidden="true">!</span><div><h2>${escapeHtml(t('apexLogViewer.compare.incompatibleTitle'))}</h2><p>${escapeHtml(t('apexLogViewer.compare.incompatibleHelp'))}</p></div></header><dl><div><dt>${escapeHtml(t('apexLogViewer.compare.currentRoute'))}</dt><dd>${escapeHtml(expected || '—')}</dd></div><div><dt>${escapeHtml(t('apexLogViewer.compare.selectedRoute'))}</dt><dd>${escapeHtml(actual || '—')}</dd></div></dl><footer><button type="submit" class="apex-log-viewer-download">${escapeHtml(t('apexLogViewer.compare.accept'))}</button></footer></form>`;
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
}

/** Modal equivalente a la carga local de Debug Logs, con selector de org para logs remotos. */
export function openComparisonSelector({ t, loadCandidates, onPick, orgs = [], initialOrgId = '', comparisonEntry = null }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'apex-log-compare-dialog';
  const orgLabel = (org) => String(org?.label || org?.displayName || org?.instanceUrl || org?.id || '');
  const selectedOrg = orgs.find((org) => org.id === initialOrgId) || orgs[0] || null;
  const options = orgs.map((org) => `<option value="${escapeHtml(org.id)}" ${org.id === selectedOrg?.id ? 'selected' : ''}>${escapeHtml(orgLabel(org))}</option>`).join('');
  const pickerRows = orgs.map((org) => `<button type="button" role="option" aria-selected="${org.id === selectedOrg?.id}" class="apex-log-compare-org-row${org.id === selectedOrg?.id ? ' is-selected' : ''}${org.authStatus === 'active' ? ' is-connected' : ' is-disconnected'}" data-org-choice="${escapeHtml(org.id)}"><span>${escapeHtml(orgLabel(org))}</span></button>`).join('');
  dialog.innerHTML = `<form method="dialog" class="apex-log-compare-dialog__body">
    <header class="apex-log-compare-dialog__header"><div><h2>${escapeHtml(t('apexLogViewer.compare.title'))}</h2><p>${escapeHtml(t('apexLogViewer.compare.help'))}</p></div><button class="apex-log-compare-dialog__icon" value="cancel" aria-label="${escapeHtml(t('apexLogViewer.compare.cancel'))}">×</button></header>
    <section class="apex-log-compare-upload">
      <input data-file type="file" accept=".log,text/plain" hidden>
      <button type="button" class="apex-log-compare-dropzone" data-local>
        <strong>${escapeHtml(t('apexLogViewer.compare.localTitle'))}</strong><span>${escapeHtml(t('apexLogViewer.compare.localHint'))}</span>
      </button>
    </section>
    <div class="apex-log-compare-divider"><span>${escapeHtml(t('apexLogViewer.compare.orRemote'))}</span></div>
    <section class="apex-log-compare-remote">
      <label for="apexLogCompareOrg">${escapeHtml(t('apexLogViewer.compare.orgLabel'))}</label>
      <div class="apex-log-compare-org-picker" data-org-picker>
        <button type="button" class="apex-log-compare-org-trigger${selectedOrg?.authStatus === 'active' ? ' is-connected' : ''}" data-org-trigger aria-haspopup="listbox" aria-expanded="false"><span data-org-label>${escapeHtml(orgLabel(selectedOrg) || t('apexLogViewer.compare.noOrgs'))}</span><span class="apex-log-compare-org-info" aria-hidden="true">i</span></button>
        <div class="apex-log-compare-org-popup" data-org-popup role="listbox" hidden>${pickerRows || `<span class="apex-log-compare-empty">${escapeHtml(t('apexLogViewer.compare.noOrgs'))}</span>`}</div>
        <select id="apexLogCompareOrg" data-org hidden>${options || `<option value="">${escapeHtml(t('apexLogViewer.compare.noOrgs'))}</option>`}</select>
      </div>
      <div class="apex-log-compare-candidates" aria-live="polite" data-candidates></div>
    </section>
    <footer><button value="cancel">${escapeHtml(t('apexLogViewer.compare.cancel'))}</button></footer>
  </form>`;
  document.body.append(dialog);
  dialog.showModal();
  const list = dialog.querySelector('[data-candidates]');
  const orgSelect = dialog.querySelector('[data-org]');
  const orgPicker = dialog.querySelector('[data-org-picker]');
  const orgTrigger = dialog.querySelector('[data-org-trigger]');
  const orgPopup = dialog.querySelector('[data-org-popup]');
  const close = () => {
    if (dialog.open) dialog.close();
    // El selector puede tener una carga remota pendiente. Retirarlo evita que
    // una actualización asíncrona vuelva a dejar el modal visible tras aceptar Log B.
    queueMicrotask(() => { if (dialog.isConnected) dialog.remove(); });
  };
  dialog.addEventListener('close', () => dialog.remove());
  let items = [];
  let visibleCount = 10;
  let requestedLimit = 20;
  let hasMore = false;
  const showMessage = (key) => { list.innerHTML = `<p class="apex-log-compare-empty">${escapeHtml(t(key))}</p>`; };
  const pick = async (item, button) => {
    try {
      if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
      const outcome = await onPick(item);
      if (outcome?.accepted === true || outcome === true) {
        close();
        return;
      }
      else if (outcome?.reason === 'differentClass') {
        if (outcome?.source === 'local') showIncompatibleLogModal(t, outcome.expectedEntry || comparisonEntry, outcome.actualEntry);
        else showMessage('apexLogViewer.compare.differentClass');
      }
      else if (outcome?.reason === 'notReady') showMessage('apexLogViewer.compare.notReady');
    } catch { showMessage('apexLogViewer.compare.loadError'); }
    finally { if (button) { button.disabled = false; button.removeAttribute('aria-busy'); } }
  };
  const renderList = () => {
    if (!items.length) {
      list.innerHTML = `<p class="apex-log-compare-empty">${escapeHtml(t('apexLogViewer.compare.emptyCompatible'))}</p>${hasMore ? `<button type="button" class="apex-log-viewer-download apex-log-compare-load-more" data-load-more>${escapeHtml(t('apexLogViewer.compare.loadMore'))}</button>` : ''}`;
    }
    const cards = items.slice(0, visibleCount).map((item) => card(item, t)).join('');
    const more = visibleCount < items.length || hasMore
      ? `<button type="button" class="apex-log-viewer-download apex-log-compare-load-more" data-load-more>${escapeHtml(t('apexLogViewer.compare.loadMore'))}</button>`
      : '';
    if (items.length) list.innerHTML = `${cards}${more}`;
    list.querySelectorAll('[data-compare-log]').forEach((button) => button.addEventListener('click', () => {
      const item = items.find((candidate) => candidate.id === button.dataset.compareLog);
      if (item) void pick(item, button);
    }));
    list.querySelector('[data-load-more]')?.addEventListener('click', async (buttonEvent) => {
      const button = buttonEvent.currentTarget;
      if (visibleCount < items.length) { visibleCount += 10; renderList(); return; }
      if (!hasMore) return;
      button.disabled = true;
      requestedLimit = Math.min(100, requestedLimit + 20);
      try {
        const response = await loadCandidates(orgSelect?.value || '', requestedLimit);
        items = (response?.items || response || []).filter((item) => candidateMatchesEntry(item, comparisonEntry));
        hasMore = Boolean(response?.hasMore);
        visibleCount += 10;
        renderList();
      } catch { showMessage('apexLogViewer.compare.loadError'); }
    });
  };
  const closeOrgPicker = () => {
    if (!orgPopup) return;
    orgPopup.hidden = true;
    orgTrigger?.setAttribute('aria-expanded', 'false');
  };
  orgTrigger?.addEventListener('click', () => {
    if (!orgPopup) return;
    orgPopup.hidden = !orgPopup.hidden;
    orgTrigger.setAttribute('aria-expanded', String(!orgPopup.hidden));
  });
  orgPicker?.querySelectorAll('[data-org-choice]').forEach((choice) => choice.addEventListener('click', () => {
    const id = choice.dataset.orgChoice || '';
    const org = orgs.find((item) => item.id === id);
    if (!org || !orgSelect) return;
    orgSelect.value = id;
    const label = orgPicker.querySelector('[data-org-label]');
    if (label) label.textContent = orgLabel(org);
    orgTrigger?.classList.toggle('is-connected', org.authStatus === 'active');
    orgPicker.querySelectorAll('[data-org-choice]').forEach((row) => {
      const selected = row.dataset.orgChoice === id;
      row.classList.toggle('is-selected', selected);
      row.setAttribute('aria-selected', String(selected));
    });
    closeOrgPicker();
    orgSelect.dispatchEvent(new Event('change'));
  }));
  dialog.addEventListener('click', (event) => { if (event.target === dialog) closeOrgPicker(); });
  const showCandidates = async () => {
    const orgId = orgSelect?.value || '';
    if (!orgId) { showMessage('apexLogViewer.compare.noOrgs'); return; }
    list.innerHTML = `<span class="apex-log-compare-spinner" aria-label="${escapeHtml(t('apexLogViewer.compare.loading'))}"></span>`;
    try {
      requestedLimit = 20; visibleCount = 10;
      const response = await loadCandidates(orgId, requestedLimit);
      items = (response?.items || response || []).filter((item) => candidateMatchesEntry(item, comparisonEntry));
      hasMore = Boolean(response?.hasMore);
      renderList();
    } catch { showMessage('apexLogViewer.compare.loadError'); }
  };
  orgSelect?.addEventListener('change', () => void showCandidates());
  dialog.querySelector('[data-local]')?.addEventListener('click', () => dialog.querySelector('[data-file]')?.click());
  dialog.querySelector('[data-local]')?.addEventListener('dragover', (event) => { event.preventDefault(); event.currentTarget.classList.add('is-dragover'); });
  dialog.querySelector('[data-local]')?.addEventListener('dragleave', (event) => event.currentTarget.classList.remove('is-dragover'));
  dialog.querySelector('[data-local]')?.addEventListener('drop', async (event) => {
    event.preventDefault(); event.currentTarget.classList.remove('is-dragover'); const file = event.dataTransfer?.files?.[0];
    if (file) await handleFile(file);
  });
  const handleFile = async (file) => {
    if (!/\.log$/i.test(file.name)) { list.innerHTML = `<p class="apex-log-compare-empty">${escapeHtml(t('apexLogViewer.compare.invalidFile'))}</p>`; return; }
    await pick({ id: `local:${file.name}`, environment: t('apexLogViewer.compare.localEnvironment'), title: file.name, content: await file.text(), meta: { sizeBytes: file.size } });
  };
  dialog.querySelector('[data-file]')?.addEventListener('change', (event) => { const file = event.target.files?.[0]; if (file) void handleFile(file); });
  void showCandidates();
}
