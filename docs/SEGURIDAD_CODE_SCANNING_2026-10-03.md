# Corrección de Code Scanning

Fecha: 2026-10-03

## Alcance

Se corrigen las 23 alertas abiertas de GitHub CodeQL en el repositorio. Los cambios se limitan a los puntos señalados por el análisis y mantienen los flujos funcionales de la extensión.

| Alertas | Regla | Corrección aplicada |
| --- | --- | --- |
| 1-4 | `js/identity-replacement` | Se eliminan sustituciones que devolvían el mismo texto. |
| 5-6 | `js/xss-through-dom` | La ayuda y la lista de modelos se construyen con nodos DOM y `textContent`. |
| 7-9 | `js/incomplete-multi-character-sanitization` | Se evita eliminar HTML con expresiones regulares incompletas; los mensajes se procesan carácter a carácter y la comprobación de contenido usa el Markdown original. |
| 10-12 | `js/double-escaping` | Las entidades HTML se decodifican en una única pasada y, para URLs Classic, solo tras completar la decodificación de URL. |
| 13-15 | `js/incomplete-html-attribute-sanitization` | Las filas de monitorización se construyen con la API DOM; atributos y datos se asignan como propiedades, no como HTML interpolado. |
| 16-20 | `js/incomplete-sanitization` | Los literales SOQL escapan barras inversas y comillas. Las consultas generadas por Logi validan el identificador Apex o Flow antes de interpolarlo. |
| 21-23 | `js/insecure-randomness` | Los identificadores temporales usan `crypto.randomUUID()` o `crypto.getRandomValues()`; se elimina la alternativa basada en `Math.random()`. |

## Garantías de compatibilidad

- Los textos que se muestran en interfaz se insertan con `textContent`.
- Los atributos de acciones de Bulk API y Event Monitor se asignan mediante `dataset`.
- Se conserva la decodificación de enlaces Classic de Salesforce, sin doble decodificar entidades.
- La generación de identificadores sigue conservando el prefijo y la forma sin guiones usados por el almacenamiento temporal.

## Verificación

Ejecutar antes de integrar:

```powershell
npm run build:sf-inject
npm test
```

Tras subir el cambio, GitHub Code Scanning debe completar el nuevo análisis y cerrar las alertas al no encontrar los patrones corregidos.
