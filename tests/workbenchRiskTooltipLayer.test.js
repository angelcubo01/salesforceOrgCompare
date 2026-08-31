import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(process.cwd(), 'code/workbench/workbench.css'), 'utf8');

describe('workbench risk tooltip layering', () => {
  it('keeps the contextual header above the mode bar so risk tooltips are not covered', () => {
    expect(css).toMatch(/body\[data-ui-mode="v2"\] \.workbench-context-header\s*\{[\s\S]*?z-index:\s*calc\(var\(--sfoc-z-app-submenu\) \+ 1\);[\s\S]*?overflow:\s*visible;/);
  });
});
