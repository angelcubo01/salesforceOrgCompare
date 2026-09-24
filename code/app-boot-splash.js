(function () {
  var BOOT_PREFS_KEY = 'sfoc_boot_presentation';
  var OPENING_APP_TEXT = {
    es: 'Abriendo Salesforce Org Compare',
    en: 'Opening Salesforce Org Compare'
  };
  var isReady = false;

  function normalizeTheme(theme) {
    return theme === 'light' ? 'light' : 'dark';
  }

  function applyBootSplashPrefs(prefs) {
    var el = document.getElementById('appBootSplashText');
    var code = prefs && prefs.lang === 'en' ? 'en' : 'es';
    var theme = normalizeTheme(prefs && prefs.theme);
    if (el) el.textContent = OPENING_APP_TEXT[code];
    document.documentElement.lang = code;
    document.documentElement.dataset.uiTheme = theme;
    document.documentElement.style.colorScheme = theme;
  }

  function readCachedPrefs() {
    try {
      var raw = localStorage.getItem(BOOT_PREFS_KEY);
      var value = raw ? JSON.parse(raw) : {};
      return value && typeof value === 'object' ? value : {};
    } catch (e) {
      return {};
    }
  }

  function saveCachedPrefs(prefs) {
    try {
      localStorage.setItem(BOOT_PREFS_KEY, JSON.stringify(prefs));
    } catch (e) {}
  }

  function revealSplash(prefs) {
    if (isReady) return;
    isReady = true;
    applyBootSplashPrefs(prefs);
    document.body && document.body.classList.add('app-boot-prefs-ready');
  }

  var cached = readCachedPrefs();
  try {
    var fromUrl = new URLSearchParams(location.search).get('lang');
    if (fromUrl === 'en' || fromUrl === 'es') cached.lang = fromUrl;
  } catch (e) {}

  // Con caché local el primer frame ya usa el idioma y tema correctos.
  if ((cached.lang === 'en' || cached.lang === 'es') && (cached.theme === 'light' || cached.theme === 'dark')) {
    revealSplash(cached);
  }

  try {
    chrome.storage.local.get(['soc_language', 'soc_extension_config'], function (result) {
      var prefs = {
        lang: fromUrl === 'en' || fromUrl === 'es'
          ? fromUrl
          : result && result.soc_language === 'en' ? 'en' : 'es',
        theme: result && result.soc_extension_config && result.soc_extension_config.uiTheme === 'light'
          ? 'light' : 'dark'
      };
      saveCachedPrefs(prefs);
      if (!isReady) revealSplash(prefs);
      else applyBootSplashPrefs(prefs);
    });
  } catch (e) {
    revealSplash(cached);
  }

  // Si Chrome storage no responde, la app sigue siendo accesible sin quedarse
  // con la pantalla de carga oculta.
  setTimeout(function () { revealSplash(cached); }, 1200);
})();
