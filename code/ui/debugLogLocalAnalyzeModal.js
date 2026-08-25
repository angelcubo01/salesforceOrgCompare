import { t } from '../../shared/i18n.js';
import { parseLocalApexLogPreview } from '../../shared/salesforceApi.js';
import { formatLogSize } from '../../shared/apexLogParser.js';
import { openApexLogViewerWithPayload } from '../lib/openApexLogViewer.js';
import { showToast, showToastWithSpinner, dismissSpinnerToast } from './toast.js';
import { mountSfocOverlay, unmountSfocOverlay } from './sfocModal.js';

const LOCAL_LOG_MAX_BYTES = 30 * 1024 * 1024;
const PLACEHOLDER = '—';

/** @type {{ fileName: string, content: string } | null} */
let stagedFile = null;

function els() {
  return {
    modal: document.getElementById('debugLogLocalAnalyzeModal'),
    openBtn: document.getElementById('debugLogBrowserAnalyzeLocalBtn'),
    dropzone: document.getElementById('debugLogLocalDropzone'),
    fileInput: document.getElementById('debugLogLocalFileInput'),
    errorEl: document.getElementById('debugLogLocalError'),
    preview: document.getElementById('debugLogLocalPreview'),
    previewFile: document.getElementById('debugLogLocalPreviewFile'),
    previewClass: document.getElementById('debugLogLocalPreviewClass'),
    previewTime: document.getElementById('debugLogLocalPreviewTime'),
    previewUser: document.getElementById('debugLogLocalPreviewUser'),
    analyzeBtn: document.getElementById('debugLogLocalAnalyzeBtn'),
    cancelBtn: document.getElementById('debugLogLocalCancelBtn')
  };
}

function isLogFileName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .endsWith('.log');
}

function formatClassLabel(preview) {
  const parts = [preview.logType, preview.logName, preview.logMethod]
    .map((v) => String(v || '').trim())
    .filter((v) => v && v !== 'N/A');
  return parts.length ? parts.join(' · ') : PLACEHOLDER;
}

function resetModalState() {
  stagedFile = null;
  const { errorEl, preview, analyzeBtn, fileInput, dropzone } = els();
  if (errorEl) {
    errorEl.textContent = '';
    errorEl.classList.add('hidden');
  }
  if (preview) preview.classList.add('hidden');
  if (analyzeBtn) analyzeBtn.disabled = true;
  if (fileInput) fileInput.value = '';
  if (dropzone) dropzone.classList.remove('is-dragover');
}

function showError(message) {
  const { errorEl, preview, analyzeBtn } = els();
  stagedFile = null;
  if (preview) preview.classList.add('hidden');
  if (analyzeBtn) analyzeBtn.disabled = true;
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
  showToast(message, 'error');
}

function renderPreview(file, preview) {
  const { errorEl, preview: previewEl, previewFile, previewClass, previewTime, previewUser, analyzeBtn } =
    els();
  if (errorEl) {
    errorEl.textContent = '';
    errorEl.classList.add('hidden');
  }
  if (previewFile) {
    previewFile.textContent = `${file.name} (${formatLogSize(file.size)})`;
  }
  if (previewClass) previewClass.textContent = formatClassLabel(preview);
  if (previewTime) previewTime.textContent = preview.executionStartTime || PLACEHOLDER;
  if (previewUser) previewUser.textContent = preview.user?.name || preview.user?.id || PLACEHOLDER;
  if (previewEl) previewEl.classList.remove('hidden');
  if (analyzeBtn) analyzeBtn.disabled = false;
}

function closeModal() {
  const { modal } = els();
  if (!modal) return;
  unmountSfocOverlay(modal);
  resetModalState();
}

export function openDebugLogLocalAnalyzeModal() {
  const { modal, dropzone } = els();
  if (!modal) return;
  resetModalState();
  mountSfocOverlay(modal, { initialFocus: dropzone, onEscape: closeModal });
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result != null ? String(reader.result) : '');
    reader.onerror = () => reject(reader.error || new Error('read failed'));
    reader.readAsText(file, 'UTF-8');
  });
}

async function handleFile(file) {
  if (!file) return;
  if (!isLogFileName(file.name)) {
    showError(t('debugLogs.localWrongExtension'));
    return;
  }
  if (file.size > LOCAL_LOG_MAX_BYTES) {
    showError(t('debugLogs.localTooLarge'));
    return;
  }

  let content = '';
  try {
    content = await readFileAsText(file);
  } catch {
    showError(t('toast.readError'));
    return;
  }

  const preview = parseLocalApexLogPreview(content);
  if (!preview.isValid) {
    showError(t('debugLogs.localInvalid'));
    return;
  }

  stagedFile = { fileName: file.name, content };
  renderPreview(file, preview);
}

async function submitAnalyze() {
  if (!stagedFile?.content) return;
  const { analyzeBtn } = els();
  if (analyzeBtn) analyzeBtn.disabled = true;
  showToastWithSpinner(t('debugLogs.localAnalyzing'));
  try {
    const title = `${t('docTitle.apexLog')} · ${stagedFile.fileName}`;
    const ok = await openApexLogViewerWithPayload(title, stagedFile.content, {
      downloadFileName: stagedFile.fileName,
      defaultTab: 'summary'
    });
    if (!ok) {
      showToast(t('debugLogs.localOpenError'), 'error');
      if (analyzeBtn) analyzeBtn.disabled = false;
      return;
    }
    closeModal();
  } catch {
    showToast(t('debugLogs.localOpenError'), 'error');
    if (analyzeBtn) analyzeBtn.disabled = false;
  } finally {
    dismissSpinnerToast();
  }
}

export function setupDebugLogLocalAnalyzeModal() {
  const { modal, openBtn, dropzone, fileInput, analyzeBtn, cancelBtn } = els();
  if (!modal) return;

  openBtn?.addEventListener('click', () => openDebugLogLocalAnalyzeModal());
  cancelBtn?.addEventListener('click', () => closeModal());
  analyzeBtn?.addEventListener('click', () => void submitAnalyze());

  modal.querySelector('[data-debug-log-local-close="1"]')?.addEventListener('click', () => closeModal());

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (modal.classList.contains('hidden')) return;
    closeModal();
  });

  dropzone?.addEventListener('click', () => fileInput?.click());
  dropzone?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput?.click();
    }
  });

  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) void handleFile(file);
  });

  dropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('is-dragover');
  });
  dropzone?.addEventListener('dragleave', (e) => {
    e.preventDefault();
    if (!dropzone.contains(/** @type {Node} */ (e.relatedTarget))) {
      dropzone.classList.remove('is-dragover');
    }
  });
  dropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('is-dragover');
    const file = e.dataTransfer?.files?.[0];
    if (file) void handleFile(file);
  });
}
