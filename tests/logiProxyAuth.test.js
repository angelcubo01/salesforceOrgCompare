import { describe, expect, it } from 'vitest';
import {
  isValidInstallId,
  signJwt,
  verifyJwt,
  resolveProxyAuth,
  JWT_TTL_SECONDS
} from '../services/logi-proxy/src/auth.js';

const INSTALL_ID = '550e8400-e29b-41d4-a716-446655440000';
const SECRET = 'test-jwt-signing-secret-32bytes!!';

describe('logiProxyAuth', () => {
  it('validates install UUID', () => {
    expect(isValidInstallId(INSTALL_ID)).toBe(true);
    expect(isValidInstallId('not-a-uuid')).toBe(false);
    expect(isValidInstallId('')).toBe(false);
  });

  it('signs and verifies JWT', async () => {
    const token = await signJwt(INSTALL_ID, SECRET, JWT_TTL_SECONDS);
    const verified = await verifyJwt(token, SECRET);
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.installId).toBe(INSTALL_ID);
    }
  });

  it('rejects invalid signature', async () => {
    const token = await signJwt(INSTALL_ID, SECRET);
    const verified = await verifyJwt(token, 'wrong-secret');
    expect(verified.ok).toBe(false);
  });

  it('rejects expired JWT', async () => {
    const token = await signJwt(INSTALL_ID, SECRET, -10);
    await new Promise((r) => setTimeout(r, 20));
    const verified = await verifyJwt(token, SECRET);
    expect(verified.ok).toBe(false);
    if (!verified.ok) expect(verified.error).toBe('expired');
  });

  it('resolveProxyAuth accepts JWT bearer', async () => {
    const token = await signJwt(INSTALL_ID, SECRET);
    const request = new Request('https://example.com/v1/chat', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const auth = await resolveProxyAuth(request, { JWT_SIGNING_SECRET: SECRET });
    expect(auth.ok).toBe(true);
    if (auth.ok) {
      expect(auth.via).toBe('jwt');
      expect(auth.installId).toBe(INSTALL_ID);
    }
  });

  it('resolveProxyAuth rejects installId-only without JWT', async () => {
    const request = new Request('https://example.com/v1/advisor-config', {
      headers: { 'X-SFOC-Install-Id': INSTALL_ID }
    });
    const auth = await resolveProxyAuth(request, { JWT_SIGNING_SECRET: SECRET });
    expect(auth.ok).toBe(false);
  });
});
