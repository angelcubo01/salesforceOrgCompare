import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, test as base } from '@playwright/test';

const extensionPath = path.resolve(import.meta.dirname, '..');
export const test = base.extend({
  extensionContext: [async ({ headless }, use) => {
    const profile = await mkdtemp(path.join(tmpdir(), 'sfoc-playwright-'));
    const context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      headless,
      viewport: { width: 1280, height: 900 },
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--disable-features=DisableLoadExtensionCommandLineSwitch',
        '--no-first-run',
        '--disable-default-apps'
      ]
    });
    await use(context);
    await context.close().catch(() => {});
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        await rm(profile, { recursive: true, force: true });
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
  }, { scope: 'worker', timeout: 120_000 }],
  extensionId: [async ({ extensionContext }, use) => {
    let workers = extensionContext.serviceWorkers();
    if (!workers.length) workers = [await extensionContext.waitForEvent('serviceworker')];
    const extensionId = new URL(workers[0].url()).host;
    await use(extensionId);
  }, { scope: 'worker', timeout: 120_000 }],
  extensionWorker: async ({ extensionContext }, use) => {
    let workers = extensionContext.serviceWorkers();
    if (!workers.length) workers = [await extensionContext.waitForEvent('serviceworker')];
    await use(workers[0]);
  }
});

export { expect } from '@playwright/test';

export async function setLocalStorage(worker, values) {
  await worker.evaluate(async (payload) => chrome.storage.local.set(payload), values);
}

export async function openExtensionPage(context, extensionId, relativeUrl) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/${relativeUrl}`, { waitUntil: 'domcontentloaded' });
  return page;
}

export async function waitForCodeBoot(page) {
  await page.waitForFunction(() => !document.body.classList.contains('app-nav-booting'));
}
