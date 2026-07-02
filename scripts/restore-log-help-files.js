import fs from 'fs';

const transcript =
  'C:/Users/0020553/.cursor/projects/c-Users-0020553-Desktop-SalesforceOrgCompare/agent-transcripts/04b73f35-2769-4eb8-a31f-1ecb4db0f5a2/04b73f35-2769-4eb8-a31f-1ecb4db0f5a2.jsonl';
const lines = fs.readFileSync(transcript, 'utf8').split('\n');
const line120 = JSON.parse(lines[119]);
for (const c of line120.message.content) {
  if (c.type === 'tool_use' && c.input?.path?.includes('tabHelpContent.js')) {
    fs.writeFileSync('code/lib/apexLogViewer/tabHelpContent.js', c.input.contents);
    console.log('restored tabHelpContent.js');
  }
  if (c.type === 'tool_use' && c.input?.path?.includes('tabHelpModal.js')) {
    fs.writeFileSync('code/lib/apexLogViewer/tabHelpModal.js', c.input.contents);
    console.log('restored tabHelpModal.js');
  }
}
