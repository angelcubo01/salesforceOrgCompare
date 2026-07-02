import fs from 'fs';

const transcript =
  'C:/Users/0020553/.cursor/projects/c-Users-0020553-Desktop-SalesforceOrgCompare/agent-transcripts/04b73f35-2769-4eb8-a31f-1ecb4db0f5a2/04b73f35-2769-4eb8-a31f-1ecb4db0f5a2.jsonl';
const lines = fs.readFileSync(transcript, 'utf8').split('\n');

function extractFromLine(lineNum, endMarker) {
  const line = lines[lineNum - 1];
  const j = JSON.parse(line);
  for (const c of j.message.content) {
    if (c.type !== 'tool_use' || !c.input?.new_string?.includes('apexLogViewer.help.section.purpose')) continue;
    const s = c.input.new_string;
    const start = s.indexOf("'apexLogViewer.help.modalTitle'");
    const end = s.indexOf(endMarker, start);
    return s.slice(start, end).trim();
  }
  return null;
}

const esBlock = extractFromLine(121, "'apexLogViewer.meta.size'");
// EN might be in a later line - search all lines
let enBlock = null;
for (let i = 0; i < lines.length; i++) {
  if (!lines[i].includes('apexLogViewer.help.section.purpose')) continue;
  try {
    const j = JSON.parse(lines[i]);
    for (const c of j.message.content) {
      const s = c.input?.new_string || '';
      if (!s.includes("'apexLogViewer.help.section.purpose'") || s.includes('Para qué sirve')) continue;
      const start = s.indexOf("'apexLogViewer.help.modalTitle'");
      const end = s.indexOf("'apexLogViewer.meta.size'", start);
      if (start >= 0 && end > start) enBlock = s.slice(start, end).trim();
    }
  } catch {
    /* skip */
  }
}

function toObject(block) {
  if (!block) return {};
  const wrapped = `{${block}}`;
  // eslint-disable-next-line no-new-func
  return Function(`"use strict"; return (${wrapped});`)();
}

const es = toObject(esBlock);
const en = toObject(enBlock);
console.log('ES keys', Object.keys(es).length, 'EN keys', Object.keys(en).length);

const out = `/** Ayuda contextual por pestaña del visor de log Apex. */

export const apexLogViewerTabHelpEs = ${JSON.stringify(es, null, 2).replace(/"([^"]+)":/g, "'$1':")};

export const apexLogViewerTabHelpEn = ${JSON.stringify(en, null, 2).replace(/"([^"]+)":/g, "'$1':")};
`;

// Use eval approach for proper export file
const esEntries = Object.entries(es).map(([k, v]) => `  '${k}':\n    ${JSON.stringify(v)},`).join('\n');
const enEntries = Object.entries(en).map(([k, v]) => `  '${k}':\n    ${JSON.stringify(v)},`).join('\n');

const module = `/** Ayuda contextual por pestaña del visor de log Apex. */

export const apexLogViewerTabHelpEs = {
${esEntries}
};

export const apexLogViewerTabHelpEn = {
${enEntries}
};
`;

fs.writeFileSync('shared/i18nApexLogViewerTabHelp.js', module);
console.log('wrote shared/i18nApexLogViewerTabHelp.js');
