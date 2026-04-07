/* global chrome, importScripts, self */
// Monaco en el worker no ve window.MonacoEnvironment: hay que fijar baseUrl aquí
// para que vs/* resuelva a vendor/monaco-editor/min/vs/ (no a /vs/ en la raíz).
(function () {
  const getUrl = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL
    ? (p) => chrome.runtime.getURL(p)
    : null;
  if (getUrl) {
    self.MonacoEnvironment = { baseUrl: getUrl('vendor/monaco-editor/min/') };
    importScripts(getUrl('vendor/monaco-editor/min/vs/base/worker/workerMain.js'));
  } else {
    importScripts('../../vendor/monaco-editor/min/vs/base/worker/workerMain.js');
  }
})();
