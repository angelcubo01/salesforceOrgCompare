import fs from 'fs';

const transcript =
  'C:/Users/0020553/.cursor/projects/c-Users-0020553-Desktop-SalesforceOrgCompare/agent-transcripts/04b73f35-2769-4eb8-a31f-1ecb4db0f5a2/04b73f35-2769-4eb8-a31f-1ecb4db0f5a2.jsonl';
const raw = fs.readFileSync(transcript, 'utf8');

function extract(marker, endMarker) {
  const idx = raw.indexOf(marker);
  const end = raw.indexOf(endMarker, idx);
  if (idx < 0 || end < 0) return null;
  return raw.slice(idx, end).trim().replace(/\\n/g, '\n');
}

const es = extract(
  "'apexLogViewer.help.modalTitle': 'Ayuda de vistas del log'",
  "'apexLogViewer.meta.size'"
);
const en = extract(
  "'apexLogViewer.help.modalTitle': 'Log view help'",
  "'apexLogViewer.meta.size'"
);

console.log('ES len', es?.length, 'EN len', en?.length);
if (es) fs.writeFileSync('scripts/_es-help-snippet.txt', es);
if (en) fs.writeFileSync('scripts/_en-help-snippet.txt', en);
