import { describe, expect, it } from 'vitest';
import {
  SFOC_BACKUP_EXTENSION,
  decodeSfocBackup,
  encodeSfocBackup,
  isLegacyJsonBackupFilename,
  isSfocBackupFilename
} from '../shared/settingsBackupCodec.js';

describe('codec de copias de seguridad SFOC', () => {
  it('ofusca y recupera la copia con la clave sfoc', () => {
    const backup = {
      formatVersion: 4,
      localConfig: { savedCodeItems: [{ name: 'Script privado' }] }
    };

    const encoded = encodeSfocBackup(backup);

    expect(encoded).toMatch(/^SFOC-BACKUP:1:/);
    expect(encoded).not.toContain('Script privado');
    expect(decodeSfocBackup(encoded)).toEqual(backup);
  });

  it('rechaza contenidos que no sean una copia SFOC válida', () => {
    expect(() => decodeSfocBackup('{"formatVersion":4}')).toThrow();
    expect(() => decodeSfocBackup('SFOC-BACKUP:1:not-base64!')).toThrow();
  });

  it('distingue la extensión nueva de los JSON heredados', () => {
    expect(SFOC_BACKUP_EXTENSION).toBe('.sfocbackup');
    expect(isSfocBackupFilename('sfoc-backup.sfocbackup')).toBe(true);
    expect(isLegacyJsonBackupFilename('sfoc-backup.json')).toBe(true);
    expect(isSfocBackupFilename('sfoc-backup.json')).toBe(false);
    expect(isLegacyJsonBackupFilename('sfoc-backup.txt')).toBe(false);
  });
});
