import { Calendar } from '../../vendor/vanilla-calendar-pro/index.mjs';
import { toLocalDateTimeValue } from '../../shared/salesforceTime.js';
import { getCurrentLang, t } from '../../shared/i18n.js';

function splitDateTime(value) {
  const raw = String(value || '');
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})/);
  if (match) return { date: match[1], time: match[2] };
  const display = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2})/);
  if (!display) return null;
  const [, first, second, year, time] = display;
  const dayFirst = getCurrentLang() !== 'en';
  return { date: `${year}-${dayFirst ? second : first}-${dayFirst ? first : second}`, time };
}

function displayDateTime(value) {
  const parsed = splitDateTime(value);
  if (!parsed) return '';
  const [year, month, day] = parsed.date.split('-');
  return getCurrentLang() === 'en' ? `${month}/${day}/${year} ${parsed.time}` : `${day}/${month}/${year} ${parsed.time}`;
}

function selectedValue(calendar) {
  const date = calendar.context?.selectedDates?.[0];
  const time = calendar.context?.selectedTime || '00:00';
  return date ? displayDateTime(date + 'T' + String(time).slice(0, 5)) : '';
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
  input.placeholder = getCurrentLang() === 'en' ? 'MM/DD/YYYY HH:mm' : 'DD/MM/YYYY HH:mm';
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
  const initial = splitDateTime(input.value);
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
      const value = selectedValue(instance);
      if (!value) return;
      input.value = value;
      input.dataset.salesforceNow = 'false';
      input.dispatchEvent(new Event('change', { bubbles: true }));
      opts.onDraftChange?.(value);
    },
    onHide() {
      button.focus();
    },
    onShow(instance) {
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
      const normalized = splitDateTime(value) || splitDateTime(toLocalDateTimeValue(value));
      settingValue = true;
      input.value = normalized ? displayDateTime(normalized.date + 'T' + normalized.time) : '';
      input.dataset.salesforceNow = 'false';
      input.placeholder = getCurrentLang() === 'en' ? 'MM/DD/YYYY HH:mm' : 'DD/MM/YYYY HH:mm';
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
        input.placeholder = getCurrentLang() === 'en' ? 'MM/DD/YYYY HH:mm' : 'DD/MM/YYYY HH:mm';
      }
    },
    get isNowMode() {
      return input.dataset.salesforceNow === 'true';
    },
    destroy() {
      calendar.destroy();
      button.remove();
      delete input.dataset.sfocDateTimePicker;
    }
  };

  const hint = document.createElement('span');
  hint.id = `${input.id}DateTimeFormat`;
  hint.className = 'sfoc-visually-hidden';
  hint.textContent = getCurrentLang() === 'en' ? 'MM/DD/YYYY HH:mm' : 'DD/MM/YYYY HH:mm';
  group.appendChild(hint);

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
