import { describe, expect, it } from 'vitest';
import {
  buildSetupPaletteUserSearchSoql,
  normalizeSetupPaletteSearch,
  normalizeSetupPaletteUserId,
  sortSetupPaletteUsers
} from '../shared/setupPaletteUsersApi.js';
import { salesforceSetupUserPath } from '../sfInject/content/userManagementUrls.js';

describe('Setup Palette Users', () => {
  it('busca Name, Username, Email, Alias y Federation Identifier escapando SOQL', () => {
    const soql = buildSetupPaletteUserSearchSoql("o'hara");
    expect(soql).toContain("Name LIKE '%o\\'hara%'");
    expect(soql).toContain('Username LIKE');
    expect(soql).toContain('Email LIKE');
    expect(soql).toContain('Alias LIKE');
    expect(soql).toContain('FederationIdentifier LIKE');
  });

  it('acepta IDs Salesforce de 15 y 18 caracteres y no los trata como texto libre', () => {
    expect(normalizeSetupPaletteUserId('005000000000001')).toBe('005000000000001');
    expect(normalizeSetupPaletteUserId('005000000000001AAA')).toBe('005000000000001AAA');
    expect(buildSetupPaletteUserSearchSoql('005000000000001')).toContain("WHERE Id = '005000000000001'");
    expect(normalizeSetupPaletteUserId('005 invalid')).toBe('');
  });

  it('limita el término y elimina controles antes de generar SOQL', () => {
    expect(normalizeSetupPaletteSearch(`a\u0000${'x'.repeat(150)}`)).toHaveLength(100);
  });

  it('prioriza ID exacto, username/email exactos, activos y prefijos de nombre', () => {
    const users = sortSetupPaletteUsers([
      { id: '005000000000003', name: 'Zed', username: 'z@example.com', email: '', isActive: false },
      { id: '005000000000002', name: 'Adam', username: 'other@example.com', email: '', isActive: true },
      { id: '005000000000001', name: 'Alicia', username: 'alice@example.com', email: '', isActive: true }
    ], 'alice@example.com');
    expect(users[0].id).toBe('005000000000001');
  });

  it('construye únicamente rutas relativas de Setup para User IDs válidos', () => {
    expect(salesforceSetupUserPath('005000000000001')).toContain('005000000000001');
    expect(salesforceSetupUserPath('../evil')).toBe('');
  });

});
