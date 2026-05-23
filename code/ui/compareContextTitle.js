import { state } from '../core/state.js';
import { t } from '../../shared/i18n.js';
import { metadataContextTitleKey } from '../lib/metadataSearch.js';

/** Título encima de los selectores de org: tipo del elemento en comparación. */
export function syncCompareContextTitle() {
  const el = document.getElementById('compareContextTitle');
  if (!el) return;

  if (state.appNavMode !== 'comparator') {
    el.textContent = '';
    el.classList.add('hidden');
    return;
  }

  const itemType = state.selectedItem?.type;
  if (!itemType) {
    el.textContent = '';
    el.classList.add('hidden');
    return;
  }

  const labelKey = metadataContextTitleKey(itemType);
  if (labelKey) {
    el.textContent = t(labelKey);
    el.classList.remove('hidden');
    return;
  }

  if (itemType === 'PackageXml') {
    el.textContent = t('code.compareContextPackageXml');
    el.classList.remove('hidden');
    return;
  }

  el.textContent = '';
  el.classList.add('hidden');
}
