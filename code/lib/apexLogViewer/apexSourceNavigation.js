import { findApexMethodDeclarations } from '../../../shared/apexSourceDefinitions.js';
import { bg } from '../../core/bridge.js';
import { openApexSourceViewerWithPayload } from '../openApexSourceViewer.js';
import { showToast } from '../../ui/toast.js';

const STANDARD_APEX_OWNERS = new Set([
  'apexpages', 'blob', 'boolean', 'businesshours', 'crypto', 'database', 'date', 'datetime',
  'decimal', 'double', 'encodingutil', 'enum', 'exception', 'http', 'httprequest', 'httpresponse',
  'id', 'integer', 'json', 'jsonparser', 'jsonserialize', 'list', 'long', 'map', 'math', 'messaging',
  'object', 'page', 'pattern', 'restcontext', 'schema', 'set', 'sobject', 'string', 'system', 'test',
  'time', 'type', 'url', 'userinfo'
]);

function cleanIdentifier(value) {
  const text = String(value || '').trim();
  return /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(text) ? text : '';
}

function apexLineFrom(text) {
  const match = String(text || '').match(/\[(\d+)\]/);
  return match ? Number(match[1]) : 0;
}

/**
 * Convierte las etiquetas habituales de un debug log (Class.Foo.bar, Foo.bar(),
 * apex://Foo/ACTION$bar) en un destino navegable.
 * @param {string} value
 * @returns {{ className: string, methodName: string, apexLine: number } | null}
 */
export function parseApexLogSourceLabel(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const apexLine = Number(raw.match(/:\s*line\s+(\d+)/i)?.[1] || 0);
  const uri = raw.match(/apex:\/\/([A-Za-z_][A-Za-z0-9_]*)\/(?:ACTION\$)?([A-Za-z_][A-Za-z0-9_]*)/i);
  if (uri) return { className: uri[1], methodName: uri[2], apexLine };

  const trigger = raw.match(/\bTrigger\.([A-Za-z_][A-Za-z0-9_]*)/i);
  if (trigger) return null;

  const classPrefixed = /\bClass\./i.test(raw);
  let candidate = raw
    .replace(/^.*?\bClass\./i, '')
    .replace(/:\s*line\s+\d+.*$/i, '')
    .replace(/\([^)]*\).*$/, '')
    .replace(/^[└├│─\s]*\[[^\]]+\]\s*/, '')
    .trim();
  if (/\s/.test(candidate)) {
    candidate = candidate.split(/\s+/).find((word) => word.includes('.')) || '';
  }
  const parts = candidate.split('.').filter(Boolean);
  if (parts.length >= 2) {
    // En `Class.Outer.Inner.method` la fuente recuperable es la clase Apex
    // superior (`Outer`); en las etiquetas simples `Outer.method`, también.
    const className = cleanIdentifier(classPrefixed ? parts[0] : parts[parts.length - 2]);
    const methodName = cleanIdentifier(parts[parts.length - 1]);
    if (!className || STANDARD_APEX_OWNERS.has(className.toLowerCase())) return null;
    return { className, methodName, apexLine };
  }
  const className = cleanIdentifier(candidate);
  if (!className || STANDARD_APEX_OWNERS.has(className.toLowerCase())) return null;
  return { className, methodName: '', apexLine };
}

function eventParts(line) {
  const match = String(line || '').match(/\|([A-Z_]+)\|(.*)$/);
  return match ? { event: match[1], parts: match[2].split('|') } : null;
}

function labelFromParts(parts) {
  return [...(parts || [])].reverse().find((part) => parseApexLogSourceLabel(part)) || '';
}

function directStackTarget(line) {
  const match = String(line || '').match(/\bClass\.([A-Za-z_][A-Za-z0-9_.]*):\s*line\s+(\d+)/i);
  if (!match) return null;
  const target = parseApexLogSourceLabel(`Class.${match[1]}: line ${match[2]}`);
  return target ? { ...target, apexLine: Number(match[2]), exactLine: true } : null;
}

/**
 * Precalcula el contexto de clase/método de cada línea para que todas las vistas
 * del analizador resuelvan exactamente el mismo destino.
 * @param {string} rawText
 */
