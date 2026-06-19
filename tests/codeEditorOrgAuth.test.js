import { describe, it, expect, beforeEach } from 'vitest';
import { state } from '../code/core/state.js';
import {
  isOrgAuthActive,
  isTabOrgAuthExpired,
  tabNeedsRemoteReload,
  setTabPendingRemoteLoad
} from '../code/lib/codeEditorOrgAuth.js';

describe('codeEditorOrgAuth', () => {
  beforeEach(() => {
    state.authStatuses = {};
  });

  it('detecta org activa y expirada', () => {
    state.authStatuses = { org1: 'active', org2: 'expired' };
    expect(isOrgAuthActive('org1')).toBe(true);
    expect(isOrgAuthActive('org2')).toBe(false);
    expect(isOrgAuthActive(null)).toBe(false);
  });

  it('marca pestaña como expirada sin sesión activa', () => {
    state.authStatuses = { org1: 'expired' };
    const tab = { sourceOrgId: 'org1' };
    expect(isTabOrgAuthExpired(tab)).toBe(true);
  });

  it('tabNeedsRemoteReload solo con sesión activa y flag pendiente', () => {
    state.authStatuses = { org1: 'active' };
    const tab = { sourceOrgId: 'org1', pendingRemoteLoad: true };
    expect(tabNeedsRemoteReload(tab)).toBe(true);
    setTabPendingRemoteLoad(tab, false);
    expect(tabNeedsRemoteReload(tab)).toBe(false);
  });
});
