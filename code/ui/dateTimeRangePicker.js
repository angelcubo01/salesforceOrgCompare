import { Calendar } from '../../vendor/vanilla-calendar-pro/index.mjs';
import { toLocalDateTimeValue } from '../../shared/salesforceTime.js';
import { dateTimePlaceholder, formatLocalDateTimeParts, parseLocalDateTimeParts } from '../../shared/dateDisplay.js';
import { getDateDisplayFormat } from '../../shared/extensionSettings.js';
import { getCurrentLang, t } from '../../shared/i18n.js';

function splitDateTime(value, format = getDateDisplayFormat()) {
  const parts = parseLocalDateTimeParts(value, format);
  if (!parts) return null;
  return {
    date: `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`,
    time: `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`
  };
}

function displayDateTime(value, format = getDateDisplayFormat()) {
  const parts = parseLocalDateTimeParts(value, format);
  return parts ? formatLocalDateTimeParts(parts, format) : '';
}

function selectedValue(calendar, format) {
  const date = calendar.context?.selectedDates?.[0];
  const time = calendar.context?.selectedTime || '00:00';
  return date ? displayDateTime(date + 'T' + String(time).slice(0, 5), format) : '';
}

function createCalendarButton(input, label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sfoc-date-time-picker-button';
  button.setAttribute('aria-label', label);
  button.title = label;
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4M8 3v4M3 10h18"></path></svg>';
  return button;
}

/**
 * Vanilla Calendar posiciona su popup de input de forma absoluta. Como el
 * contenido de las herramientas tiene scroll propio, lo fijamos al viewport
 * y recalculamos su posición para que permanezca anclado al campo.
 */
function keepCalendarFixed(instance, input) {
  const calendarElement = instance?.context?.mainElement;
  if (!calendarElement || !input) return () => {};
  // Vanilla Calendar crea el popup al final de `body`. Lo trasladamos a la
  // capa del editor para que su z-index se compare con el de orgDropdowns.
  const editorLayer = input.closest('.editor-body-wrap');
  if (editorLayer && calendarElement.parentElement !== editorLayer) {
    editorLayer.appendChild(calendarElement);
  }
  const inModal = Boolean(input.closest('[role="dialog"], .sfoc-modal, .feature-controls-tool-modal'));
  const popupZIndex = inModal
    ? 'calc(var(--sfoc-z-modal-nested) + 1)'
    : 'calc(var(--sfoc-z-app-chrome) - 1)';

  const positionCalendar = () => {
    const inputRect = input.getBoundingClientRect();
    const calendarRect = calendarElement.getBoundingClientRect();
    const margin = 4;
    const maxLeft = Math.max(margin, window.innerWidth - calendarRect.width - margin);
    const left = Math.min(Math.max(inputRect.left, margin), maxLeft);
    // Mantener siempre el popup bajo su campo. La barra de entorno queda por
    // encima mediante su capa CSS y puede ocultar una parte del calendario
    // cuando el usuario haya hecho scroll.
    const top = inputRect.bottom + margin;

    Object.assign(calendarElement.style, {
      position: 'fixed',
      left: `${Math.round(left)}px`,
      top: `${Math.round(top)}px`,
      zIndex: popupZIndex
    });
  };

  positionCalendar();
  window.addEventListener('resize', positionCalendar);
  // `scroll` no burbujea: la fase de captura también recibe el scroll de los
  // contenedores internos de cada panel, no solo el de la ventana.
  window.addEventListener('scroll', positionCalendar, true);
  return () => {
    window.removeEventListener('resize', positionCalendar);
    window.removeEventListener('scroll', positionCalendar, true);
    calendarElement.style.removeProperty('position');
    calendarElement.style.removeProperty('z-index');
  };
}

/**
 * Reemplaza un input de fecha por un picker local de Vanilla Calendar Pro.
 * El calendario solo actualiza el borrador; nunca ejecuta una consulta.
 */
