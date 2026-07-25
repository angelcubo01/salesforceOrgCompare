import { t } from '../../shared/i18n.js';
import {
  getUiTheme,
  defaultMonacoThemeForUiTheme,
  saveExtensionSettings,
  applyUiThemeToDocument
} from '../../shared/extensionSettings.js';
import { state } from '../core/state.js';
import { applyMonacoThemeGlobally } from '../editor/monaco.js';

function getToggleInput() {
  return /** @type {HTMLInputElement | null} */ (document.getElementById('appThemeToggleInput'));
}

function updateToggleAria(input) {
  const isLight = input.checked;
  const key = isLight ? 'toolbar.themeToggleLight' : 'toolbar.themeToggleDark';
  input.setAttribute('aria-label', t(key));
  input.setAttribute('aria-checked', isLight ? 'true' : 'false');
}

/** Sincroniza el interruptor con la preferencia guardada (p. ej. tras cambiar Ajustes). */
export function syncAppThemeToggleUi() {
  const input = getToggleInput();
  if (!input) return;
  input.checked = getUiTheme() === 'light';
  updateToggleAria(input);
}

export function setupAppThemeToggle() {
  const input = getToggleInput();
  if (!input) return;

  syncAppThemeToggleUi();

  input.addEventListener('change', () => {
    void (async () => {
      const uiTheme = input.checked ? 'light' : 'dark';
      await saveExtensionSettings({
        uiTheme,
        monacoTheme: defaultMonacoThemeForUiTheme(uiTheme)
      });
      applyUiThemeToDocument(document);
      if (state.monaco) applyMonacoThemeGlobally(state.monaco);
      updateToggleAria(input);
    })();
  });
}
