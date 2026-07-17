/** Ayuda contextual por pestaña del visor de log Apex. */

export const apexLogViewerTabHelpEs = {
  'apexLogViewer.help.modalTitle':
    "Ayuda de vistas del log",
  'apexLogViewer.help.navButton':
    "Ayuda de las vistas",
  'apexLogViewer.help.panelButton':
    "Ayuda de esta vista",
  'apexLogViewer.help.close':
    "Cerrar",
  'apexLogViewer.help.section.purpose':
    "Para qué sirve",
  'apexLogViewer.help.section.shows':
    "Qué muestra",
  'apexLogViewer.help.section.actions':
    "Cómo usarla",
  'apexLogViewer.help.section.tips':
    "Consejos",
  'apexLogViewer.help.summary.purpose':
    "Vista de entrada recomendada al abrir un log. Ofrece una foto global de la ejecución antes de profundizar en otras pestañas.",
  'apexLogViewer.help.summary.shows':
    "Tarjetas KPI: duración, tamaño, SOQL (límite), DML, callouts y errores||Barra de contexto: usuario, punto de entrada, mensajes debug y registros tocados||Panel Estado: errores, avisos o log truncado||Panel Gobernadores: límites por encima del 50 %||Destacados: operación más lenta, SOQL duplicados o exentos||Accesos rápidos a otras pestañas",
  'apexLogViewer.help.summary.actions':
    "Usa los botones «Ir a» para saltar a SOQL, Límites, Cronología, etc.||Clic en la operación más lenta o en «Ver línea» para ir al log||Los registros tocados enlazan a la org cuando hay URL disponible",
  'apexLogViewer.help.summary.tips':
    "Los KPI de arriba son la foto rápida; el resto te dice si hay algo urgente||Si el panel Gobernadores está vacío, el consumo es bajo||Para el detalle completo usa las pestañas enlazadas abajo",
  'apexLogViewer.help.errors.purpose':
    "Vista centralizada de todos los errores detectados en el log: excepciones Apex, respuestas HTTP fallidas y validaciones que no pasan.",
  'apexLogViewer.help.errors.shows':
    "Errores de ejecución con descripción completa||Callouts HTTP con código de estado ≥ 400||Reglas de validación con resultado fail||Contador y filtro de búsqueda global",
  'apexLogViewer.help.errors.actions':
    "Usa «Ver línea» o haz clic en una fila para saltar al texto del log||Filtra por mensaje, endpoint o nombre de regla||El chip «Log con errores» en la barra superior abre esta pestaña",
  'apexLogViewer.help.errors.tips':
    "Si no hay errores de ejecución pero sí HTTP o validaciones, revisa esas secciones||Los avisos del parser (log truncado, etc.) aparecen en Resumen, no aquí",
  'apexLogViewer.help.timeline.purpose':
    "Visualiza cuándo ocurre cada evento y cuánto dura, en un diagrama tipo Gantt interactivo.",
  'apexLogViewer.help.timeline.shows':
    "Barras por SOQL, DML, métodos, flows, callouts, validaciones y otros eventos con duración||Leyenda de colores por tipo de evento||Mini-mapa (overview) de toda la ventana temporal||Indicador de fragmento seleccionado y duración total visible",
  'apexLogViewer.help.timeline.actions':
    "Arrastra los bordes del brush en el overview para acotar la ventana de tiempo||Usa «Ventana completa» para resetear el zoom||Expandir o contraer secciones del árbol de ejecución||Exportar la selección a CSV o JSON||Clic en una barra para ir a la línea del log||Filtra eventos por texto desde la barra de herramientas",
  'apexLogViewer.help.timeline.tips':
    "Las barras con indicador de error señalan eventos problemáticos||Usa el filtro de texto para acotar por clase, método o endpoint||Si una barra parece corta, amplía la ventana: puede haber solapamiento con otras operaciones",
  'apexLogViewer.help.text.purpose':
    "Muestra el log íntegro, línea a línea, en un editor con resaltado de sintaxis Apex.",
  'apexLogViewer.help.text.shows':
    "Todas las líneas del archivo de log tal como Salesforce las generó||Contador «Mostrando X de Y líneas» según los filtros activos||Resaltado temporal al navegar desde otra vista",
  'apexLogViewer.help.text.actions':
    "Activa o desactiva tipos: SOQL, DML, debug, callout, límites, errores, métodos, unidades y ruido||«Solo relevante» deja lo útil para depurar y oculta ruido||«Mostrar todo» restaura todas las categorías||Desde Resumen o el chip de error puedes saltar directamente a una línea",
  'apexLogViewer.help.text.tips':
    "Úsala cuando necesites contexto inmediatamente antes o después de una línea||El ruido incluye líneas muy verbosas que rara vez aportan en una primera pasada||Otras vistas (Cronología, Árbol, tablas) te traen aquí al seleccionar una fila",
  'apexLogViewer.help.tree.purpose':
    "Representa la ejecución como un árbol jerárquico: qué métodos y unidades contienen a qué.",
  'apexLogViewer.help.tree.shows':
    "Estructura indentada con duraciones por nodo||Plegado automático de bloques largos para reducir scroll||Sincronización con el número de línea del log",
  'apexLogViewer.help.tree.actions':
    "Filtra nodos por texto||«Solo >100 ms» oculta operaciones rápidas||«Solo errores» aísla ramas con fallos||Clic en una fila para ir a la línea en la pestaña Texto||Expandir o contraer nodos manualmente",
  'apexLogViewer.help.tree.tips':
    "Ideal para transacciones grandes con muchos niveles de llamadas||Si el árbol es muy profundo, combina filtro de texto con «Solo >100 ms»||La duración en cada nodo ayuda a localizar el cuello de botella sin abrir Cronología",
  'apexLogViewer.help.debug.purpose':
    "Aísla únicamente las líneas USER_DEBUG producidas por System.debug y declaraciones similares.",
  'apexLogViewer.help.debug.shows':
    "Método Apex, nivel de log, mensaje y número de línea||Detección automática de JSON embebido en el mensaje||Chips de resumen con conteo de mensajes y mensajes con JSON",
  'apexLogViewer.help.debug.actions':
    "Filtra por método con el desplegable||Busca texto libre en los mensajes||Expande JSON formateado cuando esté disponible||Copia el mensaje completo o solo el JSON",
  'apexLogViewer.help.debug.tips':
    "Filtra por método cuando un trigger o clase genera mucho ruido||Los payloads JSON suelen ser respuestas de integraciones o dumps de estructuras||Cruza con Callouts si el debug imprime antes o después de un HTTP request",
  'apexLogViewer.help.soql.purpose':
    "Analiza todas las consultas SOQL del log, priorizando rendimiento y duplicados.",
  'apexLogViewer.help.soql.shows':
    "Sección «Cuentan para el límite SOQL»: consultas que incrementan el contador (100/200)||Sección «No cuentan»: Custom Metadata (__mdt), subconsultas padre-hijo (AGGS) y otras exentas||Columnas: línea, duración, filas, contexto Apex, agregaciones y query||Bloque «Consultas repetidas» solo entre las que sí cuentan||Chips: cuentan límite, exentas, total en log, filas y duración",
  'apexLogViewer.help.soql.actions':
    "Busca en el texto de las consultas (ambas secciones)||Clic en una fila para ir a la línea del log||Copia la query con el botón de la fila||Clic en una consulta repetida para filtrar la tabla con esa query",
  'apexLogViewer.help.soql.tips':
    "Las consultas __mdt no consumen el límite de 100 SOQL en Apex (sí cuentan filas hacia 50k)||Las subconsultas padre-hijo usan el límite AGGS, no el de SOQL principal||Compara «Cuentan límite» con Límites → SOQL queries y con Profiling acumulado",
  'apexLogViewer.help.dml.purpose':
    "Revisa inserciones, actualizaciones, eliminaciones y upserts registrados en el log.",
  'apexLogViewer.help.dml.shows':
    "Cada operación con tipo, objeto, filas afectadas, duración y línea del log||Agrupación alternable: por tipo de operación (Insert, Update…) o por objeto sObject||Filas de grupo con totales de operaciones, filas y tiempo",
  'apexLogViewer.help.dml.actions':
    "Busca por operación u objeto||Cambia el modo de agrupación con los botones de la barra||Clic en una fila para ir al log||Expande grupos para ver el detalle",
  'apexLogViewer.help.dml.tips':
    "Agrupa por objeto para ver qué sObjects concentran más DML||Un pico de filas con poca duración puede indicar bulk bien hecho; al revés, revisar optimización||Cruza con Workflow si sospechas field updates automáticos",
  'apexLogViewer.help.limits.purpose':
    "Controla el consumo de límites de gobernador a lo largo de la ejecución.",
  'apexLogViewer.help.limits.shows':
    "Picos por límite: SOQL queries, DML rows, CPU time, heap, callouts, etc.||Gráfico de progresión a partir de eventos LIMIT_USAGE en orden cronológico||Valores usados vs máximo permitido en cada punto",
  'apexLogViewer.help.limits.actions':
    "Clic en una fila o punto del gráfico para ir a la línea LIMIT_USAGE correspondiente",
  'apexLogViewer.help.limits.tips':
    "Si el log está truncado, los picos pueden ser menores que el consumo real||Un SOQL query count alto junto a consultas repetidas en la pestaña SOQL confirma riesgo de límite||Compara CPU y heap con Profiling para ver qué métodos acumulan más",
  'apexLogViewer.help.callouts.purpose':
    "Depura integraciones HTTP: REST, SOAP y llamadas a servicios externos.",
  'apexLogViewer.help.callouts.shows':
    "Endpoint, código de estado HTTP, duración y línea del log||Emparejamiento automático REQUEST ↔ RESPONSE por callout||Chips con conteo total y duración acumulada",
  'apexLogViewer.help.callouts.actions':
    "Busca por URL o endpoint||Clic en una fila para ir al log y ver headers/body en la pestaña Texto",
  'apexLogViewer.help.callouts.tips':
    "Callouts lentos también aparecen en Resumen y Cronología||Si el status no es 2xx, revisa la línea en Texto para el cuerpo de error||Cruza el endpoint con mensajes debug de la misma ventana temporal",
  'apexLogViewer.help.profiling.purpose':
    "Resume el bloque CUMULATIVE_PROFILING que Salesforce añade al final del log (si no está truncado).",
  'apexLogViewer.help.profiling.shows':
    "Una sección a la vez mediante el selector: Métodos, SOQL acumulado o DML acumulado||Por entrada: ubicación Apex, línea, número de ejecuciones, tiempo total y detalle (query u operación)||Hasta 50 entradas por sección, ordenadas por impacto",
  'apexLogViewer.help.profiling.actions':
    "Cambia de sección con el control segmentado superior||Clic en una fila para ir a la línea del log",
  'apexLogViewer.help.profiling.tips':
    "Si la vista está vacía, el log puede estar truncado antes del bloque de profiling||SOQL acumulado aquí muestra coste por ubicación; la pestaña SOQL lista cada ejecución individual||El entry point externo (p. ej. trigger, botón) suele aparecer al inicio del bloque de métodos",
  'apexLogViewer.help.validations.purpose':
    "Lista solo reglas de validación ejecutadas durante la transacción, separadas de workflow.",
  'apexLogViewer.help.validations.shows':
    "Nombre de la regla, resultado (pass/fail), contexto de ejecución y línea del log||Chips con total de validaciones y número de fallos",
  'apexLogViewer.help.validations.actions':
    "Busca por nombre de regla||Clic en una fila para ir al log||Filtra mentalmente los fail: suelen explicar un rollback o error de guardado",
  'apexLogViewer.help.validations.tips':
    "Vista dedicada sin mezclar workflow clásico ni field updates||Un fail correlaciona con líneas de error en Texto o con el chip de error en la cabecera||Busca por nombre de regla si conoces cuál debería haberse ejecutado",
  'apexLogViewer.help.workflow.purpose':
    "Muestra solo reglas de workflow y actualizaciones de campo disparadas en la ejecución.",
  'apexLogViewer.help.workflow.shows':
    "Regla de workflow, tipo de evento, campo actualizado, valor y resultado||Separado de validaciones para un análisis más claro||Chips con conteo de eventos de workflow",
  'apexLogViewer.help.workflow.actions':
    "Busca por nombre de regla o acción||Clic en una fila para ir al log",
  'apexLogViewer.help.workflow.tips':
    "En orgs migradas a Flow puede haber poco workflow clásico||Los field updates pueden explicar DML en objetos relacionados: cruza con la pestaña DML||Usa Cronología para ver si el workflow ocurre al final de la transacción",
  'apexLogViewer.help.database.purpose':
    "Vista unificada de acceso a datos: consultas SOQL, operaciones DML y límites de gobernador.",
  'apexLogViewer.help.database.shows':
    "Segmentos SOQL, DML y Límites con las mismas tablas y filtros que antes||Duplicados SOQL, consultas exentas y picos de límites",
  'apexLogViewer.help.database.actions':
    "Cambia de segmento con los botones superiores||Filtra y ordena en cada tabla||Clic en fila para ir al log",
  'apexLogViewer.help.database.tips':
    "Empieza por SOQL si sospechas de rendimiento||Revisa Límites si la transacción falla por gobernadores",
  'apexLogViewer.help.analysis.purpose':
    "Analiza la estructura de llamadas y el coste acumulado de métodos.",
  'apexLogViewer.help.analysis.shows':
    "Árbol jerárquico plegable||Bloque CUMULATIVE_PROFILING||Tabla agregada por método con tiempo total",
  'apexLogViewer.help.analysis.actions':
    "Usa el árbol para navegar por triggers y métodos||Ordena mentalmente la tabla agregada por tiempo total",
  'apexLogViewer.help.analysis.tips':
    "El árbol es mejor para entender el flujo; profiling para coste acumulado",
  'apexLogViewer.help.network.purpose':
    "Integraciones HTTP y mensajes de depuración del desarrollador.",
  'apexLogViewer.help.network.shows':
    "Callouts emparejados request/response||Mensajes USER_DEBUG con expansión JSON",
  'apexLogViewer.help.network.actions':
    "Cambia entre Callouts y Depuración||Filtra y salta a línea",
  'apexLogViewer.help.network.tips':
    "Los callouts con status ≥ 400 también aparecen en Errores",
  'apexLogViewer.help.platform.purpose':
    "Eventos de plataforma: reglas de validación y workflow clásico.",
  'apexLogViewer.help.platform.shows':
    "Validaciones PASS/FAIL||Eventos WF_* y field updates",
  'apexLogViewer.help.platform.actions':
    "Cambia entre Validaciones y Workflow||Busca por nombre de regla",
  'apexLogViewer.help.platform.tips':
    "Los fallos de validación también se listan en Errores",
  'apexLogViewer.help.logi.purpose':
    "Asistente de IA para entender errores, SOQL, límites y el flujo de ejecución de este log Apex.",
  'apexLogViewer.help.logi.shows':
    "Chat con acciones rápidas (errores, hotspots, callouts, etc.)||Resumen one-shot antes del chat||Indicador de iteraciones y chats restantes",
  'apexLogViewer.help.logi.actions':
    "Adjunta líneas del visor Texto o citas desde la selección||Aprueba consultas SOQL, código Apex o Flows cuando Logi lo pida||Exporta la conversación o cambia entre chats recientes del mismo log",
  'apexLogViewer.help.logi.tips':
    "Activa la telemetría en Ajustes si Logi no aparece||En modo BYOK usas tu API key de OpenRouter||Las consultas a la org son siempre de solo lectura y requieren tu aprobación",
};

