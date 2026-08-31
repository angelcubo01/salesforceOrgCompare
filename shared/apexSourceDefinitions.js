const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const STANDARD_TYPES = new Set([
  'System', 'String', 'Integer', 'Long', 'Decimal', 'Double', 'Boolean', 'Date', 'Datetime',
  'Time', 'Id', 'Object', 'List', 'Set', 'Map', 'Schema', 'Database', 'JSON', 'Math',
  'Pattern', 'Matcher', 'Test', 'Limits', 'UserInfo', 'Crypto', 'Encoding', 'Http',
  'HttpRequest', 'HttpResponse', 'RestContext', 'Trigger', 'ApexPages', 'Messaging'
]);

export function isApexIdentifier(value) {
  return IDENTIFIER_RE.test(String(value || ''));
}

function looksLikeApexClassName(value) {
  return /^[A-Z]/.test(value) || /^[A-Za-z_][A-Za-z0-9_]*__[A-Z]/.test(value);
}

/** Sustituye comentarios y strings por espacios, conservando offsets y líneas. */
export function maskApexNonCode(source) {
  const input = String(source || '');
  const out = input.split('');
  let state = 'code';
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const next = input[i + 1];
    if (state === 'code' && ch === '/' && next === '/') {
      out[i] = out[i + 1] = ' '; i += 1; state = 'line'; continue;
    }
    if (state === 'code' && ch === '/' && next === '*') {
      out[i] = out[i + 1] = ' '; i += 1; state = 'block'; continue;
    }
    if (state === 'code' && ch === '\'') { out[i] = ' '; state = 'quote'; continue; }
    if (state === 'code' && ch === '"') { out[i] = ' '; state = 'double'; continue; }
    if (state === 'line') {
      if (ch === '\n') state = 'code'; else out[i] = ' ';
      continue;
    }
    if (state === 'block') {
      if (ch === '*' && next === '/') { out[i] = out[i + 1] = ' '; i += 1; state = 'code'; }
      else if (ch !== '\n') out[i] = ' ';
      continue;
    }
    if (state === 'quote' || state === 'double') {
      const quote = state === 'quote' ? '\'' : '"';
      if (ch === '\\') { out[i] = ' '; if (next && next !== '\n') { out[i + 1] = ' '; i += 1; } }
      else { if (ch !== '\n') out[i] = ' '; if (ch === quote || ch === '\n') state = 'code'; }
    }
  }
  return out.join('');
}

function offsetFromPosition(source, lineNumber, column) {
  const lines = String(source || '').split('\n');
  const line = Math.max(1, Math.min(lines.length, Number(lineNumber) || 1));
  const before = lines.slice(0, line - 1).reduce((size, part) => size + part.length + 1, 0);
  return before + Math.max(0, Math.min(lines[line - 1].length, (Number(column) || 1) - 1));
}

function positionFromOffset(source, offset) {
  const before = String(source || '').slice(0, Math.max(0, offset));
  const lineNumber = before.split('\n').length;
  return { lineNumber, column: before.length - before.lastIndexOf('\n') };
}

function wordAt(source, offset) {
  const text = String(source || '');
  let start = Math.min(Math.max(0, offset), text.length);
  if (!/[A-Za-z0-9_]/.test(text[start] || '') && /[A-Za-z0-9_]/.test(text[start - 1] || '')) start -= 1;
  if (!/[A-Za-z_]/.test(text[start] || '')) return null;
  let end = start + 1;
  while (/[A-Za-z0-9_]/.test(text[start - 1] || '')) start -= 1;
  while (/[A-Za-z0-9_]/.test(text[end] || '')) end += 1;
  const name = text.slice(start, end);
  return isApexIdentifier(name) ? { name, start, end } : null;
}

function skipWs(text, index) {
  let i = index;
  while (/\s/.test(text[i] || '')) i += 1;
  return i;
}

function matchingParen(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')' && --depth === 0) return i;
  }
  return -1;
}

export function countApexArguments(text) {
  const value = String(text || '').trim();
  if (!value) return 0;
  let depth = 0; let count = 1;
  for (const ch of value) {
    if ('(<[{'.includes(ch)) depth += 1;
    else if (')>]}'.includes(ch)) depth = Math.max(0, depth - 1);
    else if (ch === ',' && depth === 0) count += 1;
  }
  return count;
}

function qualifierBefore(text, wordStart) {
  let i = wordStart - 1;
  while (/\s/.test(text[i] || '')) i -= 1;
  if (text[i] !== '.') return '';
  i -= 1;
  let depth = 0;
  for (; i >= 0; i -= 1) {
    const ch = text[i];
    if (ch === ')') depth += 1;
    else if (ch === '(') depth -= 1;
    if (depth === 0 && /[;{}=,\n]/.test(ch)) break;
  }
  const raw = text.slice(i + 1, wordStart - 1).trim();
  // `return Clase.metodo()` y expresiones similares: conservamos únicamente
  // la expresión inmediatamente anterior al punto, no la palabra return.
  return raw.split(/\s+/).at(-1) || '';
}

