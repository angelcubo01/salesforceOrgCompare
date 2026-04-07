/* global chrome, importScripts, self */
(function () {
  const getUrl = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL
    ? (p) => chrome.runtime.getURL(p)
    : null;
  if (getUrl) {
    self.MonacoEnvironment = { baseUrl: getUrl('vendor/monaco-editor/min/') };
    importScripts(
      getUrl('vendor/monaco-editor/min/vs/base/worker/workerMain.js'),
      getUrl('vendor/monaco-editor/min/vs/language/html/htmlWorker.js')
    );
  } else {
    importScripts(
      '../../vendor/monaco-editor/min/vs/base/worker/workerMain.js',
      '../../vendor/monaco-editor/min/vs/language/html/htmlWorker.js'
    );
  }
})();