export function createDateTimePicker(input, opts = {}) {
  if (!input || input.dataset.sfocDateTimePicker === 'true') return null;
  input.dataset.sfocDateTimePicker = 'true';
  input.type = 'text';
  input.readOnly = false;
  input.inputMode = 'numeric';
  input.setAttribute('aria-describedby', `${input.id}DateTimeFormat`);
  input.autocomplete = 'off';
  let dateFormat = getDateDisplayFormat();
  input.placeholder = dateTimePlaceholder(dateFormat);
  input.classList.add('sfoc-date-time-picker-input');
  const calendarLabel = opts.label || t('dateRange.openCalendar');
  const button = createCalendarButton(input, calendarLabel);
  const group = document.createElement('div');
  group.className = 'sfoc-date-time-picker-group';
  input.parentNode?.insertBefore(group, input);
  group.appendChild(input);
  group.appendChild(button);
  const locale = getCurrentLang() === 'en' ? 'en' : 'es';
  let settingValue = false;
  let api = null;
  let releaseFixedCalendar = null;
  const initial = splitDateTime(input.value, dateFormat);
  // El rango por defecto puede haberse calculado antes de montar el picker y
  // llegar en ISO. Conservamos ese valor, pero lo mostramos de inmediato con
  // el formato configurado para que nunca quede visible la `T` interna.
  if (initial) input.value = displayDateTime(`${initial.date}T${initial.time}`, dateFormat);
  const calendar = new Calendar(input, {
    inputMode: true,
    openOnFocus: false,
    locale,
    firstWeekday: 1,
    selectionTimeMode: 24,
    selectedDates: initial ? [initial.date] : [],
    selectedTime: initial?.time || '00:00',
    selectedTheme: 'system',
    themeAttrDetect: 'html[data-ui-theme]',
    onChangeToInput(instance) {
      if (settingValue) return;
      const value = selectedValue(instance, dateFormat);
      if (!value) return;
      input.value = value;
      input.dataset.salesforceNow = 'false';
      input.dispatchEvent(new Event('change', { bubbles: true }));
      opts.onDraftChange?.(value);
    },
    onHide() {
      releaseFixedCalendar?.();
      releaseFixedCalendar = null;
      button.focus();
    },
    onShow(instance) {
      releaseFixedCalendar?.();
      releaseFixedCalendar = keepCalendarFixed(instance, input);
      if (!opts.allowSalesforceNow) return;
      const host = instance.context?.mainElement;
      if (!host || host.querySelector('[data-sfoc-calendar-now]')) return;
      const footer = document.createElement('div');
      footer.className = 'sfoc-calendar-now-footer';
      const nowButton = document.createElement('button');
      nowButton.type = 'button';
      nowButton.className = 'sfoc-calendar-now-button';
      nowButton.dataset.sfocCalendarNow = 'true';
      nowButton.textContent = t('dateRange.nowSalesforce');
      nowButton.addEventListener('click', () => {
        api?.setNowMode(true);
        opts.onDraftChange?.(null, { salesforceNow: true });
        instance.hide();
      });
      footer.appendChild(nowButton);
      host.appendChild(footer);
    }
  });
  calendar.init();
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    input.click();
  });
  input.addEventListener('input', () => {
    input.dataset.salesforceNow = 'false';
    opts.onDraftChange?.(input.value);
  });

  api = {
    input,
    calendar,
    button,
    get value() { return input.value; },
    setValue(value) {
      const normalized = splitDateTime(value, dateFormat) || splitDateTime(toLocalDateTimeValue(value), dateFormat);
      settingValue = true;
      input.value = normalized ? displayDateTime(normalized.date + 'T' + normalized.time, dateFormat) : '';
      input.dataset.salesforceNow = 'false';
      input.placeholder = dateTimePlaceholder(dateFormat);
      calendar.set({
        selectedDates: normalized ? [normalized.date] : [],
        selectedTime: normalized?.time || '00:00'
      });
      settingValue = false;
    },
    setNowMode(enabled) {
      input.dataset.salesforceNow = enabled ? 'true' : 'false';
      if (enabled) {
        input.value = '';
        input.placeholder = t('dateRange.nowSalesforce');
      } else {
        input.placeholder = dateTimePlaceholder(dateFormat);
      }
    },
    get isNowMode() {
      return input.dataset.salesforceNow === 'true';
    },
    destroy() {
      releaseFixedCalendar?.();
      calendar.destroy();
      button.remove();
      window.removeEventListener('sfoc:extension-settings-changed', onDateFormatChanged);
      delete input.dataset.sfocDateTimePicker;
    }
  };

  const hint = document.createElement('span');
  hint.id = `${input.id}DateTimeFormat`;
  hint.className = 'sfoc-visually-hidden';
  hint.textContent = dateTimePlaceholder(dateFormat);
  group.appendChild(hint);

  function onDateFormatChanged() {
    const current = splitDateTime(input.value, dateFormat);
    dateFormat = getDateDisplayFormat();
    if (current) {
      settingValue = true;
      input.value = displayDateTime(current.date + 'T' + current.time, dateFormat);
      calendar.set({ selectedDates: [current.date], selectedTime: current.time });
      settingValue = false;
    }
    if (!api?.isNowMode) input.placeholder = dateTimePlaceholder(dateFormat);
    hint.textContent = dateTimePlaceholder(dateFormat);
  }
  window.addEventListener('sfoc:extension-settings-changed', onDateFormatChanged);

  return api;
}

export function createDateTimeRangePicker(opts) {
  const since = createDateTimePicker(opts.sinceInput, {
    label: opts.sinceLabel,
    onDraftChange: () => opts.onDraftChange?.()
  });
  const until = createDateTimePicker(opts.untilInput, {
    label: opts.untilLabel,
    allowSalesforceNow: true,
    onDraftChange: () => opts.onDraftChange?.()
  });
  return { since, until };
}