/** Símbolo navegable bajo una posición Monaco. No considera comentarios ni strings. */
export function findApexSymbolAt(source, lineNumber, column) {
  const clean = maskApexNonCode(source);
  const offset = offsetFromPosition(source, lineNumber, column);
  if (!/[A-Za-z0-9_]/.test(clean[offset] || '') && !/[A-Za-z0-9_]/.test(clean[offset - 1] || '')) return null;
  const token = wordAt(clean, offset);
  if (!token) return null;
  const next = skipWs(clean, token.end);
  const prev = clean.slice(0, token.start);
  const qualifier = qualifierBefore(clean, token.start);
  if (clean[next] === '(') {
    const close = matchingParen(clean, next);
    if (close < 0) return null;
    const isConstructor = /\bnew\s*$/.test(prev);
    return {
      kind: isConstructor ? 'constructor' : 'method', name: token.name, qualifier,
      argumentCount: countApexArguments(clean.slice(next + 1, close)),
      lineNumber, column: token.start - offsetFromPosition(source, lineNumber, 1) + 1
    };
  }
  // Clase en `new Clase()` o en `Clase.metodo()`.
  const after = skipWs(clean, token.end);
  if (/\bnew\s*$/.test(prev) || (clean[after] === '.' && looksLikeApexClassName(token.name))) {
    return { kind: 'class', name: token.name, qualifier: '', argumentCount: 0, lineNumber, column: token.start - offsetFromPosition(source, lineNumber, 1) + 1 };
  }
  return null;
}

function matchingBrace(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}' && --depth === 0) return i;
  }
  return -1;
}

/** Declaraciones Apex tolerantes a firmas multilínea y genéricos. */
export function findApexMethodDeclarations(source, className = '') {
  const clean = maskApexNonCode(source);
  const results = [];
  for (let open = clean.indexOf('('); open >= 0; open = clean.indexOf('(', open + 1)) {
    const close = matchingParen(clean, open);
    if (close < 0) break;
    const before = clean.slice(Math.max(0, Math.max(clean.lastIndexOf(';', open), clean.lastIndexOf('{', open), clean.lastIndexOf('}', open)) + 1), open);
    const words = [...before.matchAll(/\b[A-Za-z_][A-Za-z0-9_]*\b/g)];
    const last = words.at(-1);
    if (!last || before.slice(last.index + last[0].length).trim()) continue;
    const name = last[0];
    if (!isApexIdentifier(name) || /\b(if|for|while|switch|catch|return|new)\s*$/.test(before)) continue;
    let after = skipWs(clean, close + 1);
    if (clean.startsWith('throws', after)) after = skipWs(clean, after + 6);
    while (/[A-Za-z0-9_.,\s]/.test(clean[after] || '') && clean[after] !== '{' && clean[after] !== ';') after += 1;
    if (clean[after] !== '{' && clean[after] !== ';') continue;
    // Llamadas terminan normalmente en ;, nunca parten de una cabecera con tipo/modificador.
    const hasDeclarationPrefix = words.length >= 2 || name === className || /\b(public|private|protected|global|static|virtual|override|abstract|testmethod|webservice)\b/.test(before);
    if (!hasDeclarationPrefix) continue;
    const bodyEnd = clean[after] === '{' ? matchingBrace(clean, after) : after;
    const params = clean.slice(open + 1, close);
    const nameOffset = Math.max(0, before.lastIndexOf(name)) + Math.max(clean.lastIndexOf(';', open), clean.lastIndexOf('{', open), clean.lastIndexOf('}', open)) + 1;
    const position = positionFromOffset(source, nameOffset);
    results.push({
      kind: name === className ? 'constructor' : 'method', name, argumentCount: countApexArguments(params),
      start: nameOffset, end: bodyEnd, params, lineNumber: position.lineNumber, column: position.column,
      signature: String(source).slice(nameOffset, close + 1).replace(/\s+/g, ' ').trim()
    });
    open = close;
  }
  return results;
}

function simpleType(raw) {
  const type = String(raw || '').replace(/<.*>/g, '').trim();
  const match = type.match(/[A-Za-z_][A-Za-z0-9_]*$/);
  return match ? match[0] : '';
}

function enclosingMethod(declarations, offset) {
  return declarations.find((item) => item.start <= offset && item.end >= offset) || null;
}

