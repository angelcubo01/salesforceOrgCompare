import { describe, expect, it } from 'vitest';
import {
  isProductionWriteAllowedAction,
  isOrgMarkedProduction,
  shouldBlockProductionDeploy,
  isOrgReadOnly
} from '../shared/orgWritePolicy.js';

describe('orgWritePolicy', () => {
  it('allows anonymous apex in production', () => {
    expect(isProductionWriteAllowedAction('anonymous_apex_execute')).toBe(true);
    expect(isProductionWriteAllowedAction('dml_execute')).toBe(false);
  });

  it('blocks deploy when org verified as production', () => {
    expect(shouldBlockProductionDeploy({ isSandbox: false }, false, false, 'rest_write')).toBe(true);
    expect(shouldBlockProductionDeploy({ isSandbox: false }, true, false, 'rest_write')).toBe(false);
  });

  it('does not block check-only deploy', () => {
    expect(shouldBlockProductionDeploy({ isSandbox: false }, false, true, 'rest_write')).toBe(false);
  });

  it('respects read-only map', () => {
    expect(isOrgReadOnly({ org1: true }, 'org1')).toBe(true);
    expect(isOrgReadOnly({ org1: true }, 'org2')).toBe(false);
  });

  it('isOrgMarkedProduction uses stored flag', () => {
    expect(isOrgMarkedProduction({ isSandbox: false })).toBe(true);
    expect(isOrgMarkedProduction({ isSandbox: true })).toBe(false);
  });
});
