/** Textos de ayuda (help.tool.*) y onboarding (onboarding.tool.*) — ES y EN. */

export const helpOnboardingEs = {
  'help.open': 'Ayuda',
  'help.openTitle': 'Guía de la herramienta actual',
  'help.close': 'Cerrar',
  'help.title': 'Ayuda',

  'help.tool.home.title': 'Primeros pasos',
  'help.tool.home.lead':
    'Salesforce Org Compare te permite trabajar con varios entornos Salesforce desde el navegador.',
  'help.tool.home.body1':
    'Conecta tus entornos desde el icono de la extensión. Allí puedes añadir el entorno de la pestaña actual, poner alias y agruparlos (por ejemplo PRO, UAT).',
  'help.tool.home.body2':
    'En la barra superior elige un área: Comparador, Desarrollo, Análisis, Monitorización o Manifiestos. Cada área agrupa herramientas en un submenú.',
  'help.tool.home.body3':
    'La primera vez que abras una herramienta verás un resumen breve. Usa Ctrl+Shift+P (⌘⇧P en Mac) para saltar a metadatos, herramientas o scripts guardados.',
  'help.tool.home.body4':
    'Atajos útiles: Ctrl+Enter (⌘↵) ejecutar consultas o Apex anónimo; Ctrl+S (⌘S) guardar en editores; F2 renombrar scripts; Escape cerrar modales; ? o Ayuda para esta ventana.',

  'help.tool.Comparator.title': 'Comparador de metadatos',
  'help.tool.Comparator.lead':
    'Revisa si un metadato es idéntico o ha cambiado entre dos entornos antes de desplegar.',
  'help.tool.Comparator.body1':
    'El panel izquierdo lista clases Apex, LWC, Aura, Visualforce, perfiles, permission sets y más. Los indicadores marcan igual o distinto antes de abrir el fichero.',
  'help.tool.Comparator.body2':
    'Puedes comparar un package.xml de tu equipo con un entorno, o dos manifiestos entre sí.',
  'help.tool.Comparator.body3':
    'Desde la barra del visor copia el diff, ignora espacios en blanco, exporta HTML o descarga el componente con Retrieve.',

  'help.tool.ApexTests.title': 'Hub de tests Apex',
  'help.tool.ApexTests.lead':
    'Ejecuta tests automatizados en un entorno y revisa resultados, fallos y cobertura sin salir de la aplicación.',
  'help.tool.ApexTests.body1':
    'Elige clases, métodos o suites de test y lanza la ejecución. El progreso y el resumen aparecen en pantalla.',
  'help.tool.ApexTests.body2':
    'Cuando termine, abre el detalle de cada test, la cobertura por línea o exporta el informe.',
  'help.tool.ApexTests.body3':
    'Útil antes de un deploy para comprobar que los tests pasan y que la cobertura no ha bajado.',

  'help.tool.QuickEdit.title': 'Editor Apex',
  'help.tool.QuickEdit.lead':
    'Busca una clase o trigger, edítala y publícala en el entorno seleccionado.',
  'help.tool.QuickEdit.body1':
    'Escribe el nombre en el buscador y abre el fichero en el panel con resaltado de sintaxis.',
  'help.tool.QuickEdit.body2':
    'Validate comprueba el código sin guardarlo; Deploy lo publica en el entorno.',
  'help.tool.QuickEdit.body3':
    'Sigue el estado del deploy en Deploy Status si has lanzado una publicación.',

  'help.tool.LightningQuickEdit.title': 'Editor Lightning',
  'help.tool.LightningQuickEdit.lead':
    'Edita componentes LWC y Aura y despliégalos en el entorno seleccionado.',
  'help.tool.LightningQuickEdit.body1':
    'Busca el bundle por nombre y edita HTML, JavaScript o markup en el panel.',
  'help.tool.LightningQuickEdit.body2':
    'Validate y Deploy funcionan igual que en el editor Apex.',
  'help.tool.LightningQuickEdit.body3':
    'Compara el mismo componente en el comparador si quieres ver diferencias con otro entorno.',

  'help.tool.AnonymousApex.title': 'Anonymous Apex',
  'help.tool.AnonymousApex.lead':
    'Ejecuta un fragmento de Apex puntual para probar lógica o consultar datos sin crear una clase.',
  'help.tool.AnonymousApex.body1':
    'Selecciona el entorno, escribe el código y pulsa Ejecutar.',
  'help.tool.AnonymousApex.body2':
    'Revisa la salida, los errores o abre el log generado en el visor de logs.',
  'help.tool.AnonymousApex.body3':
    'Guarda scripts que uses a menudo en la biblioteca para reutilizarlos.',

  'help.tool.QueryExplorer.title': 'Explorador de consultas',
  'help.tool.QueryExplorer.lead':
    'Consulta registros del entorno, guarda consultas útiles y compara resultados entre entornos.',
  'help.tool.QueryExplorer.body1':
    'Escribe una consulta de datos (por ejemplo registros de Account) y pulsa Ejecutar.',
  'help.tool.QueryExplorer.body2':
    'Guarda consultas con nombre y exporta resultados a CSV o JSON si lo necesitas.',
  'help.tool.QueryExplorer.body3':
    'Activa Modo comparación para ejecutar la misma consulta en dos entornos y ver diferencias alineadas.',

  'help.tool.DebugLogBrowser.title': 'Debug Log Browser',
  'help.tool.DebugLogBrowser.lead':
    'Lista y filtra los logs de depuración del entorno para investigar errores o comportamiento inesperado.',
  'help.tool.DebugLogBrowser.body1':
    'Selecciona el entorno y actualiza la lista. Filtra por usuario, aplicación o fechas.',
  'help.tool.DebugLogBrowser.body2':
    'Abre un log en el visor estructurado para ver consultas, errores, límites y mensajes de depuración sin leer el archivo línea a línea.',
  'help.tool.DebugLogBrowser.body3':
    'Elimina logs antiguos en bloque si necesitas liberar espacio en el entorno.',

  'help.tool.ApexCoverageCompare.title': 'Comparar cobertura Apex',
  'help.tool.ApexCoverageCompare.lead':
    'Comprueba si las clases Apex tienen la misma cobertura de tests en dos entornos.',
  'help.tool.ApexCoverageCompare.body1':
    'Selecciona ambos entornos y pulsa Cargar datos para obtener el porcentaje de cada clase.',
  'help.tool.ApexCoverageCompare.body2':
    'La tabla muestra el delta entre entornos. Ordena por diferencia para ver lo más desalineado.',
  'help.tool.ApexCoverageCompare.body3':
    'Abre el detalle por línea si una clase tiene cobertura distinta y quieres ver qué líneas faltan.',

  'help.tool.FieldDependency.title': 'Dependencias de picklist',
  'help.tool.FieldDependency.lead':
    'Compara cómo se relacionan los valores de listas desplegables dependientes entre entornos.',
  'help.tool.FieldDependency.body1':
    'Elige un objeto del entorno de referencia y obtén sus metadatos.',
  'help.tool.FieldDependency.body2':
    'Revisa el diff de dependencias entre el entorno izquierdo y el derecho.',
  'help.tool.FieldDependency.body3':
    'Útil cuando un campo dependiente se comporta distinto tras un deploy o una migración de datos.',

  'help.tool.DependencyExplorer.title': 'Explorador de dependencias',
  'help.tool.DependencyExplorer.lead':
    'Descubre qué metadatos usa un componente — o qué lo referencia — antes de cambiarlo o desplegarlo.',
  'help.tool.DependencyExplorer.body1':
    'Elige el tipo de metadato y busca el componente por nombre.',
  'help.tool.DependencyExplorer.body2':
    'Pulsa Analizar. Puedes ampliar el análisis a dependencias indirectas o comparar dos entornos.',
  'help.tool.DependencyExplorer.body3':
    'Exporta un resumen, CSV o package.xml desde el menú ⋯ para documentar el impacto.',

  'help.tool.PermissionDiff.title': 'Analizador de permisos',
  'help.tool.PermissionDiff.lead':
    'Consulta qué puede hacer un perfil o permission set, o quién tiene acceso a un objeto o campo.',
  'help.tool.PermissionDiff.body1':
    'Elige el modo de consulta: por perfil/permission set, por objeto o campo, o por custom permission.',
  'help.tool.PermissionDiff.body2':
    'Escribe el nombre y pulsa Consultar. Los resultados se obtienen en vivo del entorno.',
  'help.tool.PermissionDiff.body3':
    'Activa Modo comparación para ver qué permisos difieren entre los dos entornos seleccionados.',

  'help.tool.CustomSettingsCompare.title': 'Comparar Custom Settings',
  'help.tool.CustomSettingsCompare.lead':
    'Revisa si los valores de tus Custom Settings coinciden entre entornos, registro a registro.',
  'help.tool.CustomSettingsCompare.body1':
    'Selecciona ambos entornos. Los tipos disponibles se cargan desde el de referencia.',
  'help.tool.CustomSettingsCompare.body2':
    'Elige un tipo y revisa la tabla con los valores de cada registro en ambos lados.',
  'help.tool.CustomSettingsCompare.body3':
    'Activa «solo diferencias» para centrarte en registros que no coinciden antes de un deploy.',

  'help.tool.CustomMetadataCompare.title': 'Comparar Custom Metadata',
  'help.tool.CustomMetadataCompare.lead':
    'Contrasta registros de Custom Metadata entre dos entornos campo a campo.',
  'help.tool.CustomMetadataCompare.body1':
    'Selecciona ambos entornos y espera a que carguen los tipos de metadata disponibles.',
  'help.tool.CustomMetadataCompare.body2':
    'Elige un tipo y revisa cada registro con sus campos alineados entre entornos.',
  'help.tool.CustomMetadataCompare.body3':
    'Filtra por diferencias para localizar registros desalineados que puedan afectar al comportamiento.',

  'help.tool.RecordCompare.title': 'Comparar registros',
  'help.tool.RecordCompare.lead':
    'Compara los campos de un registro entre dos entornos o de dos registros distintos.',
  'help.tool.RecordCompare.body1':
    'Selecciona los entornos y el objeto, o introduce directamente el Id del registro.',
  'help.tool.RecordCompare.body2':
    'Busca el registro o pega su Id en cada lado según el modo que elijas.',
  'help.tool.RecordCompare.body3':
    'La tabla resalta campos iguales y distintos — útil para validar datos tras una migración o un deploy.',

  'help.tool.EnvironmentStatus.title': 'Estado entornos Salesforce',
  'help.tool.EnvironmentStatus.lead':
    'Vista general de todos tus entornos guardados: versión, instancia, estado de Trust y sesión.',
  'help.tool.EnvironmentStatus.body1':
    'La tabla lista cada entorno sin tener que seleccionarlo en el desplegable superior.',
  'help.tool.EnvironmentStatus.body2':
    'Revisa si la sesión sigue activa, la versión de API y el estado de Trust de Salesforce.',
  'help.tool.EnvironmentStatus.body3':
    'Usa los enlaces a Trust o Company Info si sospechas una incidencia en la instancia.',

  'help.tool.OrgLimits.title': 'Límites del entorno',
  'help.tool.OrgLimits.lead':
    'Consulta cuánto has consumido de cada límite operativo del entorno (consultas, almacenamiento, etc.).',
  'help.tool.OrgLimits.body1':
    'Elige el entorno y pulsa Actualizar límites. Las barras muestran el uso respecto al máximo.',
  'help.tool.OrgLimits.body2':
    'Pasa el cursor sobre una barra para ver cifras concretas.',
  'help.tool.OrgLimits.body3':
    'Activa comparación para ver dos entornos en paralelo y detectar desequilibrios.',

  'help.tool.DeployStatus.title': 'Deploy Status',
  'help.tool.DeployStatus.lead':
    'Sigue en tiempo real los deploy en curso y consulta el historial reciente del entorno.',
  'help.tool.DeployStatus.body1':
    'Las ruedas de progreso muestran componentes desplegados y tests en ejecución.',
  'help.tool.DeployStatus.body2':
    'Explora el historial paginado y abre el detalle de cada deploy.',
  'help.tool.DeployStatus.body3':
    'Útil después de un Validate o Deploy desde los editores para confirmar que terminó bien.',

  'help.tool.SetupAuditTrail.title': 'Historial de cambios en setup',
  'help.tool.SetupAuditTrail.lead':
    'Audita quién cambió qué en la configuración del entorno y cuándo.',
  'help.tool.SetupAuditTrail.body1':
    'Filtra por usuario, tipo de acción o rango de fechas según tu revisión.',
  'help.tool.SetupAuditTrail.body2':
    'La tabla muestra cada cambio con fecha, usuario y descripción.',
  'help.tool.SetupAuditTrail.body3':
    'Consulta el historial antes de un deploy para saber qué se ha modificado recientemente.',

  'help.tool.FieldHistory.title': 'Historial de campos',
  'help.tool.FieldHistory.lead':
    'Consulta quién cambió el valor de un campo en un registro cuando el objeto tiene track history activado.',
  'help.tool.FieldHistory.body1':
    'Elige el entorno, escribe el nombre del objeto y pulsa Cargar objeto.',
  'help.tool.FieldHistory.body2':
    'Introduce el Id del registro y ajusta fechas o filtros de usuario.',
  'help.tool.FieldHistory.body3':
    'Pulsa Cargar historial para ver el valor anterior y el nuevo de cada cambio.',

  'help.tool.GeneratePackageXml.title': 'Generar package.xml',
  'help.tool.GeneratePackageXml.lead':
    'Arma un package.xml eligiendo tipos de metadatos y miembros para tu próximo retrieve o deploy.',
  'help.tool.GeneratePackageXml.body1':
    'Selecciona el entorno de referencia y marca los tipos y miembros que quieres incluir. El XML se genera a la derecha.',
  'help.tool.GeneratePackageXml.body2':
    'Descarga el archivo o lanza Retrieve ZIP para obtener el contenido desde el entorno.',
  'help.tool.GeneratePackageXml.body3':
    'Activa Modo comparación para alinear la selección con otro entorno y ver qué falta o sobra.',

  'help.tool.MetadataTypeCompare.title': 'Comparar tipo de metadatos',
  'help.tool.MetadataTypeCompare.lead':
    'Compara de un vistazo qué miembros de un tipo de metadatos existen en cada entorno y cuáles difieren.',
  'help.tool.MetadataTypeCompare.body1':
    'Selecciona ambos entornos, elige un tipo en el desplegable y pulsa Comparar.',
  'help.tool.MetadataTypeCompare.body2':
    'La tabla muestra el estado de cada miembro: igual, distinto, solo en un entorno, etc.',
  'help.tool.MetadataTypeCompare.body3':
    'Si el tipo tiene muchos miembros, usa «solo diferencias» antes de revisar fila a fila. Abre un miembro en el comparador para ver el detalle.',

  'help.tool.ObjectDescribe.title': 'Describe de objeto',
  'help.tool.ObjectDescribe.lead':
    'Explora el esquema de un objeto Salesforce: campos, tipos, relaciones y permisos de lectura/escritura.',
  'help.tool.ObjectDescribe.body1':
    'Selecciona el entorno y pulsa Cargar objetos para rellenar el desplegable.',
  'help.tool.ObjectDescribe.body2':
    'Elige un objeto y revisa la tabla de campos con API name, tipo y flags updateable/createable.',
  'help.tool.ObjectDescribe.body3':
    'Útil antes de montar consultas SOQL, imports CSV o comparar estructuras entre entornos.',

  'help.tool.DataWorkbench.title': 'Editor e importación de datos',
  'help.tool.DataWorkbench.lead':
    'Consulta y edita un registro concreto o importa datos masivos (CSV, Excel, JSON) vía SOAP.',
  'help.tool.DataWorkbench.body1':
    'En Editor de registro: elige objeto, introduce el Record Id y pulsa Cargar. Usa el lápiz junto a cada campo para editar solo lo que necesites.',
  'help.tool.DataWorkbench.body2':
    'En Importación masiva: pega o carga un fichero, revisa el mapeo de columnas y ejecuta insert, update, upsert o delete.',
  'help.tool.DataWorkbench.body3':
    'Las operaciones de escritura respetan el control de org de solo lectura y la política de DML de la extensión.',

  'help.tool.RestExplorer.title': 'REST Explorer',
  'help.tool.RestExplorer.lead':
    'Llama a la REST API de Salesforce con la sesión del entorno seleccionado y revisa la respuesta JSON.',
  'help.tool.RestExplorer.body1':
    'Elige método HTTP, escribe la ruta (por ejemplo /services/data/vXX.X/sobjects/Account/describe) y pulsa Enviar.',
  'help.tool.RestExplorer.body2':
    'La URL base y la versión de API se rellenan según el entorno conectado.',
  'help.tool.RestExplorer.body3':
    'Ideal para probar endpoints antes de integrarlos en Apex o herramientas externas.',

  'help.tool.EventMonitor.title': 'Event Monitor',
  'help.tool.EventMonitor.lead':
    'Suscríbete a Platform Events, Change Events y canales en tiempo real con replay configurable.',
  'help.tool.EventMonitor.body1':
    'Selecciona el tipo de canal, carga la lista disponible y elige el canal al que suscribirte.',
  'help.tool.EventMonitor.body2':
    'Los eventos recibidos aparecen en la tabla con hora, replay Id y payload. Filtra por texto en el payload.',
  'help.tool.EventMonitor.body3':
    'Replay Id -1 recibe solo eventos nuevos; -2 recupera eventos almacenados (pide confirmación).',

  'help.tool.BulkJobMonitor.title': 'Monitor Bulk API',
  'help.tool.BulkJobMonitor.lead':
    'Consulta el estado de un trabajo Bulk API (v1 o v2) y descarga resultados de batches o ingest.',
  'help.tool.BulkJobMonitor.body1':
    'Introduce el Job Id (750…) del entorno seleccionado y pulsa Cargar job.',
  'help.tool.BulkJobMonitor.body2':
    'Se detecta automáticamente Bulk 2.0 ingest/query o Bulk 1.0 async según la respuesta de la org.',
  'help.tool.BulkJobMonitor.body3':
    'Descarga CSV de resultados correctos, fallidos o de query desde la tabla de batches.',

  'help.tool.ApexCoverageViewer.title': 'Visor de cobertura Apex',
  'help.tool.ApexCoverageViewer.lead':
    'Muestra qué líneas de una clase Apex están cubiertas por tests y cuáles no.',
  'help.tool.ApexCoverageViewer.body1':
    'Las líneas verdes están cubiertas; las rojas no lo están. Se abre desde el hub de tests o el comparador de cobertura.',
  'help.tool.ApexCoverageViewer.body2':
    'En modo comparación ves dos entornos lado a lado para la misma clase.',
  'help.tool.ApexCoverageViewer.body3':
    'Útil para entender por qué la cobertura de una clase bajó o qué líneas faltan por testear.',

  'onboarding.gotIt': 'Entendido',

  'onboarding.tool.Comparator.title': 'Comparador de metadatos',
  'onboarding.tool.Comparator.lead':
    'Compara el mismo componente entre dos entornos y ves las diferencias resaltadas.',
  'onboarding.tool.Comparator.step1':
    'Arriba elige el entorno de referencia (izquierda) y el que quieres contrastar (derecha).',
  'onboarding.tool.Comparator.step2':
    'Busca por nombre en el panel izquierdo y abre un elemento para ver el diff.',
  'onboarding.tool.Comparator.step3':
    'También puedes cargar un package.xml local desde la barra superior.',

  'onboarding.tool.ApexTests.title': 'Hub de tests Apex',
  'onboarding.tool.ApexTests.lead':
    'Ejecuta tests automatizados y revisa resultados sin salir de la aplicación.',
  'onboarding.tool.ApexTests.step1': 'Selecciona el entorno arriba a la izquierda.',
  'onboarding.tool.ApexTests.step2':
    'Elige clases, métodos o suites y lanza la ejecución; el progreso aparece en pantalla.',
  'onboarding.tool.ApexTests.step3':
    'Abre resultados, cobertura por línea o exporta el informe cuando termine.',

  'onboarding.tool.QuickEdit.title': 'Editor Apex',
  'onboarding.tool.QuickEdit.lead':
    'Busca, edita y publica clases y triggers en el entorno seleccionado.',
  'onboarding.tool.QuickEdit.step1': 'Escribe en el buscador el nombre de la clase o del trigger.',
  'onboarding.tool.QuickEdit.step2':
    'Edita en el panel con resaltado de sintaxis y guarda cambios locales.',
  'onboarding.tool.QuickEdit.step3': 'Usa Validate o Deploy según tu flujo habitual de publicación.',

  'onboarding.tool.LightningQuickEdit.title': 'Editor Lightning',
  'onboarding.tool.LightningQuickEdit.lead':
    'Busca componentes LWC y Aura, edítalos y despliégalos en el entorno seleccionado.',
  'onboarding.tool.LightningQuickEdit.step1': 'Escribe el nombre del bundle en el buscador.',
  'onboarding.tool.LightningQuickEdit.step2':
    'Edita HTML, JavaScript o markup en el panel con resaltado de sintaxis.',
  'onboarding.tool.LightningQuickEdit.step3': 'Validate o Deploy y sigue el estado desde Deploy Status.',

  'onboarding.tool.AnonymousApex.title': 'Anonymous Apex',
  'onboarding.tool.AnonymousApex.lead':
    'Ejecuta fragmentos de Apex puntuales para probar lógica sin crear una clase.',
  'onboarding.tool.AnonymousApex.step1': 'Selecciona el entorno donde quieres ejecutar.',
  'onboarding.tool.AnonymousApex.step2': 'Escribe el código, ejecuta y revisa errores o la respuesta.',
  'onboarding.tool.AnonymousApex.step3':
    'Guarda scripts frecuentes y ábrelos desde la biblioteca. Abre el log en el visor si lo necesitas.',

  'onboarding.tool.QueryExplorer.title': 'Explorador de consultas',
  'onboarding.tool.QueryExplorer.lead':
    'Consulta registros del entorno, guarda consultas útiles y compara resultados entre entornos.',
  'onboarding.tool.QueryExplorer.step1':
    'Elige el entorno. Escribe tu consulta (por ejemplo registros de Account) y pulsa Ejecutar.',
  'onboarding.tool.QueryExplorer.step2':
    'Guarda consultas con nombre para reutilizarlas. Exporta resultados a CSV o JSON si lo necesitas.',
  'onboarding.tool.QueryExplorer.step3':
    'Activa Modo comparación para ejecutar la misma consulta en los dos entornos y ver diferencias.',

  'onboarding.tool.DebugLogBrowser.title': 'Debug Log Browser',
  'onboarding.tool.DebugLogBrowser.lead':
    'Lista, filtra y abre logs de depuración del entorno.',
  'onboarding.tool.DebugLogBrowser.step1': 'Selecciona el entorno y actualiza la lista de logs.',
  'onboarding.tool.DebugLogBrowser.step2': 'Filtra por usuario, aplicación o rango de fechas.',
  'onboarding.tool.DebugLogBrowser.step3':
    'Abre un log en el visor estructurado para ver consultas, errores y límites sin leer el archivo entero.',

  'onboarding.tool.ApexCoverageCompare.title': 'Comparar cobertura Apex',
  'onboarding.tool.ApexCoverageCompare.lead':
    'Comprueba si las clases tienen la misma cobertura de tests en dos entornos.',
  'onboarding.tool.ApexCoverageCompare.step1': 'Selecciona ambas organizaciones arriba.',
  'onboarding.tool.ApexCoverageCompare.step2': 'Pulsa Cargar datos para obtener la cobertura de cada lado.',
  'onboarding.tool.ApexCoverageCompare.step3':
    'Revisa el delta y abre el detalle por línea si hace falta profundizar.',

  'onboarding.tool.FieldDependency.title': 'Dependencias de picklist',
  'onboarding.tool.FieldDependency.lead':
    'Compara cómo se relacionan los valores de listas desplegables dependientes entre entornos.',
  'onboarding.tool.FieldDependency.step1': 'Elige un objeto de la lista en el entorno de referencia.',
  'onboarding.tool.FieldDependency.step2':
    'Obtén los metadatos y revisa el diff de dependencias entre entornos.',
  'onboarding.tool.FieldDependency.step3':
    'Compara antes de un deploy si las reglas de campos dependientes han cambiado.',

  'onboarding.tool.DependencyExplorer.title': 'Explorador de dependencias',
  'onboarding.tool.DependencyExplorer.lead':
    'Descubre qué metadatos usa un componente antes de cambiarlo o desplegarlo.',
  'onboarding.tool.DependencyExplorer.step1': 'Elige el tipo y busca el componente (mín. 2 caracteres).',
  'onboarding.tool.DependencyExplorer.step2':
    'Pulsa Analizar. Activa comparación entre entornos si quieres ver diferencias de dependencias.',
  'onboarding.tool.DependencyExplorer.step3': 'Exporta resumen, CSV o package.xml desde el menú ⋯.',

  'onboarding.tool.PermissionDiff.title': 'Analizador de permisos',
  'onboarding.tool.PermissionDiff.lead':
    'Consulta qué puede hacer un perfil o permission set, o quién tiene acceso a un objeto.',
  'onboarding.tool.PermissionDiff.step1':
    'Elige el modo: por perfil/permission set, por objeto o campo, o por custom permission.',
  'onboarding.tool.PermissionDiff.step2':
    'Escribe el nombre y pulsa Consultar para ver los resultados del entorno.',
  'onboarding.tool.PermissionDiff.step3':
    'Activa Modo comparación para ver diferencias entre los dos entornos.',

  'onboarding.tool.CustomSettingsCompare.title': 'Comparar Custom Settings',
  'onboarding.tool.CustomSettingsCompare.lead':
    'Revisa si los valores de Custom Settings coinciden entre entornos registro a registro.',
  'onboarding.tool.CustomSettingsCompare.step1':
    'Selecciona ambos entornos; los tipos se cargan desde el de referencia.',
  'onboarding.tool.CustomSettingsCompare.step2': 'Elige un tipo y revisa la tabla de registros comparados.',
  'onboarding.tool.CustomSettingsCompare.step3':
    'Activa «solo diferencias» para centrarte en lo que ha cambiado.',

  'onboarding.tool.CustomMetadataCompare.title': 'Comparar Custom Metadata',
  'onboarding.tool.CustomMetadataCompare.lead':
    'Contrasta registros de Custom Metadata entre dos entornos.',
  'onboarding.tool.CustomMetadataCompare.step1':
    'Selecciona ambos entornos y espera a que carguen los tipos disponibles.',
  'onboarding.tool.CustomMetadataCompare.step2':
    'Elige un tipo y revisa los valores campo a campo.',
  'onboarding.tool.CustomMetadataCompare.step3':
    'Filtra por diferencias para localizar registros desalineados.',

  'onboarding.tool.RecordCompare.title': 'Comparar registros',
  'onboarding.tool.RecordCompare.lead':
    'Compara los campos de un registro entre dos entornos o de dos registros distintos.',
  'onboarding.tool.RecordCompare.step1':
    'Selecciona los entornos y el objeto, o introduce el Id directamente.',
  'onboarding.tool.RecordCompare.step2': 'Busca el registro o introduce su Id en cada lado.',
  'onboarding.tool.RecordCompare.step3':
    'Revisa la tabla: campos iguales y distintos resaltados por color.',

  'onboarding.tool.EnvironmentStatus.title': 'Estado entornos Salesforce',
  'onboarding.tool.EnvironmentStatus.lead':
    'Vista general de todos tus entornos guardados: versión, instancia, Trust y sesión.',
  'onboarding.tool.EnvironmentStatus.step1':
    'Revisa la tabla con todos tus entornos: versión, instancia y estado de sesión.',
  'onboarding.tool.EnvironmentStatus.step2':
    'Comprueba si alguna sesión ha caducado o hay incidencias en Trust.',
  'onboarding.tool.EnvironmentStatus.step3':
    'Usa los enlaces a Trust o Company Info para más detalle.',

  'onboarding.tool.OrgLimits.title': 'Límites del entorno',
  'onboarding.tool.OrgLimits.lead':
    'Consulta cuánto has consumido de cada límite operativo del entorno.',
  'onboarding.tool.OrgLimits.step1': 'Elige el entorno y pulsa Actualizar límites.',
  'onboarding.tool.OrgLimits.step2': 'Pasa el cursor sobre las barras para ver cifras concretas.',
  'onboarding.tool.OrgLimits.step3': 'Activa comparación para ver dos entornos en paralelo.',

  'onboarding.tool.DeployStatus.title': 'Deploy Status',
  'onboarding.tool.DeployStatus.lead':
    'Monitoriza en vivo qué deploy está en curso en el entorno seleccionado.',
  'onboarding.tool.DeployStatus.step1': 'Elige el entorno en el desplegable superior izquierdo.',
  'onboarding.tool.DeployStatus.step2':
    'Consulta el progreso de componentes y tests con las ruedas de progreso.',
  'onboarding.tool.DeployStatus.step3': 'Explora el historial paginado y abre el detalle de cada deploy.',

  'onboarding.tool.SetupAuditTrail.title': 'Historial de cambios en setup',
  'onboarding.tool.SetupAuditTrail.lead':
    'Audita quién cambió qué en la configuración del entorno.',
  'onboarding.tool.SetupAuditTrail.step1': 'Selecciona el entorno y aplica filtros de usuario o acción.',
  'onboarding.tool.SetupAuditTrail.step2': 'Ajusta el rango de fechas según tu revisión.',
  'onboarding.tool.SetupAuditTrail.step3':
    'Recorre la tabla para localizar cambios recientes antes de un deploy.',

  'onboarding.tool.FieldHistory.title': 'Historial de campos',
  'onboarding.tool.FieldHistory.lead':
    'Consulta quién cambió qué valor en un registro cuando el objeto tiene track history.',
  'onboarding.tool.FieldHistory.step1': 'Elige el entorno, escribe el objeto y pulsa Cargar objeto.',
  'onboarding.tool.FieldHistory.step2':
    'Revisa la lista de campos trackeados e introduce el Id del registro.',
  'onboarding.tool.FieldHistory.step3':
    'Ajusta fechas y filtros, luego Cargar historial para ver valores anterior y nuevo.',

  'onboarding.tool.GeneratePackageXml.title': 'Generar package.xml',
  'onboarding.tool.GeneratePackageXml.lead':
    'Arma un package.xml a medida para tu próximo retrieve o deploy.',
  'onboarding.tool.GeneratePackageXml.step1':
    'Selecciona el entorno de referencia y busca tipos de metadatos.',
  'onboarding.tool.GeneratePackageXml.step2':
    'Marca los miembros que quieres incluir; el XML se genera a la derecha.',
  'onboarding.tool.GeneratePackageXml.step3':
    'Descarga el archivo o lanza Retrieve ZIP. Comparación alinea con otro entorno.',

  'onboarding.tool.MetadataTypeCompare.title': 'Comparar tipo de metadatos',
  'onboarding.tool.MetadataTypeCompare.lead':
    'Mira de un vistazo qué miembros de un tipo existen en cada entorno y cuáles difieren.',
  'onboarding.tool.MetadataTypeCompare.step1':
    'Selecciona ambos entornos y elige un tipo de metadatos en el desplegable.',
  'onboarding.tool.MetadataTypeCompare.step2': 'Pulsa Comparar para ver la lista de miembros con su estado.',
  'onboarding.tool.MetadataTypeCompare.step3':
    'Abre un miembro en el comparador o filtra solo diferencias.',

  'onboarding.tool.ObjectDescribe.title': 'Describe de objeto',
  'onboarding.tool.ObjectDescribe.lead':
    'Consulta campos y metadatos de un objeto sin ir a Setup.',
  'onboarding.tool.ObjectDescribe.step1': 'Selecciona el entorno y pulsa Cargar objetos.',
  'onboarding.tool.ObjectDescribe.step2': 'Elige el objeto en el desplegable y revisa la tabla de campos.',
  'onboarding.tool.ObjectDescribe.step3':
    'Usa la API name y los flags para preparar consultas o imports.',

  'onboarding.tool.DataWorkbench.title': 'Editor e importación de datos',
  'onboarding.tool.DataWorkbench.lead':
    'Edita registros campo a campo o importa datos masivos desde CSV/JSON.',
  'onboarding.tool.DataWorkbench.step1':
    'Pestaña Editor: carga un registro por Id y activa el lápiz solo en los campos que quieras cambiar.',
  'onboarding.tool.DataWorkbench.step2':
    'Pestaña Importación: pega datos, revisa columnas y mapeo a campos Salesforce.',
  'onboarding.tool.DataWorkbench.step3':
    'Guardar o Ejecutar importación aplican DML en el entorno seleccionado.',

  'onboarding.tool.RestExplorer.title': 'REST Explorer',
  'onboarding.tool.RestExplorer.lead':
    'Prueba llamadas REST con la sesión del entorno activo.',
  'onboarding.tool.RestExplorer.step1': 'Elige método y escribe la ruta del recurso REST.',
  'onboarding.tool.RestExplorer.step2': 'Opcional: cuerpo JSON para POST o PATCH.',
  'onboarding.tool.RestExplorer.step3': 'Revisa status y respuesta en el panel de resultados.',

  'onboarding.tool.EventMonitor.title': 'Event Monitor',
  'onboarding.tool.EventMonitor.lead':
    'Escucha eventos de plataforma y CDC en tiempo real.',
  'onboarding.tool.EventMonitor.step1': 'Selecciona tipo de canal y pulsa Cargar canales.',
  'onboarding.tool.EventMonitor.step2': 'Elige canal, replay Id y Suscríbete.',
  'onboarding.tool.EventMonitor.step3':
    'Filtra eventos, copia payloads o desuscribe cuando termines.',

  'onboarding.tool.BulkJobMonitor.title': 'Monitor Bulk API',
  'onboarding.tool.BulkJobMonitor.lead':
    'Sigue un job Bulk por Id y descarga sus resultados.',
  'onboarding.tool.BulkJobMonitor.step1': 'Pega el Job Id del entorno seleccionado.',
  'onboarding.tool.BulkJobMonitor.step2': 'Pulsa Cargar job para ver estado y batches.',
  'onboarding.tool.BulkJobMonitor.step3':
    'Descarga resultados CSV desde la fila de cada batch o tipo de resultado.'
};

