import { describe, expect, it } from 'vitest';
import { collectTurnToolCalls, firstTurnToolMessageIndex } from '../code/lib/logi/logiToolTrace.js';

describe('actividad agrupada de Logi', () => {
  it('crea una sola colección con una fila por acción del turno', () => {
    const messages = [
      { role: 'assistant', turnId: 'turn-1', tool_calls: [{ id: 'a', function: { name: 'search_log' } }] },
      { role: 'tool', turnId: 'turn-1', tool_call_id: 'a', content: '{"ok":true}' },
      { role: 'assistant', turnId: 'turn-1', tool_calls: [{ id: 'b', function: { name: 'get_hotspots' } }] },
      { role: 'tool', turnId: 'turn-1', tool_call_id: 'b', content: '{"ok":true}' },
      { role: 'assistant', turnId: 'turn-2', tool_calls: [{ id: 'c', function: { name: 'org_query' } }] }
    ];

    expect(firstTurnToolMessageIndex(messages, 'turn-1')).toBe(0);
    const rows = collectTurnToolCalls(messages, 'turn-1');
    expect(rows).toHaveLength(2);
    expect(rows.map(({ call }) => call.function.name)).toEqual(['search_log', 'get_hotspots']);
    expect(rows.every(({ result }) => result?.role === 'tool')).toBe(true);
  });
});
