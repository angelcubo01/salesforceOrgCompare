(function () {
  var OPENING_APP_TEXT = {
    es: 'Abriendo Salesforce Org Compare',
    en: 'Opening Salesforce Org Compare'
  };
  function applyBootSplashLang(lang) {
    var el = document.getElementById('appBootSplashText');
    if (!el) return;
    var code = lang === 'en' ? 'en' : 'es';
    el.textContent = OPENING_APP_TEXT[code];
    document.documentElement.lang = code;
  }
  try {
    var fromUrl = new URLSearchParams(location.search).get('lang');
    if (fromUrl === 'en' || fromUrl === 'es') {
      applyBootSplashLang(fromUrl);
      return;
    }
  } catch (e) {}
  try {
    chrome.storage.local.get('soc_language', function (result) {
      applyBootSplashLang(result && result.soc_language === 'en' ? 'en' : 'es');
    });
  } catch (e) {
    applyBootSplashLang('es');
  }
})();
