import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    // logi-proxy vive bajo services/* (gitignored); correrlo con `npm run test:logi-proxy` en local.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'tests/logiProxy*.test.js'
    ],
    setupFiles: ['tests/setup.js'],
    globals: false,
    coverage: {
      provider: 'v8',
      include: [
        'shared/**/*.js',
        'code/lib/**/*.js',
        'code/editor/diffUtils.js',
        'code/flows/**/*.js',
        'background/**/*.js',
        'services/logi-proxy/src/**/*.js'
      ],
      exclude: ['**/*.test.js', 'vendor/**', 'background/config.js']
    }
  }
});
