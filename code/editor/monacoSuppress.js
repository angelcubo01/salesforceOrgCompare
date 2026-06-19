/**
 * Suprime errores ruidosos de workers de Monaco y avisos benignos de ResizeObserver
 * (Monaco `automaticLayout` + cambios de panel en la misma pasada de layout).
 */
(function suppressMonacoErrors() {
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;

  function isResizeObserverLoopNoise(text) {
    if (!text) return false;
    const s = String(text);
    return s.includes('ResizeObserver loop');
  }

  console.error = function (...args) {
    const errorString = args.join(' ');
    if (
      isResizeObserverLoopNoise(errorString) ||
      errorString.includes('workerMain.js') ||
      errorString.includes('vs/base/worker') ||
      errorString.includes('Failed trying to load default language strings') ||
      errorString.includes('Could not find source file') ||
      errorString.includes('tsMode.js') ||
      (errorString.includes('Monaco') && errorString.includes('worker'))
    ) {
      return;
    }
    originalConsoleError.apply(console, args);
  };

  console.warn = function (...args) {
    const warnString = args.join(' ');
    if (
      warnString.includes('workerMain.js') ||
      warnString.includes('vs/base/worker') ||
      warnString.includes('Duplicate definition of module') ||
      warnString.includes('Element already has context attribute') ||
      (warnString.includes('Monaco') && warnString.includes('worker'))
    ) {
      return;
    }
    originalConsoleWarn.apply(console, args);
  };

  window.addEventListener(
    'error',
    (event) => {
      if (isResizeObserverLoopNoise(event.message)) {
        event.stopImmediatePropagation();
        event.preventDefault();
        return false;
      }
      if (
        event.filename &&
        (event.filename.includes('workerMain.js') ||
          event.filename.includes('vs/base/worker') ||
          event.filename.includes('vs/editor') ||
          event.filename.includes('monaco'))
      ) {
        event.preventDefault();
        return false;
      }
    },
    true
  );

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason?.toString() || '';
    if (
      isResizeObserverLoopNoise(reason) ||
      reason.includes('workerMain.js') ||
      reason.includes('vs/base/worker') ||
      reason.includes('vs/editor') ||
      reason.includes('Could not find source file') ||
      reason.includes('tsMode.js') ||
      (reason.includes('Monaco') && reason.includes('worker'))
    ) {
      event.preventDefault();
    }
  });
})();
