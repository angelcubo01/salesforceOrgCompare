import { afterEach, describe, expect, it } from 'vitest';
import { getCookieStoreIdForTab, resolveSidForOrgInTab } from '../background/orgHelpers.js';

describe('orgHelpers cookie stores', () => {
  const originalGetAll = chrome.cookies.getAll;
  const originalGetAllCookieStores = chrome.cookies.getAllCookieStores;
  const originalGet = chrome.cookies.get;
  const originalTabsGet = chrome.tabs?.get;
  const originalExtension = chrome.extension;

  afterEach(() => {
    chrome.cookies.getAll = originalGetAll;
    chrome.cookies.getAllCookieStores = originalGetAllCookieStores;
    chrome.cookies.get = originalGet;
    chrome.tabs.get = originalTabsGet;
    chrome.extension = originalExtension;
  });

  it('uses the cookie store that owns the Record Viewer tab', async () => {
    chrome.cookies.getAllCookieStores = async () => [
      { id: '0', tabIds: [1] },
      { id: '1', tabIds: [42] }
    ];
    chrome.cookies.getAll = async (query) => {
      expect(query.storeId).toBe('1');
      return [{
        domain: '.my.salesforce.com',
        value: '00D000000000001!incognito-session'
      }];
    };

    await expect(getCookieStoreIdForTab(42)).resolves.toBe('1');
    await expect(resolveSidForOrgInTab({ id: '00D000000000001' }, 42))
      .resolves.toBe('00D000000000001!incognito-session');
  });

  it('falls back to the incognito extension context when the viewer tab has no cookie-store mapping', async () => {
    chrome.cookies.getAllCookieStores = async () => [{ id: '1', tabIds: [42] }];
    chrome.cookies.getAll = async (query) => query.storeId
      ? []
      : [{ domain: '.my.salesforce.com', value: '00D000000000001!incognito-session' }];

    await expect(resolveSidForOrgInTab({ id: '00D000000000001' }, 42))
      .resolves.toBe('00D000000000001!incognito-session');
  });

  it('does not fall back to another profile for strict user management requests', async () => {
    chrome.cookies.getAllCookieStores = async () => [{ id: '1', tabIds: [42] }];
    const queries = [];
    chrome.cookies.getAll = async (query) => { queries.push(query); return []; };
    chrome.cookies.get = async (query) => { expect(query.storeId).toBe('1'); return null; };
    await expect(resolveSidForOrgInTab({ id: 'internal', instanceUrl: 'https://demo.my.salesforce.com' }, 42, { strictStore: true })).resolves.toBe('');
    expect(queries.every((query) => query.storeId === '1')).toBe(true);
  });

  it('uses the current split context only when Chrome cannot enumerate the tab store', async () => {
    chrome.cookies.getAllCookieStores = async () => [];
    chrome.tabs.get = async () => ({ id: 42, incognito: true });
    chrome.extension = { ...(chrome.extension || {}), inIncognitoContext: true };
    chrome.cookies.getAll = async (query) => {
      expect(query.storeId).toBeUndefined();
      return [{
        domain: '.my.salesforce.com',
        value: '00D000000000001!incognito-session'
      }];
    };

    await expect(resolveSidForOrgInTab(
      { id: '00D000000000001' },
      42,
      { strictStore: true, allowCurrentContextFallback: true }
    )).resolves.toBe('00D000000000001!incognito-session');
  });

  it('rejects the default store when the tab belongs to the other profile', async () => {
    chrome.cookies.getAllCookieStores = async () => [];
    chrome.tabs.get = async () => ({ id: 42, incognito: true });
    chrome.extension = { ...(chrome.extension || {}), inIncognitoContext: false };
    chrome.cookies.getAll = async () => [{
      domain: '.my.salesforce.com',
      value: '00D000000000001!normal-session'
    }];

    await expect(resolveSidForOrgInTab(
      { id: '00D000000000001' },
      42,
      { strictStore: true, allowCurrentContextFallback: true }
    )).resolves.toBe('');
  });
});
