import { describe, it, expect } from 'vitest';
import {
  hasConnectedUser,
  buildConnectedUserBadge,
  buildConnectedUserTooltipLines,
  buildConnectedUserTooltipText
} from '../shared/orgConnectedUserView.js';

const fakeT = (key) =>
  ({
    'orgUser.user': 'Usuario',
    'orgUser.name': 'Nombre',
    'orgUser.company': 'Empresa',
    'orgUser.apiVersion': 'Versión API'
  })[key] || key;

const fullUser = {
  username: 'user@example.com',
  name: 'Ángel Picado',
  companyName: 'Acme Corp',
  apiVersion: '60.0'
};

describe('orgConnectedUserView', () => {
  describe('hasConnectedUser', () => {
    it('es false sin usuario', () => {
      expect(hasConnectedUser(null)).toBe(false);
      expect(hasConnectedUser(undefined)).toBe(false);
      expect(hasConnectedUser({})).toBe(false);
      expect(hasConnectedUser({ companyName: 'X', apiVersion: '60.0' })).toBe(false);
    });
    it('es true con username o name', () => {
      expect(hasConnectedUser({ username: 'a@b.com' })).toBe(true);
      expect(hasConnectedUser({ name: 'Ana' })).toBe(true);
    });
  });

  describe('buildConnectedUserBadge', () => {
    it('prioriza el nombre', () => {
      expect(buildConnectedUserBadge(fullUser)).toBe('Ángel Picado');
    });
    it('cae al username si no hay nombre', () => {
      expect(buildConnectedUserBadge({ username: 'a@b.com' })).toBe('a@b.com');
    });
    it('vacío si no hay usuario', () => {
      expect(buildConnectedUserBadge(null)).toBe('');
    });
  });

  describe('buildConnectedUserTooltipLines', () => {
    it('incluye las 4 líneas con valor', () => {
      const lines = buildConnectedUserTooltipLines(fullUser, fakeT);
      expect(lines).toEqual([
        { label: 'Usuario', value: 'user@example.com' },
        { label: 'Nombre', value: 'Ángel Picado' },
        { label: 'Empresa', value: 'Acme Corp' },
        { label: 'Versión API', value: '60.0' }
      ]);
    });
    it('omite campos vacíos', () => {
      const lines = buildConnectedUserTooltipLines(
        { name: 'Ana', apiVersion: '59.0' },
        fakeT
      );
      expect(lines).toEqual([
        { label: 'Nombre', value: 'Ana' },
        { label: 'Versión API', value: '59.0' }
      ]);
    });
    it('vacío si no hay usuario conectado', () => {
      expect(buildConnectedUserTooltipLines({ companyName: 'X' }, fakeT)).toEqual([]);
    });
  });

  describe('buildConnectedUserTooltipText', () => {
    it('formatea una línea por campo', () => {
      expect(buildConnectedUserTooltipText(fullUser, fakeT)).toBe(
        'Usuario: user@example.com\nNombre: Ángel Picado\nEmpresa: Acme Corp\nVersión API: 60.0'
      );
    });
    it('vacío si no hay usuario', () => {
      expect(buildConnectedUserTooltipText(null, fakeT)).toBe('');
    });
  });
});
