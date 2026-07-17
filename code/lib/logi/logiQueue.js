/** @typedef {{ id: string, text: string, quickActionId?: string, lineRef?: object, quoteRef?: object, displayText?: string }} QueuedMessage */

/**
 * @typedef {object} LogiQueueDeps
 * @property {(key: string, vars?: Record<string, unknown>) => string} t
 * @property {(s: string) => string} escapeHtml
 * @property {(sessionKey: string) => { messageQueue: unknown[] }} getRuntime
 * @property {(sessionKey: string) => void} bindSession
 * @property {(sessionKey: string) => void | Promise<void>} persistRuntime
 * @property {(modal: HTMLElement) => { messageQueue: unknown[] } | null} getModalRuntime
 * @property {unknown[]} messageQueue
 * @property {() => string} createRequestId
 * @property {(raw: unknown) => object | null} normalizeLineRef
 * @property {(raw: unknown) => object | null} normalizeQuoteRef
 * @property {(modal: HTMLElement) => void} [syncBusyUi]
 */

/**
 * @param {unknown} item
 * @param {Pick<LogiQueueDeps, 'createRequestId' | 'normalizeLineRef' | 'normalizeQuoteRef'>} deps
 * @returns {QueuedMessage | null}
 */
export function normalizeQueueItem(item, deps) {
  if (typeof item === 'string') {
    const text = item.trim();
    return text ? { id: deps.createRequestId(), text } : null;
  }
  if (!item || typeof item !== 'object') return null;
  const o = /** @type {Record<string, unknown>} */ (item);
  const text = String(o.text || '').trim();
  if (!text) return null;
  /** @type {QueuedMessage} */
  const out = { id: String(o.id || deps.createRequestId()), text };
  if (o.quickActionId && typeof o.quickActionId === 'string') {
    out.quickActionId = o.quickActionId;
  }
  const lineRef = deps.normalizeLineRef(o.lineRef);
  if (lineRef) out.lineRef = lineRef;
  const quoteRef = deps.normalizeQuoteRef(o.quoteRef);
  if (quoteRef) out.quoteRef = quoteRef;
  if (typeof o.displayText === 'string' && o.displayText.trim()) {
    out.displayText = o.displayText.trim();
  }
  return out;
}

/**
 * @param {{ messageQueue?: unknown[] }} rt
 * @param {Pick<LogiQueueDeps, 'createRequestId' | 'normalizeLineRef' | 'normalizeQuoteRef'>} deps
 * @returns {QueuedMessage[]}
 */
export function getQueueItems(rt, deps) {
  return (rt.messageQueue || [])
    .map((item) => normalizeQueueItem(item, deps))
    .filter(Boolean);
}

/**
 * @param {HTMLElement} modal
 * @param {LogiQueueDeps} deps
 */
export function renderQueuePanel(modal, deps) {
  const wrap = modal.querySelector('#logiAdvisorQueue');
  const summaryEl = modal.querySelector('#logiAdvisorQueueSummary');
  const listEl = modal.querySelector('#logiAdvisorQueueList');
  if (!wrap || !listEl) return;

  const rt = deps.getModalRuntime(modal);
  const items = getQueueItems(rt || /** @type {{ messageQueue: unknown[] }} */ ({ messageQueue: deps.messageQueue }), deps);

  if (!items.length) {
    wrap.hidden = true;
    if (summaryEl) summaryEl.textContent = '';
    listEl.innerHTML = '';
    return;
  }

  wrap.hidden = false;
  if (summaryEl) {
    summaryEl.textContent = deps.t('apexLogViewer.logi.queue', { count: items.length });
  }

  listEl.innerHTML = items
    .map((item) => {
      const preview = item.text.length > 96 ? `${item.text.slice(0, 96)}…` : item.text;
      const editLabel = deps.t('apexLogViewer.logi.queueEdit');
      const removeLabel = deps.t('apexLogViewer.logi.queueRemove');
      return `<li class="logi-advisor-queue-item">
        <span class="logi-advisor-queue-item-text" title="${deps.escapeHtml(item.text)}">${deps.escapeHtml(preview)}</span>
        <span class="logi-advisor-queue-item-actions">
          <button type="button" class="logi-advisor-queue-edit" data-queue-id="${deps.escapeHtml(item.id)}" title="${deps.escapeHtml(editLabel)}">${deps.escapeHtml(editLabel)}</button>
          <button type="button" class="logi-advisor-queue-remove" data-queue-id="${deps.escapeHtml(item.id)}" title="${deps.escapeHtml(removeLabel)}">${deps.escapeHtml(removeLabel)}</button>
        </span>
      </li>`;
    })
    .join('');
}

