import { describe, expect, it } from 'vitest';
import { buildApexCoverageViewerPath } from '../code/lib/apexCoverageViewerUrl.js';

describe('URL compartible del Apex Coverage Viewer', () => {
  it('incluye entorno, componente y ejecución para cobertura de tests', () => {
    expect(buildApexCoverageViewerPath('temporary', {
      orgId: '00D1', apexId: '01p1', jobId: '7071', className: 'Servicio'
    })).toBe('code/apex-coverage-viewer.html?k=temporary&orgId=00D1&apexId=01p1&jobId=7071&className=Servicio');
  });

  it('incluye ambos entornos y componentes en la comparación', () => {
    expect(buildApexCoverageViewerPath('temporary', {
      mode: 'split', leftOrgId: '00DL', leftApexId: '01pL', rightOrgId: '00DR', rightApexId: '01pR', className: 'Servicio'
    })).toBe('code/apex-coverage-viewer.html?k=temporary&mode=split&leftOrgId=00DL&leftApexId=01pL&rightOrgId=00DR&rightApexId=01pR&className=Servicio');
  });
});
