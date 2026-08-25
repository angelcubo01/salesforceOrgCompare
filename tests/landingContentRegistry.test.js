import { describe, expect, it } from 'vitest';
import {
  MARKETING_CAPABILITIES,
  MARKETING_STEPS,
  MARKETING_TRUST_ITEMS
} from '../code/workbench/landingContentRegistry.js';
import { getCanonicalToolIds } from '../code/workbench/workspaceRegistry.js';
import { USED_ICON_NAMES } from '../code/workbench/iconRegistry.js';

describe('landingContentRegistry', () => {
  it('mantiene identificadores únicos y cubre todas las herramientas publicitadas por v2', () => {
    const ids = MARKETING_CAPABILITIES.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);

    const configuredTools = new Set(MARKETING_CAPABILITIES.flatMap(({ toolIds }) => toolIds));
    expect(configuredTools).toEqual(new Set(getCanonicalToolIds()));
  });

  it('solo utiliza iconos incluidos en el sprite local', () => {
    const iconNames = [
      ...MARKETING_CAPABILITIES.map(({ icon }) => icon),
      ...MARKETING_STEPS.map(({ icon }) => icon),
      ...MARKETING_TRUST_ITEMS.map(({ icon }) => icon)
    ];
    for (const icon of iconNames) expect(USED_ICON_NAMES).toContain(icon);
  });

  it('declara el flujo en tres pasos y los cuatro estados de contexto', () => {
    expect(MARKETING_STEPS.map(({ id }) => id)).toEqual(['connect', 'inspect', 'act']);
    expect(MARKETING_TRUST_ITEMS.map(({ id }) => id)).toEqual([
      'production', 'sandbox', 'read-only', 'risk'
    ]);
  });
});
