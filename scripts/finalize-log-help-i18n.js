import fs from 'fs';

function parseBlockFile(path) {
  const s = fs.readFileSync(path, 'utf8');
  const start = s.indexOf("'apexLogViewer.help.modalTitle'");
  const end = s.indexOf("'apexLogViewer.meta.size'", start);
  const body = s.slice(start, end);
  return Function(`"use strict"; return ({${body}});`)();
}

const es = parseBlockFile('scripts/_block0.txt');
const en = parseBlockFile('scripts/_block1.txt');

const esFixes = {
  'apexLogViewer.help.summary.shows':
    'Tarjetas KPI: consultas SOQL, operaciones DML, mensajes debug, callouts y errores||Usuario y contexto de la ejecución (tipo de log, clase, método)||IDs de registros tocados (Account, Case, Contact, User…) con enlace a la org si está disponible||Ranking de operaciones más lentas||Cadena de unidades de código ejecutadas (métodos, flows, triggers)',
  'apexLogViewer.help.summary.tips':
    'Empieza aquí si no sabes por dónde investigar||Si los KPIs muestran muchos callouts o SOQL, abre directamente esas pestañas||Compara el tiempo total con las operaciones más lentas del ranking',
  'apexLogViewer.help.timeline.actions':
    'Arrastra los bordes del brush en el overview para acotar la ventana de tiempo||Usa «Ventana completa» para resetear el zoom||Expandir o contraer secciones del árbol de ejecución||Exportar la selección a CSV o JSON||Clic en una barra para ir a la línea del log||Filtra eventos por texto desde la barra de herramientas',
  'apexLogViewer.help.timeline.tips':
    'Las barras con indicador de error señalan eventos problemáticos||Usa el filtro de texto para acotar por clase, método o endpoint||Si una barra parece corta, amplía la ventana: puede haber solapamiento con otras operaciones',
  'apexLogViewer.help.callouts.tips':
    'Callouts lentos también aparecen en Resumen y Cronología||Si el status no es 2xx, revisa la línea en Texto para el cuerpo de error||Cruza el endpoint con mensajes debug de la misma ventana temporal',
  'apexLogViewer.help.validations.tips':
    'Vista dedicada sin mezclar workflow clásico ni field updates||Un fail correlaciona con líneas de error en Texto o con el chip de error en la cabecera||Busca por nombre de regla si conoces cuál debería haberse ejecutado'
};

const enFixes = {
  'apexLogViewer.help.summary.shows':
    'KPI cards: SOQL queries, DML operations, debug messages, callouts, and errors||User and execution context (log type, class, method)||Touched record IDs (Account, Case, Contact, User…) with org link when available||Ranking of slowest operations||Chain of executed code units (methods, flows, triggers)',
  'apexLogViewer.help.summary.tips':
    'Start here if you are unsure where to investigate||If KPIs show many callouts or SOQL, open those tabs directly||Compare total time with the slowest operations in the ranking',
  'apexLogViewer.help.timeline.actions':
    'Drag the brush edges in the overview to narrow the time window||Use “Full window” to reset zoom||Expand or collapse execution tree sections||Export the selection to CSV or JSON||Click a bar to jump to the log line||Filter events by text from the toolbar',
  'apexLogViewer.help.timeline.tips':
    'Bars with an error indicator mark problematic events||Use the text filter to narrow by class, method, or endpoint||If a bar looks short, widen the window: operations may overlap',
  'apexLogViewer.help.callouts.tips':
    'Slow callouts also appear in Summary and Timeline||If status is not 2xx, check the line in Text for the error body||Cross-check the endpoint with debug messages from the same time window',
  'apexLogViewer.help.validations.tips':
    'Dedicated view without mixing classic workflow or field updates||A fail often explains a rollback or save error in Text or via the error chip||Search by rule name if you know which one should have run'
};

const clean = { ...es, ...esFixes };
const cleanEn = { ...en, ...enFixes };

function emit(obj) {
  return Object.entries(obj)
    .map(([k, v]) => `  '${k}':\n    ${JSON.stringify(v)},`)
    .join('\n');
}

fs.writeFileSync(
  'shared/i18nApexLogViewerTabHelp.js',
  `/** Ayuda contextual por pestaña del visor de log Apex. */

export const apexLogViewerTabHelpEs = {
${emit(clean)}
};

export const apexLogViewerTabHelpEn = {
${emit(cleanEn)}
};
`
);
console.log('keys', Object.keys(clean).length);
