// Configure Monaco AMD loader and workers for MV3 extension pages
// Map 'vs' to the vendor/min/vs folder
require.config({
  paths: {
    vs: chrome.runtime.getURL('vendor/monaco-editor/min/vs')
  }
});

function sfocWorkerScript(fileName) {
  return chrome.runtime.getURL('code/workers/' + fileName);
}

// Route workers to static stub files to avoid blob: URLs blocked by MV3 CSP
window.MonacoEnvironment = {
  getWorkerUrl: function (_moduleId, label) {
    if (label === 'json') return sfocWorkerScript('json.worker.js');
    if (label === 'css') return sfocWorkerScript('css.worker.js');
    if (label === 'html') return sfocWorkerScript('html.worker.js');
    if (label === 'typescript' || label === 'javascript') return sfocWorkerScript('ts.worker.js');
    return sfocWorkerScript('editor.worker.js');
  }
};


