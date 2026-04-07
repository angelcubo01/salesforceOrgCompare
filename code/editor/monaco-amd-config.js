// Configure Monaco AMD loader and workers for MV3 extension pages
// Map 'vs' to the vendor/min/vs folder
require.config({
  paths: {
    vs: chrome.runtime.getURL('vendor/monaco-editor/min/vs')
  }
});

// Route workers to static stub files to avoid blob: URLs blocked by MV3 CSP
window.MonacoEnvironment = {
  getWorkerUrl: function (moduleId, label) {
    if (label === 'json') return 'workers/json.worker.js';
    if (label === 'css') return 'workers/css.worker.js';
    if (label === 'html') return 'workers/html.worker.js';
    if (label === 'typescript' || label === 'javascript') return 'workers/ts.worker.js';
    return 'workers/editor.worker.js';
  }
};