export const helpOnboardingEn = {
  'help.open': 'Help',
  'help.openTitle': 'Guide for the current tool',
  'help.close': 'Close',
  'help.title': 'Help',

  'help.tool.home.title': 'Getting started',
  'help.tool.home.lead':
    'Salesforce Org Compare lets you work with multiple Salesforce organizations from your browser.',
  'help.tool.home.body1':
    'Connect your orgs from the extension icon. There you can add the org from the current tab, set aliases, and group them (for example PRO, UAT).',
  'help.tool.home.body2':
    'In the top bar pick an area: Comparator, Development, Analysis, Monitoring, or Manifests. Each area groups tools in a submenu.',
  'help.tool.home.body3':
    'The first time you open a tool you will see a short summary. Use Ctrl+Shift+P (⌘⇧P on Mac) to jump to metadata, tools, or saved scripts.',
  'help.tool.home.body4':
    'Useful shortcuts: Ctrl+Enter (⌘↵) run queries or anonymous Apex; Ctrl+S (⌘S) save in editors; F2 rename scripts; Escape close modals; ? or Help for this panel.',

  'help.tool.Comparator.title': 'Metadata comparator',
  'help.tool.Comparator.lead':
    'Check whether a metadata item is identical or has changed between two orgs before you deploy.',
  'help.tool.Comparator.body1':
    'The left panel lists Apex classes, LWC, Aura, Visualforce, profiles, permission sets, and more. Indicators show equal or different before you open a file.',
  'help.tool.Comparator.body2':
    'You can compare a package.xml from your computer with an org, or two manifests with each other.',
  'help.tool.Comparator.body3':
    'From the viewer toolbar copy the diff, ignore whitespace, export HTML, or download the component with Retrieve.',

  'help.tool.ApexTests.title': 'Apex tests Hub',
  'help.tool.ApexTests.lead':
    'Run automated tests in an org and review results, failures, and coverage without leaving the app.',
  'help.tool.ApexTests.body1':
    'Pick classes, methods, or test suites and start a run. Progress and summary appear on screen.',
  'help.tool.ApexTests.body2':
    'When finished, open each test detail, line coverage, or export the report.',
  'help.tool.ApexTests.body3':
    'Useful before a deploy to confirm tests pass and coverage has not dropped.',

  'help.tool.QuickEdit.title': 'Apex Editor',
  'help.tool.QuickEdit.lead':
    'Search for a class or trigger, edit it, and publish to the selected org.',
  'help.tool.QuickEdit.body1':
    'Type the name in the search box and open the file in the panel with syntax highlighting.',
  'help.tool.QuickEdit.body2':
    'Validate checks the code without saving; Deploy publishes it to the org.',
  'help.tool.QuickEdit.body3':
    'Follow deploy status in Deploy Status if you started a publication.',

  'help.tool.LightningQuickEdit.title': 'Lightning Editor',
  'help.tool.LightningQuickEdit.lead':
    'Edit LWC and Aura components and deploy them to the selected org.',
  'help.tool.LightningQuickEdit.body1':
    'Search for the bundle by name and edit HTML, JavaScript, or markup in the panel.',
  'help.tool.LightningQuickEdit.body2':
    'Validate and Deploy work the same as in the Apex editor.',
  'help.tool.LightningQuickEdit.body3':
    'Compare the same component in the comparator if you want to see differences with another org.',

  'help.tool.AnonymousApex.title': 'Anonymous Apex',
  'help.tool.AnonymousApex.lead':
    'Run a one-off Apex snippet to test logic or query data without creating a class.',
  'help.tool.AnonymousApex.body1':
    'Select the org, write the code, and press Run.',
  'help.tool.AnonymousApex.body2':
    'Review output, errors, or open the generated log in the log viewer.',
  'help.tool.AnonymousApex.body3':
    'Save scripts you use often in the library for reuse.',

  'help.tool.QueryExplorer.title': 'Query Explorer',
  'help.tool.QueryExplorer.lead':
    'Query org records, save useful queries, and compare results across orgs.',
  'help.tool.QueryExplorer.body1':
    'Write a data query (for example Account records) and press Run.',
  'help.tool.QueryExplorer.body2':
    'Save named queries and export results to CSV or JSON if needed.',
  'help.tool.QueryExplorer.body3':
    'Enable comparison mode to run the same query in two orgs and see aligned differences.',

  'help.tool.DebugLogBrowser.title': 'Debug log browser',
  'help.tool.DebugLogBrowser.lead':
    'List and filter debug logs for the org to investigate errors or unexpected behavior.',
  'help.tool.DebugLogBrowser.body1':
    'Select the org and refresh the list. Filter by user, application, or dates.',
  'help.tool.DebugLogBrowser.body2':
    'Open a log in the structured viewer to see queries, errors, limits, and debug messages without reading the file line by line.',
  'help.tool.DebugLogBrowser.body3':
    'Delete old logs in bulk if you need to free space in the org.',

  'help.tool.ApexCoverageCompare.title': 'Compare Apex coverage',
  'help.tool.ApexCoverageCompare.lead':
    'Check whether Apex classes have the same test coverage in two orgs.',
  'help.tool.ApexCoverageCompare.body1':
    'Select both orgs and press Load data to get each class percentage.',
  'help.tool.ApexCoverageCompare.body2':
    'The table shows the delta between orgs. Sort by difference to see the biggest gaps.',
  'help.tool.ApexCoverageCompare.body3':
    'Open line detail if a class has different coverage and you want to see which lines are missing.',

  'help.tool.FieldDependency.title': 'Picklist dependencies',
  'help.tool.FieldDependency.lead':
    'Compare how dependent picklist values relate to each other across orgs.',
  'help.tool.FieldDependency.body1':
    'Pick an object from the reference org and retrieve its metadata.',
  'help.tool.FieldDependency.body2':
    'Review the dependency diff between the left and right org.',
  'help.tool.FieldDependency.body3':
    'Useful when a dependent field behaves differently after a deploy or data migration.',

  'help.tool.DependencyExplorer.title': 'Dependency explorer',
  'help.tool.DependencyExplorer.lead':
    'Discover which metadata a component uses — or what references it — before you change or deploy it.',
  'help.tool.DependencyExplorer.body1':
    'Choose the metadata type and search for the component by name.',
  'help.tool.DependencyExplorer.body2':
    'Press Analyze. You can extend to indirect dependencies or compare two orgs.',
  'help.tool.DependencyExplorer.body3':
    'Export a summary, CSV, or package.xml from the ⋯ menu to document impact.',

  'help.tool.PermissionDiff.title': 'Permission analyzer',
  'help.tool.PermissionDiff.lead':
    'See what a profile or permission set can do, or who has access to an object or field.',
  'help.tool.PermissionDiff.body1':
    'Choose query mode: by profile/permission set, by object or field, or by custom permission.',
  'help.tool.PermissionDiff.body2':
    'Type the name and press Query. Results are fetched live from the org.',
  'help.tool.PermissionDiff.body3':
    'Enable comparison mode to see which permissions differ between the two selected orgs.',

  'help.tool.CustomSettingsCompare.title': 'Compare Custom Settings',
  'help.tool.CustomSettingsCompare.lead':
    'Check whether Custom Settings values match across orgs, record by record.',
  'help.tool.CustomSettingsCompare.body1':
    'Select both orgs. Available types load from the reference org.',
  'help.tool.CustomSettingsCompare.body2':
    'Pick a type and review the table with each record’s values on both sides.',
  'help.tool.CustomSettingsCompare.body3':
    'Enable “differences only” to focus on records that do not match before a deploy.',

  'help.tool.CustomMetadataCompare.title': 'Compare Custom Metadata',
  'help.tool.CustomMetadataCompare.lead':
    'Contrast Custom Metadata records between two orgs field by field.',
  'help.tool.CustomMetadataCompare.body1':
    'Select both orgs and wait for available metadata types to load.',
  'help.tool.CustomMetadataCompare.body2':
    'Pick a type and review each record with fields aligned across orgs.',
  'help.tool.CustomMetadataCompare.body3':
    'Filter by differences to find misaligned records that may affect behavior.',

  'help.tool.RecordCompare.title': 'Compare records',
  'help.tool.RecordCompare.lead':
    'Compare a record’s fields across two orgs or between two different records.',
  'help.tool.RecordCompare.body1':
    'Select orgs and object, or enter the record Id directly.',
  'help.tool.RecordCompare.body2':
    'Search for the record or paste its Id on each side depending on the mode you choose.',
  'help.tool.RecordCompare.body3':
    'The table highlights matching and differing fields — useful to validate data after a migration or deploy.',

  'help.tool.EnvironmentStatus.title': 'Salesforce org status',
  'help.tool.EnvironmentStatus.lead':
    'Overview of all saved orgs: version, instance, Trust status, and session.',
  'help.tool.EnvironmentStatus.body1':
    'The table lists each org without selecting it in the top dropdown.',
  'help.tool.EnvironmentStatus.body2':
    'Check whether the session is still active, API version, and Salesforce Trust status.',
  'help.tool.EnvironmentStatus.body3':
    'Use Trust or Company Info links if you suspect an instance incident.',

  'help.tool.OrgLimits.title': 'Org limits',
  'help.tool.OrgLimits.lead':
    'See how much of each operational limit the org has consumed (queries, storage, etc.).',
  'help.tool.OrgLimits.body1':
    'Pick the org and press Refresh limits. Bars show usage against the maximum.',
  'help.tool.OrgLimits.body2':
    'Hover over a bar for exact figures.',
  'help.tool.OrgLimits.body3':
    'Enable comparison to view two orgs side by side and spot imbalances.',

  'help.tool.DeployStatus.title': 'Deploy Status',
  'help.tool.DeployStatus.lead':
    'Follow in-progress deploys in real time and browse recent history for the org.',
  'help.tool.DeployStatus.body1':
    'Progress wheels show deployed components and tests running.',
  'help.tool.DeployStatus.body2':
    'Browse paginated history and open each deploy’s detail.',
  'help.tool.DeployStatus.body3':
    'Useful after Validate or Deploy from the editors to confirm completion.',

  'help.tool.SetupAuditTrail.title': 'Setup change history',
  'help.tool.SetupAuditTrail.lead':
    'Audit who changed what in org setup and when.',
  'help.tool.SetupAuditTrail.body1':
    'Filter by user, action type, or date range for your review.',
  'help.tool.SetupAuditTrail.body2':
    'The table shows each change with date, user, and description.',
  'help.tool.SetupAuditTrail.body3':
    'Check history before a deploy to see what was modified recently.',

  'help.tool.FieldHistory.title': 'Field history',
  'help.tool.FieldHistory.lead':
    'See who changed a field value on a record when the object has track history enabled.',
  'help.tool.FieldHistory.body1':
    'Pick the org, enter the object name, and press Load object.',
  'help.tool.FieldHistory.body2':
    'Enter the record Id and adjust dates or user filters.',
  'help.tool.FieldHistory.body3':
    'Press Load history to see old and new values for each change.',

  'help.tool.GeneratePackageXml.title': 'Generate package.xml',
  'help.tool.GeneratePackageXml.lead':
    'Build a package.xml by choosing metadata types and members for your next retrieve or deploy.',
  'help.tool.GeneratePackageXml.body1':
    'Select the reference org and check types and members to include. XML is generated on the right.',
  'help.tool.GeneratePackageXml.body2':
    'Download the file or run Retrieve ZIP to get content from the org.',
  'help.tool.GeneratePackageXml.body3':
    'Enable comparison mode to align selection with another org and see what is missing or extra.',

  'help.tool.MetadataTypeCompare.title': 'Compare metadata type',
  'help.tool.MetadataTypeCompare.lead':
    'See at a glance which members of a metadata type exist in each org and which differ.',
  'help.tool.MetadataTypeCompare.body1':
    'Select both orgs, pick a type in the dropdown, and press Compare.',
  'help.tool.MetadataTypeCompare.body2':
    'The table shows each member’s status: equal, different, only in one org, etc.',
  'help.tool.MetadataTypeCompare.body3':
    'If the type has many members, use “differences only” before reviewing row by row. Open a member in the comparator for detail.',

  'help.tool.ObjectDescribe.title': 'Object describe',
  'help.tool.ObjectDescribe.lead':
    'Explore a Salesforce object schema: fields, types, relationships, and read/write permissions.',
  'help.tool.ObjectDescribe.body1':
    'Select the org and press Load objects to fill the dropdown.',
  'help.tool.ObjectDescribe.body2':
    'Pick an object and review the field table with API name, type, and updateable/createable flags.',
  'help.tool.ObjectDescribe.body3':
    'Useful before building SOQL queries, CSV imports, or comparing structures across orgs.',

  'help.tool.DataWorkbench.title': 'Record editor & import',
  'help.tool.DataWorkbench.lead':
    'View and edit a single record or bulk-import data (CSV, Excel, JSON) via SOAP.',
  'help.tool.DataWorkbench.body1':
    'Record editor tab: pick object, enter Record Id, and press Load. Use the pencil next to each field to edit only what you need.',
  'help.tool.DataWorkbench.body2':
    'Bulk import tab: paste or load a file, review column mapping, then run insert, update, upsert, or delete.',
  'help.tool.DataWorkbench.body3':
    'Write operations respect read-only org controls and the extension DML policy.',

  'help.tool.RestExplorer.title': 'REST Explorer',
  'help.tool.RestExplorer.lead':
    'Call the Salesforce REST API with the selected org session and inspect the JSON response.',
  'help.tool.RestExplorer.body1':
    'Choose HTTP method, enter the path (e.g. /services/data/vXX.X/sobjects/Account/describe), and press Send.',
  'help.tool.RestExplorer.body2':
    'Base URL and API version are filled from the connected org.',
  'help.tool.RestExplorer.body3':
    'Handy to try endpoints before wiring them in Apex or external tools.',

  'help.tool.EventMonitor.title': 'Event Monitor',
  'help.tool.EventMonitor.lead':
    'Subscribe to Platform Events, Change Events, and real-time channels with configurable replay.',
  'help.tool.EventMonitor.body1':
    'Select channel type, load the available list, and pick the channel to subscribe.',
  'help.tool.EventMonitor.body2':
    'Received events appear in the table with time, replay Id, and payload. Filter by payload text.',
  'help.tool.EventMonitor.body3':
    'Replay Id -1 receives new events only; -2 replays stored events (asks for confirmation).',

  'help.tool.BulkJobMonitor.title': 'Bulk API monitor',
  'help.tool.BulkJobMonitor.lead':
    'Check a Bulk API job status (v1 or v2) and download batch or ingest results.',
  'help.tool.BulkJobMonitor.body1':
    'Enter the Job Id (750…) for the selected org and press Load job.',
  'help.tool.BulkJobMonitor.body2':
    'Bulk 2.0 ingest/query or Bulk 1.0 async is detected automatically from the org response.',
  'help.tool.BulkJobMonitor.body3':
    'Download CSV for successful, failed, or query results from the batches table.',

  'help.tool.ApexCoverageViewer.title': 'Apex coverage viewer',
  'help.tool.ApexCoverageViewer.lead':
    'Shows which lines of an Apex class are covered by tests and which are not.',
  'help.tool.ApexCoverageViewer.body1':
    'Green lines are covered; red lines are not. Opens from the tests hub or coverage compare.',
  'help.tool.ApexCoverageViewer.body2':
    'In comparison mode you see two orgs side by side for the same class.',
  'help.tool.ApexCoverageViewer.body3':
    'Useful to understand why a class’s coverage dropped or which lines still need tests.',

  'onboarding.gotIt': 'Got it',

  'onboarding.tool.Comparator.title': 'Metadata comparator',
  'onboarding.tool.Comparator.lead':
    'Compare the same component across two orgs with a highlighted diff.',
  'onboarding.tool.Comparator.step1':
    'Above, pick the reference org (left) and the one you want to contrast (right).',
  'onboarding.tool.Comparator.step2':
    'Search by name in the left panel and open an item to see the diff.',
  'onboarding.tool.Comparator.step3':
    'You can also load a local package.xml from the top toolbar.',

  'onboarding.tool.ApexTests.title': 'Apex tests Hub',
  'onboarding.tool.ApexTests.lead':
    'Run automated tests and review results without leaving the app.',
  'onboarding.tool.ApexTests.step1': 'Select the org in the top-left dropdown.',
  'onboarding.tool.ApexTests.step2':
    'Pick classes, methods, or suites and start a run; progress appears on screen.',
  'onboarding.tool.ApexTests.step3':
    'Open results, line coverage, or export the report when finished.',

  'onboarding.tool.QuickEdit.title': 'Apex Editor',
  'onboarding.tool.QuickEdit.lead':
    'Search, edit, and publish classes and triggers to the selected org.',
  'onboarding.tool.QuickEdit.step1': 'Type the class or trigger name in the search box.',
  'onboarding.tool.QuickEdit.step2':
    'Edit in the panel with syntax highlighting and keep local changes.',
  'onboarding.tool.QuickEdit.step3': 'Use Validate or Deploy according to your usual release flow.',

  'onboarding.tool.LightningQuickEdit.title': 'Lightning Editor',
  'onboarding.tool.LightningQuickEdit.lead':
    'Search LWC and Aura bundles, edit them, and deploy to the selected org.',
  'onboarding.tool.LightningQuickEdit.step1': 'Type the bundle name in the search box.',
  'onboarding.tool.LightningQuickEdit.step2':
    'Edit HTML, JavaScript, or markup in the panel with syntax highlighting.',
  'onboarding.tool.LightningQuickEdit.step3': 'Validate or Deploy and follow status in Deploy Status.',

  'onboarding.tool.AnonymousApex.title': 'Anonymous Apex',
  'onboarding.tool.AnonymousApex.lead':
    'Run one-off Apex snippets to test logic without creating a class.',
  'onboarding.tool.AnonymousApex.step1': 'Select the org where you want to execute.',
  'onboarding.tool.AnonymousApex.step2': 'Write code, run it, and review errors or the response.',
  'onboarding.tool.AnonymousApex.step3':
    'Save frequent scripts in the library. Open the log in the viewer if needed.',

  'onboarding.tool.QueryExplorer.title': 'Query Explorer',
  'onboarding.tool.QueryExplorer.lead':
    'Query org records, save useful queries, and compare results across orgs.',
  'onboarding.tool.QueryExplorer.step1':
    'Pick the org. Write your query (for example Account records) and press Run.',
  'onboarding.tool.QueryExplorer.step2':
    'Save named queries for reuse. Export results to CSV or JSON if needed.',
  'onboarding.tool.QueryExplorer.step3':
    'Enable comparison mode to run the same query in both orgs and see differences.',

  'onboarding.tool.DebugLogBrowser.title': 'Debug log browser',
  'onboarding.tool.DebugLogBrowser.lead':
    'List, filter, and open debug logs for the org.',
  'onboarding.tool.DebugLogBrowser.step1': 'Select the org and refresh the log list.',
  'onboarding.tool.DebugLogBrowser.step2': 'Filter by user, application, or date range.',
  'onboarding.tool.DebugLogBrowser.step3':
    'Open a log in the structured viewer to see queries, errors, and limits without reading the whole file.',

  'onboarding.tool.ApexCoverageCompare.title': 'Compare Apex coverage',
  'onboarding.tool.ApexCoverageCompare.lead':
    'Check whether classes have the same test coverage in two orgs.',
  'onboarding.tool.ApexCoverageCompare.step1': 'Select both organizations above.',
  'onboarding.tool.ApexCoverageCompare.step2': 'Press Load data to get coverage on each side.',
  'onboarding.tool.ApexCoverageCompare.step3':
    'Review the delta and open line detail if you need to dig deeper.',

  'onboarding.tool.FieldDependency.title': 'Picklist dependencies',
  'onboarding.tool.FieldDependency.lead':
    'Compare how dependent picklist values relate across orgs.',
  'onboarding.tool.FieldDependency.step1': 'Pick an object from the list on the reference org.',
  'onboarding.tool.FieldDependency.step2':
    'Retrieve metadata and review the dependency diff between orgs.',
  'onboarding.tool.FieldDependency.step3':
    'Compare before a deploy if dependent field rules have changed.',

  'onboarding.tool.DependencyExplorer.title': 'Dependency explorer',
  'onboarding.tool.DependencyExplorer.lead':
    'Discover which metadata a component uses before you change or deploy it.',
  'onboarding.tool.DependencyExplorer.step1': 'Choose the type and search for the component (min. 2 characters).',
  'onboarding.tool.DependencyExplorer.step2':
    'Press Analyze. Enable org comparison if you want dependency differences.',
  'onboarding.tool.DependencyExplorer.step3': 'Export summary, CSV, or package.xml from the ⋯ menu.',

  'onboarding.tool.PermissionDiff.title': 'Permission analyzer',
  'onboarding.tool.PermissionDiff.lead':
    'See what a profile or permission set can do, or who has access to an object.',
  'onboarding.tool.PermissionDiff.step1':
    'Choose mode: by profile/permission set, by object or field, or by custom permission.',
  'onboarding.tool.PermissionDiff.step2':
    'Type the name and press Query to see results from the org.',
  'onboarding.tool.PermissionDiff.step3':
    'Enable comparison mode to see differences between the two orgs.',

  'onboarding.tool.CustomSettingsCompare.title': 'Compare Custom Settings',
  'onboarding.tool.CustomSettingsCompare.lead':
    'Check whether Custom Settings values match across orgs record by record.',
  'onboarding.tool.CustomSettingsCompare.step1':
    'Select both orgs; types load from the reference org.',
  'onboarding.tool.CustomSettingsCompare.step2': 'Pick a type and review the compared records table.',
  'onboarding.tool.CustomSettingsCompare.step3':
    'Enable “differences only” to focus on what changed.',

  'onboarding.tool.CustomMetadataCompare.title': 'Compare Custom Metadata',
  'onboarding.tool.CustomMetadataCompare.lead':
    'Contrast Custom Metadata records between two orgs.',
  'onboarding.tool.CustomMetadataCompare.step1':
    'Select both orgs and wait for available types to load.',
  'onboarding.tool.CustomMetadataCompare.step2': 'Pick a type and review values field by field.',
  'onboarding.tool.CustomMetadataCompare.step3':
    'Filter by differences to find misaligned records.',

  'onboarding.tool.RecordCompare.title': 'Compare records',
  'onboarding.tool.RecordCompare.lead':
    'Compare a record’s fields across two orgs or between two different records.',
  'onboarding.tool.RecordCompare.step1':
    'Select orgs and object, or enter the Id directly.',
  'onboarding.tool.RecordCompare.step2': 'Search for the record or enter its Id on each side.',
  'onboarding.tool.RecordCompare.step3':
    'Review the table: matching and differing fields are color-highlighted.',

  'onboarding.tool.EnvironmentStatus.title': 'Salesforce org status',
  'onboarding.tool.EnvironmentStatus.lead':
    'Overview of all saved orgs: version, instance, Trust, and session.',
  'onboarding.tool.EnvironmentStatus.step1':
    'Review the table for all orgs: version, instance, and session status.',
  'onboarding.tool.EnvironmentStatus.step2':
    'Check if any session expired or there are Trust incidents.',
  'onboarding.tool.EnvironmentStatus.step3':
    'Use Trust or Company Info links for more detail.',

  'onboarding.tool.OrgLimits.title': 'Org limits',
  'onboarding.tool.OrgLimits.lead':
    'See how much of each operational limit the org has consumed.',
  'onboarding.tool.OrgLimits.step1': 'Pick the org and press Refresh limits.',
  'onboarding.tool.OrgLimits.step2': 'Hover over bars for exact figures.',
  'onboarding.tool.OrgLimits.step3': 'Enable comparison to view two orgs side by side.',

  'onboarding.tool.DeployStatus.title': 'Deploy Status',
  'onboarding.tool.DeployStatus.lead':
    'Monitor live deploys in progress for the selected org.',
  'onboarding.tool.DeployStatus.step1': 'Pick the org in the top-left dropdown.',
  'onboarding.tool.DeployStatus.step2':
    'Check component and test progress with the progress wheels.',
  'onboarding.tool.DeployStatus.step3': 'Browse paginated history and open each deploy’s detail.',

  'onboarding.tool.SetupAuditTrail.title': 'Setup change history',
  'onboarding.tool.SetupAuditTrail.lead':
    'Audit who changed what in org setup.',
  'onboarding.tool.SetupAuditTrail.step1': 'Select the org and apply user or action filters.',
  'onboarding.tool.SetupAuditTrail.step2': 'Adjust the date range for your review.',
  'onboarding.tool.SetupAuditTrail.step3':
    'Browse the table to find recent changes before a deploy.',

  'onboarding.tool.FieldHistory.title': 'Field history',
  'onboarding.tool.FieldHistory.lead':
    'See who changed which value on a record when the object has track history.',
  'onboarding.tool.FieldHistory.step1': 'Pick the org, enter the object, and press Load object.',
  'onboarding.tool.FieldHistory.step2':
    'Review tracked fields and enter the record Id.',
  'onboarding.tool.FieldHistory.step3':
    'Adjust dates and filters, then Load history to see old and new values.',

  'onboarding.tool.GeneratePackageXml.title': 'Generate package.xml',
  'onboarding.tool.GeneratePackageXml.lead':
    'Build a custom package.xml for your next retrieve or deploy.',
  'onboarding.tool.GeneratePackageXml.step1':
    'Select the reference org and search for metadata types.',
  'onboarding.tool.GeneratePackageXml.step2':
    'Check members to include; XML is generated on the right.',
  'onboarding.tool.GeneratePackageXml.step3':
    'Download the file or run Retrieve ZIP. Comparison aligns with another org.',

  'onboarding.tool.MetadataTypeCompare.title': 'Compare metadata type',
  'onboarding.tool.MetadataTypeCompare.lead':
    'See at a glance which members of a type exist in each org and which differ.',
  'onboarding.tool.MetadataTypeCompare.step1':
    'Select both orgs and pick a metadata type in the dropdown.',
  'onboarding.tool.MetadataTypeCompare.step2': 'Press Compare to see the member list with status.',
  'onboarding.tool.MetadataTypeCompare.step3':
    'Open a member in the comparator or filter differences only.',

  'onboarding.tool.ObjectDescribe.title': 'Object describe',
  'onboarding.tool.ObjectDescribe.lead':
    'Inspect object fields and metadata without opening Setup.',
  'onboarding.tool.ObjectDescribe.step1': 'Select the org and press Load objects.',
  'onboarding.tool.ObjectDescribe.step2': 'Pick the object in the dropdown and review the field table.',
  'onboarding.tool.ObjectDescribe.step3':
    'Use API names and flags to prepare queries or imports.',

  'onboarding.tool.DataWorkbench.title': 'Record editor & import',
  'onboarding.tool.DataWorkbench.lead':
    'Edit records field by field or bulk-import from CSV/JSON.',
  'onboarding.tool.DataWorkbench.step1':
    'Editor tab: load a record by Id and use the pencil only on fields you want to change.',
  'onboarding.tool.DataWorkbench.step2':
    'Import tab: paste data, review columns, and map to Salesforce fields.',
  'onboarding.tool.DataWorkbench.step3':
    'Save or Run import applies DML in the selected org.',

  'onboarding.tool.RestExplorer.title': 'REST Explorer',
  'onboarding.tool.RestExplorer.lead':
    'Try REST calls with the active org session.',
  'onboarding.tool.RestExplorer.step1': 'Choose method and enter the REST resource path.',
  'onboarding.tool.RestExplorer.step2': 'Optional: JSON body for POST or PATCH.',
  'onboarding.tool.RestExplorer.step3': 'Review status and response in the results panel.',

  'onboarding.tool.EventMonitor.title': 'Event Monitor',
  'onboarding.tool.EventMonitor.lead':
    'Listen to platform and CDC events in real time.',
  'onboarding.tool.EventMonitor.step1': 'Select channel type and press Load channels.',
  'onboarding.tool.EventMonitor.step2': 'Pick channel, replay Id, and Subscribe.',
  'onboarding.tool.EventMonitor.step3':
    'Filter events, copy payloads, or unsubscribe when done.',

  'onboarding.tool.BulkJobMonitor.title': 'Bulk API monitor',
  'onboarding.tool.BulkJobMonitor.lead':
    'Track a Bulk job by Id and download its results.',
  'onboarding.tool.BulkJobMonitor.step1': 'Paste the Job Id for the selected org.',
  'onboarding.tool.BulkJobMonitor.step2': 'Press Load job to see status and batches.',
  'onboarding.tool.BulkJobMonitor.step3':
    'Download CSV results from each batch or result type row.'
};
