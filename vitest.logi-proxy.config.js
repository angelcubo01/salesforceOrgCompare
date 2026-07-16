import { defineConfig } from 'vitest/config';

/** Solo para `npm run test:logi-proxy` (requiere services/logi-proxy local). */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/logiProxy*.test.js'],
    setupFiles: ['tests/setup.js'],
    globals: false
  }
});
