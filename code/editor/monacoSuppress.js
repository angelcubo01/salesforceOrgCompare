/**
 * Suprime errores ruidosos de workers de Monaco en la vista de extensiones.
 */
(function suppressMonacoErrors() {
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;

  console.error = function (...args) {
    const errorString = args.join(' ');
    if (
      errorString.includes('workerMain.js') ||
      errorString.includes('vs/base/worker') ||
      errorString.includes('Failed trying to load default language strings') ||
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
      (warnString.includes('Monaco') && warnString.includes('worker'))
    ) {
      return;
    }
    originalConsoleWarn.apply(console, args);
  };

  window.addEventListener(
    'error',
    (event) => {
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
      reason.includes('workerMain.js') ||
      reason.includes('vs/base/worker') ||
      reason.includes('vs/editor') ||
      (reason.includes('Monaco') && reason.includes('worker'))
    ) {
      event.preventDefault();
    }
  });
})();
