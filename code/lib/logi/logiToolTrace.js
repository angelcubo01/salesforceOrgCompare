/**
 * Reúne todas las acciones de herramientas de un mismo turno. Los proveedores
 * pueden devolver una llamada por respuesta intermedia; para la UI siguen
 * formando una única actividad de Logi.
 * @param {object[]} messages
 * @param {string} turnId
 */
export function collectTurnToolCalls(messages, turnId) {
  const rows = [];
  (messages || []).forEach((message, messageIndex) => {
    if (message?.role !== 'assistant' || message?.turnId !== turnId) return;
    for (const call of Array.isArray(message.tool_calls) ? message.tool_calls : []) {
      const toolId = String(call?.id || '');
      const result = (messages || []).slice(messageIndex + 1).find(
        (candidate) => candidate?.role === 'tool' && candidate?.turnId === turnId &&
          (!toolId || candidate.tool_call_id === toolId)
      );
      rows.push({ call, messageIndex, result });
    }
  });
  return rows;
}

/** @param {object[]} messages @param {string} turnId */
export function firstTurnToolMessageIndex(messages, turnId) {
  return (messages || []).findIndex(
    (message) => message?.role === 'assistant' && message?.turnId === turnId &&
      Array.isArray(message.tool_calls) && message.tool_calls.length > 0
  );
}
