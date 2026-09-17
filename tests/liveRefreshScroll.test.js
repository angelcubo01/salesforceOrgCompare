import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('actualizaciones en vivo', () => {
  it('ancla los detalles abiertos de Deployments durante el refresco', async () => {
    const source = await readFile(new URL('../code/ui/deployStatusPanel.js', import.meta.url), 'utf8');
    expect(source).toContain('captureDeploySummaryScrollAnchor()');
    expect(source).toContain('captureDeployDetailScrollAnchor()');
    expect(source).toContain('restoreScrollAnchor(scrollState.container, scrollState.anchor);');
    expect(source).toContain('detailRow.dataset.deployInlineDetailId = asyncId;');
    expect(source).toContain('captureOpenDeployStackTraceKeys()');
    expect(source).toContain('restoreOpenDeployStackTraces(openStackTraceKeys);');
    expect(source).toContain('data-deploy-stack-key');
  });

  it('ancla la ejecución expandida de Apex Tests dentro de su tabla', async () => {
    const source = await readFile(new URL('../code/ui/apexTestsHubRuns.js', import.meta.url), 'utf8');
    expect(source).toContain('captureScrollAnchorInContainer(tableWrap, detachedDetailRow)');
    expect(source).toContain('restoreScrollAnchorInContainer(tableWrap, detachedDetailRow, savedWrapAnchor)');
  });

  it('mantiene los controles del detalle fijos y desplaza solo los resultados Apex', async () => {
    const [source, css] = await Promise.all([
      readFile(new URL('../code/ui/apexTestsHubRuns.js', import.meta.url), 'utf8'),
      readFile(new URL('../code/code.css', import.meta.url), 'utf8')
    ]);
    expect(source).toContain("results.className = 'apex-tests-runs-detail-results';");
    expect(source).toContain("tbl?.closest('.apex-tests-runs-detail-results')");
    expect(css).toContain('.apex-tests-runs-detail-results {');
    expect(css).toContain('position: sticky;');
  });
});
