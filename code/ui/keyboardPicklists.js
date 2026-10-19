/**
 * Navegación de teclado común para picklists nativas y desplegables de la app.
 *
 * Los componentes antiguos conservan sus listeners. Esta capa actúa en captura
 * solo cuando hay una lista visible, de modo que los autocompletados que antes
 * eran solo de ratón reciben el mismo comportamiento que el resto.
 */

const POPUP_SELECTOR = [
  '[role="listbox"]',
  '[role="menu"]',
  '.permission-diff-suggestions',
  '.sfoc-autocomplete-panel',
  '.field-history-suggestions',
  '.dep-explorer-search-results',
  '.apex-log-compare-org-popup'
].join(',');

const OPTION_SELECTOR = [
  '[role="option"]',
  '[role="menuitem"]',
  '.permission-diff-suggestion',
  '.data-workbench-autocomplete-item',
  '.field-history-suggestion-item',
  '.quick-open-item',
  '.item'
].join(',');

const activeIndexes = new WeakMap();
let generatedId = 0;
let installed = false;

export function nextKeyboardOptionIndex(current, key, count) {
  if (!count) return -1;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  const start = Number.isInteger(current) && current >= 0 ? current : (key === 'ArrowUp' ? 0 : -1);
  if (key === 'ArrowUp') return (start - 1 + count) % count;
  if (key === 'ArrowDown') return (start + 1) % count;
  return Math.min(Math.max(start, 0), count - 1);
}

function isVisible(element) {
  if (!element || !element.isConnected || element.hidden || element.classList.contains('hidden')) return false;
  if (element.closest('[hidden], [aria-hidden="true"]')) return false;
  const style = globalThis.getComputedStyle?.(element);
  return style?.display !== 'none' && style?.visibility !== 'hidden';
}

function popupOptions(popup) {
  return [...popup.querySelectorAll(OPTION_SELECTOR)].filter((option) => (
    !option.hidden
    && !option.matches('[disabled], [aria-disabled="true"]')
    && !option.closest('[hidden], .hidden, [aria-hidden="true"]')
  ));
}

function candidatePopups(control, includeHidden = false) {
  const found = [];
  const add = (popup) => {
    if (!popup || found.includes(popup) || (!includeHidden && !isVisible(popup))) return;
    found.push(popup);
  };

  const controlsId = control.getAttribute?.('aria-controls');
  if (controlsId) add(document.getElementById(controlsId));

  let owner = control.parentElement;
  for (let depth = 0; owner && depth < 3; depth++, owner = owner.parentElement) {
    owner.querySelectorAll?.(POPUP_SELECTOR).forEach(add);
    if (found.length) break;
  }

  if (!found.length && !includeHidden) {
    const visible = [...document.querySelectorAll(POPUP_SELECTOR)].filter(isVisible);
    if (visible.length === 1) add(visible[0]);
  }
  return found;
}

function ensureRelationship(control, popup) {
  if (!popup.id) popup.id = `sfoc-keyboard-picklist-${++generatedId}`;
  if (!control.getAttribute('aria-controls')) control.setAttribute('aria-controls', popup.id);
}

function selectedOptionIndex(options) {
  return options.findIndex((option) => (
    option.getAttribute('aria-selected') === 'true'
    || option.classList.contains('is-selected')
    || option.classList.contains('is-active')
  ));
}

function setActiveOption(control, popup, index) {
  const options = popupOptions(popup);
  if (!options.length) return null;
  const safeIndex = ((index % options.length) + options.length) % options.length;
  activeIndexes.set(popup, safeIndex);
  options.forEach((option, optionIndex) => {
    option.classList.toggle('sfoc-keyboard-active', optionIndex === safeIndex);
  });
  const active = options[safeIndex];
  if (!active.id) active.id = `${popup.id || 'sfoc-picklist'}-option-${safeIndex + 1}`;
  control.setAttribute('aria-activedescendant', active.id);
  active.scrollIntoView?.({ block: 'nearest' });
  return active;
}

function clearActiveOption(control, popup) {
  popup?.querySelectorAll('.sfoc-keyboard-active').forEach((option) => {
    option.classList.remove('sfoc-keyboard-active');
  });
  if (popup) activeIndexes.delete(popup);
  control.removeAttribute?.('aria-activedescendant');
}

function openPopup(control, popup, key) {
  const trigger = control.matches?.('[aria-haspopup="listbox"], [aria-haspopup="menu"], [aria-haspopup="true"]')
    ? control
    : null;
  if (!trigger) return false;
  trigger.click();
  queueMicrotask(() => {
    if (!isVisible(popup)) return;
    ensureRelationship(control, popup);
    const options = popupOptions(popup);
    const selected = selectedOptionIndex(options);
    setActiveOption(control, popup, nextKeyboardOptionIndex(selected, key, options.length));
  });
  return true;
}

function closePopup(control, popup) {
  const trigger = control.matches?.('[aria-haspopup]') ? control : null;
  if (trigger?.getAttribute('aria-expanded') === 'true') trigger.click();
  else {
    if (popup.matches('.dep-explorer-search-results, .field-history-suggestions')) {
      popup.classList.add('hidden');
    } else {
      popup.hidden = true;
    }
    control.setAttribute?.('aria-expanded', 'false');
  }
  clearActiveOption(control, popup);
}

function activateOption(option, popup) {
  // Algunos listados legacy seleccionan en mousedown para adelantarse al blur.
  option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  if (option.isConnected && isVisible(popup)) option.click?.();
}

function handleNativeSelect(event, select) {
  if (event.key !== 'Enter' || select.multiple || select.disabled) return false;
  if (typeof select.showPicker !== 'function') return false;
  try {
    select.showPicker();
    event.preventDefault();
    event.stopPropagation();
    return true;
  } catch {
    return false;
  }
}

function handleCustomPicklist(event, control) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', 'Escape'].includes(event.key)) return false;

  let [popup] = candidatePopups(control);
  if (!popup && ['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) {
    [popup] = candidatePopups(control, true);
    if (!popup || !openPopup(control, popup, event.key === 'Enter' ? 'ArrowDown' : event.key)) return false;
    event.preventDefault();
    event.stopPropagation();
    return true;
  }
  if (!popup) return false;
  ensureRelationship(control, popup);

  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    closePopup(control, popup);
    control.focus?.({ preventScroll: true });
    return true;
  }

  const options = popupOptions(popup);
  if (!options.length) return false;
  let current = activeIndexes.get(popup);
  if (!Number.isInteger(current)) current = selectedOptionIndex(options);

  event.preventDefault();
  event.stopPropagation();
  if (event.key === 'Enter') {
    const active = setActiveOption(control, popup, current >= 0 ? current : 0);
    if (active) activateOption(active, popup);
    return true;
  }
  setActiveOption(control, popup, nextKeyboardOptionIndex(current, event.key, options.length));
  return true;
}

function onKeydown(event) {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const select = target.closest('select');
  if (select) {
    handleNativeSelect(event, select);
    return;
  }
  const control = target.closest('input, [role="combobox"], [aria-haspopup]');
  if (control) handleCustomPicklist(event, control);
}

export function setupKeyboardPicklists() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('keydown', onKeydown, true);
}
