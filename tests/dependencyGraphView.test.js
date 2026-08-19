import { describe, expect, it } from 'vitest';
import { buildDependencyGraphModel } from '../code/workbench/dependencyGraphView.js';

describe('dependency graph model', () => {
  const data = {
    root: { id: 'root', name: 'Root', type: 'ApexClass' },
    nodes: [
      { id: 'a', name: 'Account.Field__c', type: 'CustomField' },
      { id: 'b', name: 'Handler', type: 'ApexClass' }
    ],
    edges: [{ from: 'root', to: 'a' }, { from: 'a', to: 'b' }]
  };

  it('posiciona niveles desde la raíz y conserva aristas válidas', () => {
    const model = buildDependencyGraphModel(data);
    expect(model.nodes.find(({ id }) => id === 'root').level).toBe(0);
    expect(model.nodes.find(({ id }) => id === 'a').level).toBe(1);
    expect(model.nodes.find(({ id }) => id === 'b').level).toBe(2);
    expect(model.edges).toHaveLength(2);
  });

  it('filtra por nombre o tipo y siempre conserva la raíz', () => {
    const model = buildDependencyGraphModel(data, 'customfield');
    expect(model.nodes.map(({ id }) => id).sort()).toEqual(['a', 'root']);
  });

  it('limita el SVG a 300 nodos y marca truncado', () => {
    const nodes = Array.from({ length: 350 }, (_, index) => ({ id: `n${index}`, name: `N${index}`, type: 'X' }));
    const model = buildDependencyGraphModel({ root: data.root, nodes, edges: [] });
    expect(model.nodes).toHaveLength(300);
    expect(model.truncated).toBe(true);
  });
});