export function buildApexLogSourceIndex(rawText) {
  const lines = String(rawText || '').split(/\r?\n/);
  const targets = new Map();
  const methodStack = [];
  const codeUnitStack = [];

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const fields = eventParts(line);
    if (fields?.event === 'EXECUTION_STARTED') {
      methodStack.length = 0;
      codeUnitStack.length = 0;
    }
    const direct = directStackTarget(line);
    let target = direct;

    if (fields?.event === 'CODE_UNIT_STARTED') {
      const parsed = parseApexLogSourceLabel(labelFromParts(fields.parts));
      codeUnitStack.push(parsed);
      target ||= parsed;
    }

    if (fields?.event === 'METHOD_ENTRY' || fields?.event === 'CONSTRUCTOR_ENTRY') {
      const parsed = parseApexLogSourceLabel(labelFromParts(fields.parts));
      const inherited = codeUnitStack[codeUnitStack.length - 1] || null;
      const methodTarget = parsed || inherited;
      methodStack.push(methodTarget);
      target ||= methodTarget;
    }

    const context = methodStack[methodStack.length - 1] || codeUnitStack[codeUnitStack.length - 1] || null;
    target ||= context;
    if (target) {
      const lineHint = fields ? apexLineFrom(fields.parts[0]) : 0;
      targets.set(lineNumber, { ...target, apexLine: direct?.apexLine || lineHint || target.apexLine || 0 });
    }

    if (fields?.event === 'METHOD_EXIT' || fields?.event === 'CONSTRUCTOR_EXIT') methodStack.pop();
    if (fields?.event === 'CODE_UNIT_FINISHED') codeUnitStack.pop();
    if (fields?.event === 'EXECUTION_FINISHED') {
      methodStack.length = 0;
      codeUnitStack.length = 0;
    }
  });

  return { lines, targets };
}

/** @param {ReturnType<typeof buildApexLogSourceIndex>} index */
export function resolveApexLogSourceTarget(index, hint = {}) {
  const explicitClass = cleanIdentifier(hint.className);
  if (explicitClass) {
    return {
      className: explicitClass,
      methodName: cleanIdentifier(hint.methodName),
      apexLine: Math.max(0, Number(hint.apexLine) || 0)
    };
  }
  const fromLocation = parseApexLogSourceLabel(hint.location || '');
  if (fromLocation) {
    return { ...fromLocation, apexLine: Math.max(0, Number(hint.apexLine) || fromLocation.apexLine || 0) };
  }
  const line = Math.max(0, Number(hint.line) || 0);
  const fromLine = line ? index?.targets?.get(line) || null : null;
  if (fromLine) return fromLine;
  const fromText = parseApexLogSourceLabel(hint.text || '');
  return fromText
    ? { ...fromText, apexLine: Math.max(0, Number(hint.apexLine) || fromText.apexLine || 0) }
    : null;
}

/**
 * Localiza el identificador concreto que debe mostrarse como enlace dentro de
 * una línea del log. Se prioriza el método y se usa la clase como fallback.
 * Las columnas devueltas siguen el convenio 1-based de Monaco.
 */
export function findApexLogSourceTokenRange(lineText, target) {
  const text = String(lineText || '');
  const candidates = [cleanIdentifier(target?.methodName), cleanIdentifier(target?.className)].filter(Boolean);
  for (const name of candidates) {
    const matches = [...text.matchAll(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'))];
    const match = matches[matches.length - 1];
    if (!match || match.index == null) continue;
    return { startColumn: match.index + 1, endColumn: match.index + name.length + 1 };
  }
  return null;
}

function sourceErrorMessage(response, t) {
  if (response?.reason === 'NO_SID') return t('apexSourceViewer.errorNoSession');
  if (response?.reason === 'NOT_FOUND') return t('apexSourceViewer.errorNotFound');
  if (response?.reason === 'SOURCE_UNAVAILABLE') return t('apexSourceViewer.sourceUnavailable');
  if (String(response?.error || '').toLowerCase().includes('not saved')) return t('apexSourceViewer.errorNoOrg');
  return t('apexSourceViewer.errorSalesforce');
}

/**
 * @param {{ className: string, methodName?: string, apexLine?: number, exactLine?: boolean }} target
 * @param {{ orgId?: string, orgLabel?: string, instanceUrl?: string }} context
 * @param {(key: string, params?: object) => string} t
 */
export async function openApexLogSourceTarget(target, context, t) {
  if (!target?.className || !context?.orgId) {
    showToast(t('apexSourceViewer.errorNoOrg'), 'warn');
    return false;
  }
  let response;
  try {
    response = await bg({
      type: 'deployStatus:getApexSource',
      orgId: context.orgId,
      className: target.className
    });
  } catch {
    showToast(t('apexSourceViewer.errorSalesforce'), 'error');
    return false;
  }
  if (!response?.ok) {
    showToast(sourceErrorMessage(response, t), 'error');
    return false;
  }
  const className = String(response.name || target.className);
  const body = String(response.body || '');
  let initialLine = Math.max(0, Number(target.apexLine) || 0);
  if (target.methodName && !target.exactLine) {
    const declaration = findApexMethodDeclarations(body, className)
      .find((method) => method.name === target.methodName);
    if (declaration) initialLine = declaration.lineNumber;
  }
  const opened = await openApexSourceViewerWithPayload(`${className}.cls`, body, {
    ...(initialLine ? { initialLine } : {}),
    downloadFileName: `${className}.cls`,
    resourceId: response.id || '',
    resourceName: className,
    resourceType: 'ApexClass',
    orgId: context.orgId,
    orgLabel: context.orgLabel || '',
    instanceUrl: context.instanceUrl || ''
  });
  if (!opened) showToast(t('apexSourceViewer.errorSalesforce'), 'error');
  return opened;
}
