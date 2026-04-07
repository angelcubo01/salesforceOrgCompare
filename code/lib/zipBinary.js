/** Lectura ZIP con APIs estándar (sin librería externa). */

const ZIP_SIG_EOCD = 0x06054b50;
const ZIP_SIG_CENTRAL = 0x02014b50;
const ZIP_SIG_LOCAL = 0x04034b50;
const ZIP_METHOD_STORED = 0;
const ZIP_METHOD_DEFLATE = 8;

export function readU16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

export function readU32(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

export function findEOCD(bytes) {
  const max = Math.min(bytes.length, 65557);
  for (let i = bytes.length - 4; i >= bytes.length - max && i >= 0; i--) {
    if (readU32(bytes, i) === ZIP_SIG_EOCD) return i;
  }
  return -1;
}

export function getZipEntries(bytes) {
  const eocdOff = findEOCD(bytes);
  if (eocdOff < 0) return null;
  const centralDirOffset = readU32(bytes, eocdOff + 16);
  const numEntries = readU16(bytes, eocdOff + 8);
  const entries = [];
  let off = centralDirOffset;
  for (let i = 0; i < numEntries && off + 46 <= bytes.length; i++) {
    if (readU32(bytes, off) !== ZIP_SIG_CENTRAL) break;
    const method = readU16(bytes, off + 10);
    const compressedSize = readU32(bytes, off + 20);
    const uncompressedSize = readU32(bytes, off + 24);
    const fileNameLen = readU16(bytes, off + 28);
    const extraLen = readU16(bytes, off + 30);
    const commentLen = readU16(bytes, off + 32);
    const localHeaderOffset = readU32(bytes, off + 42);
    const nameBytes = bytes.subarray(off + 46, off + 46 + fileNameLen);
    const fileName = new TextDecoder('utf-8', { fatal: false }).decode(nameBytes);
    entries.push({
      fileName,
      localHeaderOffset,
      method,
      compressedSize,
      uncompressedSize,
      extraLen,
      commentLen,
      centralHeaderLen: 46 + fileNameLen + extraLen + commentLen
    });
    off += 46 + fileNameLen + extraLen + commentLen;
  }
  return entries;
}

export async function extractZipFileContent(bytes, entry) {
  let off = entry.localHeaderOffset;
  if (readU32(bytes, off) !== ZIP_SIG_LOCAL) return null;
  const fileNameLen = readU16(bytes, off + 26);
  const extraLen = readU16(bytes, off + 28);
  const dataOffset = off + 30 + fileNameLen + extraLen;
  const compressed = bytes.subarray(dataOffset, dataOffset + entry.compressedSize);
  if (entry.method === ZIP_METHOD_STORED) {
    return new TextDecoder('utf-8', { fatal: false }).decode(compressed);
  }
  if (entry.method === ZIP_METHOD_DEFLATE) {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(compressed);
        controller.close();
      }
    });
    const ds = new DecompressionStream('deflate-raw');
    const decompressed = await new Response(stream.pipeThrough(ds)).arrayBuffer();
    return new TextDecoder('utf-8', { fatal: false }).decode(decompressed);
  }
  return null;
}

export function findFirstUsableZipEntry(entries) {
  for (const e of entries) {
    const name = (e.fileName || '').replace(/\\/g, '/');
    if (name.endsWith('/')) continue;
    const lower = name.toLowerCase();
    if (lower.endsWith('package.xml')) continue;
    if (lower.endsWith('-meta.xml')) continue;
    return e;
  }
  return null;
}

export async function readZipFirstUsableFile(bytes) {
  const entries = getZipEntries(bytes);
  if (!entries || !entries.length) return null;
  const entry = findFirstUsableZipEntry(entries);
  if (!entry) return null;
  const content = await extractZipFileContent(bytes, entry);
  if (content == null) return null;
  return { content, fileName: entry.fileName };
}

export function normalizeRetrieveZipPath(rawPath) {
  let p = String(rawPath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  const parts = p.split('/').filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0].toLowerCase();
    if (first === 'unpackaged' || first === 'unpackage') {
      p = parts.slice(1).join('/');
    }
  }
  return p;
}

export async function readZipAllTextFiles(bytes) {
  const entries = getZipEntries(bytes);
  if (!entries || !entries.length) return [];
  const out = [];
  for (const e of entries) {
    let name = (e.fileName || '').replace(/\\/g, '/');
    if (name.endsWith('/')) continue;
    if (name.includes('__MACOSX/')) continue;
    const lower = name.toLowerCase();
    if (lower === 'package.xml' || lower.endsWith('/package.xml')) continue;
    if (lower.endsWith('-meta.xml')) continue;
    const content = await extractZipFileContent(bytes, e);
    if (content == null) continue;
    out.push({ path: name, content });
  }
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}
