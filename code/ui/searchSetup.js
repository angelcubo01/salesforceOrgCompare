import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { showToast } from './toast.js';
import { addSelected, addBundleFiles } from '../flows/addItems.js';
import { applyArtifactTypeUi } from './artifactTypeUi.js';
import { renderEditor } from '../editor/editorRender.js';
import { refreshGeneratePackageXmlTypes } from './generatePackageXmlPanel.js';
import { refreshFieldDependencyPanel } from './fieldDependencyPanel.js';
import { refreshApexTestsPanel, resetApexTestsShellToHub } from './apexTestsPanel.js';
import { refreshAnonymousApexPanel } from './anonymousApexPanel.js';
import { refreshOrgLimitsPanel } from './orgLimitsPanel.js';
import { refreshDebugLogBrowserPanel } from './debugLogBrowserPanel.js';
import { refreshSetupAuditTrailPanel } from './setupAuditTrailPanel.js';
import { t } from '../../shared/i18n.js';

export function updateSearchUiForType() {
  applyArtifactTypeUi();
}

export function handlePackageXmlFileSelected(file) {
  if (!file) return;
  const lower = file.name.toLowerCase();
  if (!lower.endsWith('.xml')) {
    showToast(t('toast.selectXml'), 'warn');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const text = reader.result != null ? String(reader.result) : '';
    const key = `local-${Date.now()}-package`;
    // Siempre tratamos el manifiesto como package.xml (sin mostrar el nombre real en UI).
    state.packageXmlLocalContent[key] = { fileName: 'package.xml', content: text };
    addSelected({
      type: 'PackageXml',
      key,
      descriptor: {
        name: 'package.xml',
        originalFileName: 'package.xml',
        source: 'localFile'
      }
    });
  };
  reader.onerror = () => showToast(t('toast.readError'), 'error');
  reader.readAsText(file, 'UTF-8');
}

export function setupSearch() {
  const input = document.getElementById('searchInput');
  const results = document.getElementById('searchResults');
  const typeSelect = document.getElementById('typeSelect');
  const packageXmlLoadBtn = document.getElementById('packageXmlLoadBtn');
  const packageXmlFileInput = document.getElementById('packageXmlFileInput');

  if (packageXmlLoadBtn && packageXmlFileInput) {
    packageXmlLoadBtn.addEventListener('click', () => {
      packageXmlFileInput.click();
    });
    packageXmlFileInput.addEventListener('change', (ev) => {
      const f = ev.target.files && ev.target.files[0];
      ev.target.value = '';
      if (f) handlePackageXmlFileSelected(f);
    });
  }

  async function runSearch() {
    const selectedType = typeSelect ? typeSelect.value : '';
    if (!selectedType) {
      results.style.display = 'none';
      results.innerHTML = '';
      return;
    }
    if (
      selectedType === 'PackageXml' ||
      selectedType === 'GeneratePackageXml' ||
      selectedType === 'ApexTests' ||
      selectedType === 'AnonymousApex' ||
      selectedType === 'OrgLimits' ||
      selectedType === 'DebugLogBrowser' ||
      selectedType === 'SetupAuditTrail' ||
      selectedType === 'FieldDependency'
    ) {
      results.style.display = 'none';
      results.innerHTML = '';
      return;
    }
    let prefix = input.value.trim();
    if (prefix.length > 64) prefix = prefix.slice(0, 64);
    // Basic sanitation: collapse control characters
    prefix = prefix.replace(/[\u0000-\u001F\u007F]/g, '');
    const orgId = state.leftOrgId;
    if (!orgId || !prefix || prefix.length < 3) {
      results.style.display = 'none';
      results.innerHTML = '';
      return;
    }
    
    let types = [];
    if (selectedType === 'Apex') {
      types = ['ApexClass', 'ApexTrigger'];
    } else if (selectedType === 'VF') {
      types = ['ApexPage', 'ApexComponent'];
    } else if (selectedType === 'LWC') {
      types = ['LWC'];
    } else if (selectedType === 'Aura') {
      types = ['Aura'];
    } else if (selectedType === 'PermissionSet') {
      types = ['PermissionSet'];
    } else if (selectedType === 'Profile') {
      types = ['Profile'];
    } else if (selectedType === 'FlexiPage') {
      types = ['FlexiPage'];
    }
    results.innerHTML = '';
    let count = 0;
    for (const art of types) {
      const r = await bg({ type: 'searchIndex', orgId, artifactType: art, prefix });
      if (!r.ok) { showToast(t('toast.searchFailed'), 'warn'); continue; }
      if (art === 'LWC' || art === 'Aura') {
        for (const b of r.items) {
          const div = document.createElement('div');
          div.className = 'item';
          div.textContent = b.developerName;
          div.addEventListener('click', () => {
            addBundleFiles(art, { id: b.id, developerName: b.developerName });
            // Cerrar lista de resultados tras seleccionar
            results.style.display = 'none';
            results.innerHTML = '';
          });
          results.appendChild(div);
          count++;
        }
      } else {
        for (const rec of r.items) {
          const div = document.createElement('div');
          div.className = 'item';
          div.textContent = rec.name;
          div.addEventListener('click', () => {
            addSelected({ type: art, key: rec.name, descriptor: { name: rec.name } });
            // Cerrar lista de resultados tras seleccionar
            results.style.display = 'none';
            results.innerHTML = '';
          });
          results.appendChild(div);
          count++;
        }
      }
    }
    results.style.display = count ? 'block' : 'none';
  }

  // Cambiar tipo de metadata relanza la búsqueda actual
  if (typeSelect) {
    typeSelect.addEventListener('change', () => {
      updateSearchUiForType();
      runSearch();
      renderEditor();
      refreshGeneratePackageXmlTypes();
      if (typeSelect.value === 'ApexTests') {
        resetApexTestsShellToHub();
      }
      void refreshApexTestsPanel();
      void refreshAnonymousApexPanel();
      void refreshOrgLimitsPanel();
      void refreshDebugLogBrowserPanel();
      void refreshSetupAuditTrailPanel();
      refreshFieldDependencyPanel();
    });
  }
  updateSearchUiForType();

  input.addEventListener('input', debounce(runSearch, 300));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { runSearch(); } });
  input.addEventListener('focus', () => { if (results.childElementCount) results.style.display = 'block'; });

  // Cerrar lista de resultados al hacer clic fuera del buscador o de la lista
  document.addEventListener('click', (e) => {
    if (results.style.display !== 'block') return;
    const target = e.target;
    if (input.contains(target) || results.contains(target)) return;
    results.style.display = 'none';
  });
}

export function debounce(fn, wait = 300) {
  let t = null;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}
