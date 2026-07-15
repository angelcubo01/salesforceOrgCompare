import { describe, it, expect, beforeEach } from 'vitest';
import { state } from '../code/core/state.js';
import {
  isOrgAuthActive,
  isTabOrgAuthExpired,
  isTabContentBlockedByAuth,
  tabNeedsRemoteReload,
  setTabPendingRemoteLoad,
  markTabsPendingForRecoveredOrgs,
  syncTabsPendingAfterAuthRefresh
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

  it('tabNeedsRemoteReload cuando hay carga remota pendiente', () => {
    state.authStatuses = { org1: 'expired' };
    const tab = { sourceOrgId: 'org1', pendingRemoteLoad: true };
    expect(tabNeedsRemoteReload(tab)).toBe(true);
    setTabPendingRemoteLoad(tab, false);
    expect(tabNeedsRemoteReload(tab)).toBe(false);
  });

  it('markTabsPendingForRecoveredOrgs marca pestañas de orgs que pasan a activas', () => {
    const tab1 = { sourceOrgId: 'org1', pendingRemoteLoad: false };
    const tab2 = { sourceOrgId: 'org2', pendingRemoteLoad: false };
    markTabsPendingForRecoveredOrgs(
      { org1: 'expired', org2: 'active' },
      { org1: 'active', org2: 'active' },
      [tab1, tab2]
    );
    expect(tab1.pendingRemoteLoad).toBe(true);
    expect(tab2.pendingRemoteLoad).toBe(false);
  });

  it('syncTabsPendingAfterAuthRefresh marca pestañas sin sesión activa', () => {
    state.authStatuses = { org1: 'expired', org2: 'active' };
    const tab1 = { sourceOrgId: 'org1', pendingRemoteLoad: false };
    const tab2 = { sourceOrgId: 'org2', pendingRemoteLoad: false };
    syncTabsPendingAfterAuthRefresh([tab1, tab2]);
    expect(tab1.pendingRemoteLoad).toBe(true);
    expect(tab2.pendingRemoteLoad).toBe(false);
  });

  it('isTabContentBlockedByAuth permite contenido guardado localmente sin sesión org', () => {
    state.authStatuses = { org1: 'expired' };
    const offline = { sourceOrgId: 'org1', localSavedAt: '2026-01-01T00:00:00.000Z' };
    const blocked = { sourceOrgId: 'org1' };
    expect(isTabOrgAuthExpired(offline)).toBe(true);
    expect(isTabContentBlockedByAuth(offline)).toBe(false);
    expect(isTabContentBlockedByAuth(blocked)).toBe(true);
  });

  it('syncTabsPendingAfterAuthRefresh no marca pending si hay guardado local SFOC', () => {
    state.authStatuses = { org1: 'expired' };
    const tab = { sourceOrgId: 'org1', localSavedAt: '2026-01-01T00:00:00.000Z', pendingRemoteLoad: false };
    syncTabsPendingAfterAuthRefresh([tab]);
    expect(tab.pendingRemoteLoad).toBe(false);
  });
});
