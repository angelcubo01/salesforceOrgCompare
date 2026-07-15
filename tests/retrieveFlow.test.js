import { describe, expect, it } from 'vitest';
import { decodeZipBase64 } from '../code/lib/zipBinary.js';

describe('retrieveFlow zip helpers', () => {
  it('decodeZipBase64 returns Uint8Array from base64', () => {
    const original = new Uint8Array([1, 2, 3, 255]);
    const b64 = btoa(String.fromCharCode(...original));
    const decoded = decodeZipBase64(b64);
    expect(decoded).toBeInstanceOf(Uint8Array);
    expect(Array.from(decoded)).toEqual(Array.from(original));
  });
});