/**
 * @param {HTMLElement} modal
 * @param {string} itemId
 * @param {LogiQueueDeps} deps
 */
export function removeQueueItem(modal, itemId, deps) {
  const sessionKey = modal._sessionKey;
  if (!sessionKey) return;
  const rt = deps.getRuntime(sessionKey);
  const idx = rt.messageQueue.findIndex((q) => normalizeQueueItem(q, deps)?.id === itemId);
  if (idx < 0) return;
  rt.messageQueue.splice(idx, 1);
  deps.bindSession(sessionKey);
  renderQueuePanel(modal, deps);
  deps.syncBusyUi?.(modal);
  void deps.persistRuntime(sessionKey);
}

/**
 * @param {HTMLElement} modal
 * @param {string} itemId
 * @param {LogiQueueDeps} deps
 */
export function editQueueItem(modal, itemId, deps) {
  const sessionKey = modal._sessionKey;
  if (!sessionKey) return;
  const rt = deps.getRuntime(sessionKey);
  const idx = rt.messageQueue.findIndex((q) => normalizeQueueItem(q, deps)?.id === itemId);
  if (idx < 0) return;
  const current = normalizeQueueItem(rt.messageQueue[idx], deps);
  if (!current) return;

  const listEl = modal.querySelector('#logiAdvisorQueueList');
  const li = listEl?.querySelector(`[data-queue-id="${CSS.escape(itemId)}"]`)?.closest('li');
  if (!li) return;

  const saveLabel = deps.t('apexLogViewer.logi.queueEditSave');
  const cancelLabel = deps.t('apexLogViewer.logi.queueEditCancel');
  li.classList.add('logi-advisor-queue-item--editing');
  li.innerHTML = `
    <textarea class="logi-advisor-queue-edit-input" rows="2" aria-label="${deps.escapeHtml(deps.t('apexLogViewer.logi.queueEditPrompt'))}">${deps.escapeHtml(current.text)}</textarea>
    <span class="logi-advisor-queue-item-actions">
      <button type="button" class="logi-advisor-queue-edit-save" data-queue-id="${deps.escapeHtml(itemId)}">${deps.escapeHtml(saveLabel)}</button>
      <button type="button" class="logi-advisor-queue-edit-cancel" data-queue-id="${deps.escapeHtml(itemId)}">${deps.escapeHtml(cancelLabel)}</button>
    </span>`;

  const input = li.querySelector('.logi-advisor-queue-edit-input');
  input?.focus();
  input?.setSelectionRange(input.value.length, input.value.length);

  const finish = (save) => {
    if (save) {
      const trimmed = String(input?.value || '').trim();
      if (!trimmed) {
        removeQueueItem(modal, itemId, deps);
        return;
      }
      current.text = trimmed;
      rt.messageQueue[idx] = current;
      deps.bindSession(sessionKey);
      void deps.persistRuntime(sessionKey);
    }
    renderQueuePanel(modal, deps);
  };

  li.querySelector('.logi-advisor-queue-edit-save')?.addEventListener('click', () => finish(true));
  li.querySelector('.logi-advisor-queue-edit-cancel')?.addEventListener('click', () => finish(false));
  input?.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
      ev.preventDefault();
      finish(true);
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      finish(false);
    }
  });
}
