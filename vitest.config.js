import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    setupFiles: ['tests/setup.js'],
    globals: false,
    coverage: {
      provider: 'v8',
      include: ['shared/**/*.js', 'code/lib/**/*.js', 'code/editor/diffUtils.js'],
      // compareDeepLink cubierto por tests/compareDeepLink.test.js
      exclude: ['**/*.test.js', 'vendor/**']
    }
  }
});
