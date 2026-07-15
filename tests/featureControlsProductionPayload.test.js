import { describe, it, expect } from 'vitest';
import {
  BETA_TOOL_IDS,
  BETA_TOOL_NOTICE,
  buildProductionFeatureControlsPayload
} from '../shared/featureControlsProductionPayload.js';

describe('featureControlsProductionPayload', () => {
  it('incluye DependencyExplorer y RecordCompare como beta', () => {
    expect(BETA_TOOL_IDS).toContain('DependencyExplorer');
    expect(BETA_TOOL_IDS).toContain('RecordCompare');
  });

  it('buildProductionFeatureControlsPayload aplica aviso beta sin borrar otras restricciones', () => {
    const payload = buildProductionFeatureControlsPayload({
      version: 1,
      tools: { ApexTests: { hidden: true } },
      modes: {},
      metadataTypes: {},
      actions: { deploy: { disabled: true } }
    });
    expect(payload.tools.ApexTests).toEqual({ hidden: true });
    expect(payload.actions.deploy).toEqual({ disabled: true });
    expect(payload.tools.DependencyExplorer?.message).toEqual(BETA_TOOL_NOTICE);
    expect(payload.tools.RecordCompare?.message).toEqual(BETA_TOOL_NOTICE);
  });
});
