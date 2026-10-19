export const SFOC_BACKUP_EXTENSION = '.sfocbackup';

const BACKUP_PREFIX = 'SFOC-BACKUP:1:';
const OBFUSCATION_KEY = new TextEncoder().encode('sfoc');
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function xorWithSfocKey(bytes) {
  return Uint8Array.from(bytes, (byte, index) => byte ^ OBFUSCATION_KEY[index % OBFUSCATION_KEY.length]);
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  if (!value || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error('Invalid SFOC backup payload');
  }
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/**
 * Ofuscación reversible para que las copias no expongan el JSON en claro.
 * No pretende proporcionar cifrado criptográfico.
 */
export function encodeSfocBackup(payload) {
  const json = JSON.stringify(payload);
  return `${BACKUP_PREFIX}${bytesToBase64(xorWithSfocKey(textEncoder.encode(json)))}`;
}

export function decodeSfocBackup(content) {
  if (typeof content !== 'string' || !content.startsWith(BACKUP_PREFIX)) {
    throw new Error('Unsupported SFOC backup format');
  }
  const encodedPayload = content.slice(BACKUP_PREFIX.length);
  const json = textDecoder.decode(xorWithSfocKey(base64ToBytes(encodedPayload)));
  const payload = JSON.parse(json);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Invalid SFOC backup data');
  }
  return payload;
}

export function isSfocBackupFilename(filename) {
  return String(filename || '').toLowerCase().endsWith(SFOC_BACKUP_EXTENSION);
}

export function isLegacyJsonBackupFilename(filename) {
  return String(filename || '').toLowerCase().endsWith('.json');
}
