import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('sfoc UI components CSS', () => {
  let css = '';

  beforeEach(() => {
    css = readFileSync(join(root, 'code', 'code.css'), 'utf8');
  });

  it('defines toast.success', () => {
    expect(css).toMatch(/\.toast\.success\s*\{/);
  });

  it('defines sfoc-btn family', () => {
    expect(css).toMatch(/\.sfoc-btn\s*\{/);
    expect(css).toMatch(/\.sfoc-btn--primary/);
    expect(css).toMatch(/\.sfoc-btn--secondary/);
  });

  it('defines sfoc-empty and sfoc-loading', () => {
    expect(css).toMatch(/\.sfoc-empty\s*\{/);
    expect(css).toMatch(/\.sfoc-loading\s*\{/);
  });

  it('defines semantic z-index tokens', () => {
    expect(css).toMatch(/--sfoc-z-toast:/);
    expect(css).toMatch(/--sfoc-z-help:/);
  });
});

describe('toast success bypass cooldown', () => {
  it('includes success in bypassCooldown condition', async () => {
    const src = readFileSync(join(root, 'code', 'ui', 'toast.js'), 'utf8');
    expect(src).toMatch(/type === 'success'/);
  });
});