/** Infiere con seguridad el dueño de una llamada: clase, parámetro, local, atributo, this/super. */
export function inferApexCallOwner(source, currentClassName, symbol, lineNumber, column) {
  if (!symbol || symbol.kind === 'class' || symbol.kind === 'constructor') return symbol?.name || '';
  const clean = maskApexNonCode(source);
  const offset = offsetFromPosition(source, lineNumber, column);
  const qualifier = String(symbol.qualifier || '').trim();
  if (!qualifier || qualifier === 'this') return currentClassName;
  if (qualifier === 'super') {
    const extendsMatch = clean.match(new RegExp(`\\bclass\\s+${String(currentClassName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+extends\\s+([A-Za-z_][A-Za-z0-9_]*)`));
    return extendsMatch?.[1] || '';
  }
  const chained = qualifier.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*[A-Za-z_][A-Za-z0-9_]*\s*\([^]*\)$/);
  if (chained && looksLikeApexClassName(chained[1])) return chained[1];
  if (isApexIdentifier(qualifier) && looksLikeApexClassName(qualifier) && !STANDARD_TYPES.has(qualifier)) return qualifier;
  if (!isApexIdentifier(qualifier)) return '';
  const declarations = findApexMethodDeclarations(source, currentClassName);
  const enclosing = enclosingMethod(declarations, offset);
  const candidates = [];
  if (enclosing?.params) candidates.push(enclosing.params);
  candidates.push(clean.slice(0, offset));
  for (const text of candidates) {
    const re = new RegExp(`(?:^|[;,{}\\n])\\s*(?:(?:public|private|protected|global|static|final|transient)\\s+)*([A-Za-z_][A-Za-z0-9_]*(?:\\s*<[^;={}()]+>)?)\\s+${qualifier}\\s*(?:[=;,)]|$)`, 'g');
    let match; let type = '';
    while ((match = re.exec(text))) type = simpleType(match[1]);
    if (type && !STANDARD_TYPES.has(type)) return type;
  }
  return '';
}

function parseSymbolTable(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return null; }
}

function locationFromSymbol(item) {
  const location = item?.location || item?.declaration?.location || item?.locations?.[0];
  const lineNumber = Number(location?.line ?? location?.lineNumber ?? item?.line ?? item?.lineNumber);
  const column = Number(location?.column ?? location?.columnNumber ?? item?.column ?? item?.columnNumber);
  return Number.isSafeInteger(lineNumber) && lineNumber > 0 ? { lineNumber, column: Number.isSafeInteger(column) && column > 0 ? column : 1 } : null;
}

/** Resuelve una definición dentro de una ApexClass ya cargada, priorizando SymbolTable. */
export function resolveDefinitionInApexClass(row, symbolName, kind, argumentCount) {
  const body = String(row?.Body || row?.body || '');
  const className = String(row?.Name || row?.name || '');
  const symbol = parseSymbolTable(row?.SymbolTable || row?.symbolTable);
  const wantedKind = kind === 'constructor' ? 'constructors' : 'methods';
  const symbolCandidates = (symbol?.[wantedKind] || []).filter((item) => String(item?.name || '') === symbolName)
    .filter((item) => !Array.isArray(item?.parameters) || item.parameters.length === argumentCount);
  const symbolResolved = symbolCandidates.map((item) => ({ item, location: locationFromSymbol(item) })).filter((x) => x.location);
  if (symbolResolved.length === 1) {
    return { ok: true, definition: { kind, classId: String(row?.Id || row?.id || ''), className, methodName: symbolName, body, ...symbolResolved[0].location } };
  }
  const fallback = findApexMethodDeclarations(body, className)
    .filter((item) => item.kind === kind && item.name === symbolName && item.argumentCount === argumentCount);
  if (fallback.length === 1) {
    const item = fallback[0];
    return { ok: true, definition: { kind, classId: String(row?.Id || row?.id || ''), className, methodName: symbolName, body, lineNumber: item.lineNumber, column: item.column } };
  }
  // La expresión de la llamada puede ser más compleja que una firma Apex
  // (por ejemplo, argumentos con genéricos o lambdas). Si la clase contiene
  // una única declaración con ese nombre, es preferible navegar a ella antes
  // que dejar la fuente ya descargada en un estado de error.
  const sameName = findApexMethodDeclarations(body, className)
    .filter((item) => item.kind === kind && item.name === symbolName);
  if (sameName.length === 1) {
    const item = sameName[0];
    return { ok: true, definition: { kind, classId: String(row?.Id || row?.id || ''), className, methodName: symbolName, body, lineNumber: item.lineNumber, column: item.column } };
  }
  const candidates = fallback.map((item) => ({ kind, classId: String(row?.Id || row?.id || ''), className, methodName: symbolName, body, lineNumber: item.lineNumber, column: item.column, signature: item.signature }));
  return candidates.length ? { ok: false, reason: 'AMBIGUOUS', candidates } : { ok: false, reason: 'NOT_FOUND' };
}
