import { describe, expect, it } from 'vitest';
import { resolveProxyAuth } from '../services/logi-proxy/src/auth.js';

const INSTALL_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('logiProxyAdvisorConfig auth', () => {
  it('does not allow advisor-config with only X-SFOC-Install-Id', async () => {
    const request = new Request('https://proxy.example/v1/advisor-config', {
      method: 'GET',
      headers: { 'X-SFOC-Install-Id': INSTALL_ID }
    });
    const auth = await resolveProxyAuth(request, {
      JWT_SIGNING_SECRET: 'jwt-secret-for-tests-32-characters'
    });
    expect(auth.ok).toBe(false);
  });
});
