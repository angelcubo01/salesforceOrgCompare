import {
  expect,
  setLocalStorage,
  test
} from './extension.fixture.js';

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

test('V2 no supera en más de un 10 % la retirada del estado de arranque Classic', async ({ extensionContext, extensionId, extensionWorker }) => {
  const page = await extensionContext.newPage();
  await page.addInitScript(() => {
    window.__sfocBootEnd = null;
    document.addEventListener('DOMContentLoaded', () => {
      const finish = () => {
        if (window.__sfocBootEnd == null && !document.body.classList.contains('app-nav-booting')) {
          window.__sfocBootEnd = performance.now();
        }
      };
      const observer = new MutationObserver(finish);
      observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
      finish();
    }, { once: true });
  });

  const samples = { classic: [], v2: [] };
  const measure = async (mode, iteration, record = true) => {
    await setLocalStorage(extensionWorker, { sfocUiMode: mode });
    await page.goto(`chrome-extension://${extensionId}/code/code.html?perf=${mode}-${iteration}`, {
      waitUntil: 'domcontentloaded'
    });
    await page.waitForFunction(() => Number.isFinite(window.__sfocBootEnd));
    const duration = await page.evaluate(() => window.__sfocBootEnd);
    if (record) samples[mode].push(duration);
  };

  await measure('classic', 'warm', false);
  await measure('v2', 'warm', false);
  for (let index = 0; index < 10; index += 1) {
    await measure(index % 2 ? 'v2' : 'classic', index);
    await measure(index % 2 ? 'classic' : 'v2', index);
  }

  const classicMedian = median(samples.classic);
  const v2Median = median(samples.v2);
  await test.info().attach('ui-load-median.json', {
    body: JSON.stringify({ classicMedian, v2Median, samples }, null, 2),
    contentType: 'application/json'
  });
  expect(v2Median).toBeLessThanOrEqual(classicMedian * 1.1);
  await page.close();
});