export const apexLogViewerTabHelpEn = {
  'apexLogViewer.help.modalTitle':
    "Log view help",
  'apexLogViewer.help.navButton':
    "View help",
  'apexLogViewer.help.panelButton':
    "Help for this view",
  'apexLogViewer.help.close':
    "Close",
  'apexLogViewer.help.section.purpose':
    "What it is for",
  'apexLogViewer.help.section.shows':
    "What it shows",
  'apexLogViewer.help.section.actions':
    "How to use it",
  'apexLogViewer.help.section.tips':
    "Tips",
  'apexLogViewer.help.summary.purpose':
    "Recommended entry point when opening a log. Gives you a global picture of the execution before diving into other tabs.",
  'apexLogViewer.help.summary.shows':
    "KPI cards: duration, size, SOQL (limit), DML, callouts, and errors||Context bar: user, entry point, debug messages, and touched records||Status panel: errors, warnings, or truncated log||Governor limits panel: limits above 50%||Highlights: slowest operation, duplicate or exempt SOQL||Quick links to other tabs",
  'apexLogViewer.help.summary.actions':
    "Use «Go to» buttons to jump to SOQL, Limits, Timeline, etc.||Click the slowest operation or «View line» to open the log||Touched records link to the org when a URL is available",
  'apexLogViewer.help.summary.tips':
    "Top KPIs are the quick snapshot; below shows if anything needs attention||An empty Governor limits panel means low consumption||Use linked tabs below for full detail",
  'apexLogViewer.help.errors.purpose':
    "Centralized view of all errors detected in the log: Apex exceptions, failed HTTP responses, and validation failures.",
  'apexLogViewer.help.errors.shows':
    "Execution errors with full description||HTTP callouts with status code ≥ 400||Validation rules with fail result||Counter and global search filter",
  'apexLogViewer.help.errors.actions':
    "Use «View line» or click a row to jump to the log text||Filter by message, endpoint, or rule name||The «Log with errors» chip in the toolbar opens this tab",
  'apexLogViewer.help.errors.tips':
    "If there are no execution errors but HTTP or validations fail, check those sections||Parser warnings (truncated log, etc.) appear in Summary, not here",
  'apexLogViewer.help.timeline.purpose':
    "Visualizes when each event happens and how long it takes, in an interactive Gantt-style chart.",
  'apexLogViewer.help.timeline.shows':
    "Bars for SOQL, DML, methods, flows, callouts, validations, and other timed events||Color legend by event type||Overview mini-map of the full time window||Selected range indicator and visible total duration",
  'apexLogViewer.help.timeline.actions':
    "Drag the brush edges in the overview to narrow the time window||Use “Full window” to reset zoom||Expand or collapse execution tree sections||Export the selection to CSV or JSON||Click a bar to jump to the log line||Filter events by text from the toolbar",
  'apexLogViewer.help.timeline.tips':
    "Bars with an error indicator mark problematic events||Use the text filter to narrow by class, method, or endpoint||If a bar looks short, widen the window: operations may overlap",
  'apexLogViewer.help.text.purpose':
    "Shows the full log line by line in an editor with Apex syntax highlighting.",
  'apexLogViewer.help.text.shows':
    "Every line of the log file as Salesforce generated it||«Showing X of Y lines» counter based on active filters||Temporary highlight when navigating from another view",
  'apexLogViewer.help.text.actions':
    "Toggle types: SOQL, DML, debug, callout, limits, errors, methods, units, and noise||«Relevant only» keeps what matters for debugging and hides noise||«Show all» restores every category||Jump here from Summary or the error chip",
  'apexLogViewer.help.text.tips':
    "Use it when you need context immediately before or after a line||Noise includes very verbose lines that rarely help on a first pass||Other views (Timeline, Tree, tables) bring you here when you select a row",
  'apexLogViewer.help.tree.purpose':
    "Represents execution as a hierarchy: which methods and units contain what.",
  'apexLogViewer.help.tree.shows':
    "Indented structure with duration per node||Automatic folding of long blocks to reduce scrolling||Sync with the log line number",
  'apexLogViewer.help.tree.actions':
    "Filter nodes by text||«Only >100 ms» hides fast operations||«Errors only» isolates failing branches||Click a row to jump to the line in the Text tab||Expand or collapse nodes manually",
  'apexLogViewer.help.tree.tips':
    "Best for large transactions with many call levels||If the tree is very deep, combine text filter with «Only >100 ms»||Duration on each node helps find bottlenecks without opening Timeline",
  'apexLogViewer.help.debug.purpose':
    "Isolates only USER_DEBUG lines produced by System.debug and similar statements.",
  'apexLogViewer.help.debug.shows':
    "Apex method, log level, message, and line number||Automatic detection of JSON embedded in the message||Summary chips with message count and JSON messages",
  'apexLogViewer.help.debug.actions':
    "Filter by method with the dropdown||Free-text search in messages||Expand formatted JSON when available||Copy the full message or JSON only",
  'apexLogViewer.help.debug.tips':
    "Filter by method when a trigger or class generates too much noise||JSON payloads are often integration responses or structure dumps||Cross-check with Callouts if debug prints around an HTTP request",
  'apexLogViewer.help.soql.purpose':
    "Analyzes all SOQL queries in the log, prioritizing performance and duplicates.",
  'apexLogViewer.help.soql.shows':
    "«Counts toward SOQL limit» section: queries that increment the counter (100/200)||«Exempt from SOQL limit» section: Custom Metadata (__mdt), parent-child subqueries (AGGS), and other exemptions||Columns: line, duration, rows, Apex context, aggregations, and query||«Repeated queries» block only among queries that count||Chips: counts toward limit, exempt, total in log, rows, and duration",
  'apexLogViewer.help.soql.actions':
    "Search query text (both sections)||Click a row to jump to the log line||Copy the query with the row button||Click a repeated query to filter the table",
  'apexLogViewer.help.soql.tips':
    "__mdt queries do not consume the 100 SOQL limit in Apex (rows still count toward 50k)||Parent-child subqueries use the AGGS limit, not the main SOQL limit||Compare «Counts toward limit» with Limits → SOQL queries and cumulative Profiling",
  'apexLogViewer.help.dml.purpose':
    "Reviews inserts, updates, deletes, and upserts recorded in the log.",
  'apexLogViewer.help.dml.shows':
    "Each operation with type, object, affected rows, duration, and log line||Switchable grouping: by operation type (Insert, Update…) or by sObject||Group rows with totals for operations, rows, and time",
  'apexLogViewer.help.dml.actions':
    "Search by operation or object||Change grouping mode with toolbar buttons||Click a row to jump to the log||Expand groups to see detail",
  'apexLogViewer.help.dml.tips':
    "Group by object to see which sObjects concentrate the most DML||High rows with low duration may mean healthy bulk; the opposite warrants optimization||Cross-check with Workflow if you suspect automatic field updates",
  'apexLogViewer.help.limits.purpose':
    "Tracks governor limit consumption throughout the execution.",
  'apexLogViewer.help.limits.shows':
    "Peaks per limit: SOQL queries, DML rows, CPU time, heap, callouts, etc.||Progression chart from LIMIT_USAGE events in chronological order||Used vs maximum allowed at each point",
  'apexLogViewer.help.limits.actions':
    "Click a row or chart point to jump to the matching LIMIT_USAGE line",
  'apexLogViewer.help.limits.tips':
    "If the log is truncated, peaks may be lower than actual consumption||High SOQL query count plus repeated queries in the SOQL tab confirms limit risk||Compare CPU and heap with Profiling to see which methods accumulate most",
  'apexLogViewer.help.callouts.purpose':
    "Debugs HTTP integrations: REST, SOAP, and external service calls.",
  'apexLogViewer.help.callouts.shows':
    "Endpoint, HTTP status code, duration, and log line||Automatic REQUEST ↔ RESPONSE pairing per callout||Chips with total count and cumulative duration",
  'apexLogViewer.help.callouts.actions':
    "Search by URL or endpoint||Click a row to jump to the log and see headers/body in the Text tab",
  'apexLogViewer.help.callouts.tips':
    "Slow callouts also appear in Summary and Timeline||If status is not 2xx, check the line in Text for the error body||Cross-check the endpoint with debug messages from the same time window",
  'apexLogViewer.help.profiling.purpose':
    "Summarizes the CUMULATIVE_PROFILING block Salesforce appends at the end of the log (if not truncated).",
  'apexLogViewer.help.profiling.shows':
    "One section at a time via the selector: Methods, Cumulative SOQL, or Cumulative DML||Per entry: Apex location, line, execution count, total time, and detail (query or operation)||Up to 50 entries per section, sorted by impact",
  'apexLogViewer.help.profiling.actions':
    "Switch sections with the segmented control at the top||Click a row to jump to the log line",
  'apexLogViewer.help.profiling.tips':
    "If the view is empty, the log may be truncated before the profiling block||Cumulative SOQL here shows cost by location; the SOQL tab lists each individual execution||The external entry point (e.g. trigger, button) usually appears at the start of the methods block",
  'apexLogViewer.help.validations.purpose':
    "Lists only validation rules executed during the transaction, separate from workflow.",
  'apexLogViewer.help.validations.shows':
    "Rule name, result (pass/fail), execution context, and log line||Chips with validation count and failure count",
  'apexLogViewer.help.validations.actions':
    "Search by rule name||Click a row to jump to the log||Focus on failures: they often explain a rollback or save error",
  'apexLogViewer.help.validations.tips':
    "Dedicated view without mixing classic workflow or field updates||A fail often explains a rollback or save error in Text or via the error chip||Search by rule name if you know which one should have run",
  'apexLogViewer.help.workflow.purpose':
    "Shows only workflow rules and field updates fired during the execution.",
  'apexLogViewer.help.workflow.shows':
    "Workflow rule, event type, updated field, value, and result||Separated from validations for clearer analysis||Chips with workflow event count",
  'apexLogViewer.help.workflow.actions':
    "Search by rule or action name||Click a row to jump to the log",
  'apexLogViewer.help.workflow.tips':
    "In orgs migrated to Flow there may be little classic workflow||Field updates may explain DML on related objects: cross-check the DML tab||Use Timeline to see if workflow runs at the end of the transaction",
  'apexLogViewer.help.database.purpose':
    "Unified data access view: SOQL queries, DML operations, and governor limits.",
  'apexLogViewer.help.database.shows':
    "SOQL, DML, and Limits segments with the same tables and filters as before||SOQL duplicates, exempt queries, and limit peaks",
  'apexLogViewer.help.database.actions':
    "Switch segments with the top buttons||Filter and sort each table||Click a row to jump to the log",
  'apexLogViewer.help.database.tips':
    "Start with SOQL if you suspect performance issues||Check Limits if the transaction failed on governors",
  'apexLogViewer.help.analysis.purpose':
    "Analyze call structure and cumulative method cost.",
  'apexLogViewer.help.analysis.shows':
    "Foldable hierarchical tree||CUMULATIVE_PROFILING block||Aggregated method table with total time",
  'apexLogViewer.help.analysis.actions':
    "Use the tree to navigate triggers and methods||Use the aggregated table for total cost by method",
  'apexLogViewer.help.analysis.tips':
    "Tree is best for flow; profiling for cumulative cost",
  'apexLogViewer.help.network.purpose':
    "HTTP integrations and developer debug messages.",
  'apexLogViewer.help.network.shows':
    "Paired callout request/response||USER_DEBUG messages with JSON expansion",
  'apexLogViewer.help.network.actions':
    "Switch between Callouts and Debug||Filter and jump to line",
  'apexLogViewer.help.network.tips':
    "Callouts with status ≥ 400 also appear in Errors",
  'apexLogViewer.help.platform.purpose':
    "Platform events: validation rules and classic workflow.",
  'apexLogViewer.help.platform.shows':
    "PASS/FAIL validations||WF_* events and field updates",
  'apexLogViewer.help.platform.actions':
    "Switch between Validations and Workflow||Search by rule name",
  'apexLogViewer.help.platform.tips':
    "Validation failures are also listed in Errors",
  'apexLogViewer.help.logi.purpose':
    "AI assistant to understand errors, SOQL, limits, and the execution flow of this Apex log.",
  'apexLogViewer.help.logi.shows':
    "Chat with quick actions (errors, hotspots, callouts, etc.)||One-shot summary before chat||Iteration counter and remaining chats today",
  'apexLogViewer.help.logi.actions':
    "Attach lines from the Text tab or quotes from the selection||Approve SOQL, Apex code, or Flow reads when Logi asks||Export the conversation or switch between recent chats for the same log",
  'apexLogViewer.help.logi.tips':
    "Enable telemetry in Settings if Logi does not appear||In BYOK mode you use your OpenRouter API key||Org queries are read-only and always require your approval",
};
