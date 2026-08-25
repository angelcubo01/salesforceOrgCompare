const MAX_GRAPH_NODES = 300;
const SVG_NS = 'http://www.w3.org/2000/svg';

function nodeId(node) {
  return String(node?.id || node?.storeKey || node?.key || '').trim();
}
/** Construye un layout determinista y acotado, independiente del DOM. */
export function buildDependencyGraphModel(data, query = '') {
  const root = data?.root && nodeId(data.root) ? { ...data.root, isRoot: true } : null;
  const rawNodes = [root, ...(Array.isArray(data?.nodes) ? data.nodes : [])].filter(Boolean);
  const unique = new Map();
  for (const node of rawNodes) {
    const id = nodeId(node);
    if (id && !unique.has(id)) unique.set(id, { ...node, id });
    if (unique.size >= MAX_GRAPH_NODES) break;
  }
  const allNodes = [...unique.values()];
  const rawEdges = (Array.isArray(data?.edges) ? data.edges : [])
    .map((edge) => ({ from: String(edge?.from || ''), to: String(edge?.to || '') }))
    .filter((edge) => unique.has(edge.from) && unique.has(edge.to));

  const needle = String(query || '').trim().toLocaleLowerCase();
  const matching = new Set();
  if (needle) {
    for (const node of allNodes) {
      if (`${node.name || ''} ${node.displayName || ''} ${node.type || ''}`.toLocaleLowerCase().includes(needle)) {
        matching.add(node.id);
      }
    }
  }
  const visibleIds = needle ? matching : new Set(allNodes.map(({ id }) => id));
  if (root) visibleIds.add(root.id);
  const nodes = allNodes.filter(({ id }) => visibleIds.has(id));
  const edges = rawEdges.filter(({ from, to }) => visibleIds.has(from) && visibleIds.has(to));

  const levelById = new Map();
  const startId = root?.id || nodes[0]?.id;
  if (startId) levelById.set(startId, 0);
  const queue = startId ? [startId] : [];
  while (queue.length) {
    const current = queue.shift();
    const currentLevel = levelById.get(current) || 0;
    for (const edge of edges) {
      if (edge.from !== current || levelById.has(edge.to)) continue;
      levelById.set(edge.to, currentLevel + 1);
      queue.push(edge.to);
    }
  }
  let fallbackLevel = Math.max(0, ...levelById.values()) + 1;
  for (const node of nodes) {
    if (!levelById.has(node.id)) levelById.set(node.id, fallbackLevel);
  }
  const groups = new Map();
  for (const node of nodes) {
    const level = levelById.get(node.id) || 0;
    if (!groups.has(level)) groups.set(level, []);
    groups.get(level).push(node);
  }
  const positioned = [];
  for (const [level, group] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    group.sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)));
    group.forEach((node, index) => positioned.push({ ...node, level, x: 50 + level * 250, y: 45 + index * 78 }));
  }
  const maxLevel = Math.max(0, ...positioned.map(({ level }) => level));
  const maxRows = Math.max(1, ...[...groups.values()].map((group) => group.length));
  return {
    nodes: positioned,
    edges,
    width: Math.max(760, 260 + maxLevel * 250),
    height: Math.max(360, 90 + maxRows * 78),
    truncated: rawNodes.length > MAX_GRAPH_NODES || data?.truncated === true,
    totalNodes: rawNodes.length
  };
}

function svgEl(tag, attributes = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  return node;
}

function createButton(label, className) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  return button;
}

/** Renderiza SVG y una lista equivalente para lector de pantalla/teclado. */
export function renderDependencyGraph(host, data, translate) {
  const tr = typeof translate === 'function' ? translate : (key) => key;
  host.replaceChildren();
  host.classList.add('dependency-graph-host');

  const toolbar = document.createElement('div');
  toolbar.className = 'dependency-graph-toolbar';
  const filter = document.createElement('input');
  filter.type = 'search';
  filter.className = 'dependency-graph-filter sfoc-query-input';
  filter.placeholder = tr('workbench.graph.filter');
  filter.setAttribute('aria-label', tr('workbench.graph.filter'));
  toolbar.appendChild(filter);
  const zoomOut = createButton('−', 'dependency-graph-action');
  zoomOut.setAttribute('aria-label', tr('workbench.graph.zoomOut'));
  const reset = createButton(tr('workbench.graph.reset'), 'dependency-graph-action');
  const zoomIn = createButton('+', 'dependency-graph-action');
  zoomIn.setAttribute('aria-label', tr('workbench.graph.zoomIn'));
  toolbar.append(zoomOut, reset, zoomIn);
  host.appendChild(toolbar);

  const status = document.createElement('p');
  status.className = 'dependency-graph-status';
  status.setAttribute('role', 'status');
  host.appendChild(status);
  const canvas = document.createElement('div');
  canvas.className = 'dependency-graph-canvas';
  host.appendChild(canvas);
  const list = document.createElement('ul');
  list.className = 'dependency-graph-accessible-list';
  list.setAttribute('aria-label', tr('workbench.graph.listLabel'));
  host.appendChild(list);

  let zoom = 1;
  const draw = () => {
    const model = buildDependencyGraphModel(data, filter.value);
    canvas.replaceChildren();
    list.replaceChildren();
    status.textContent = model.nodes.length
      ? tr('workbench.graph.status', { count: model.nodes.length, edges: model.edges.length })
      : tr('workbench.graph.empty');
    if (model.truncated) status.textContent += ` ${tr('workbench.graph.truncated')}`;
    if (!model.nodes.length) return;

    const svg = svgEl('svg', {
      class: 'dependency-graph-svg',
      viewBox: `0 0 ${model.width / zoom} ${model.height / zoom}`,
      role: 'img',
      'aria-label': tr('workbench.graph.label')
    });
    const positionById = new Map(model.nodes.map((node) => [node.id, node]));
    for (const edge of model.edges) {
      const from = positionById.get(edge.from);
      const to = positionById.get(edge.to);
      if (!from || !to) continue;
      svg.appendChild(svgEl('line', {
        class: 'dependency-graph-edge',
        x1: from.x + 190,
        y1: from.y + 25,
        x2: to.x,
        y2: to.y + 25
      }));
    }
    model.nodes.forEach((node, index) => {
      const group = svgEl('g', {
        id: `dependencyGraphNode-${index}`,
        class: `dependency-graph-node${node.isRoot ? ' dependency-graph-node--root' : ''}`,
        transform: `translate(${node.x} ${node.y})`,
        tabindex: '0',
        role: 'button',
        'aria-label': `${node.displayName || node.name || node.id}, ${node.type || tr('workbench.graph.unknownType')}`
      });
      group.appendChild(svgEl('rect', { width: 190, height: 50, rx: 8 }));
      const name = svgEl('text', { x: 10, y: 20, class: 'dependency-graph-node-name' });
      name.textContent = String(node.displayName || node.name || node.id).slice(0, 26);
      const type = svgEl('text', { x: 10, y: 38, class: 'dependency-graph-node-type' });
      type.textContent = String(node.type || tr('workbench.graph.unknownType')).slice(0, 30);
      group.append(name, type);
      svg.appendChild(group);

      const item = document.createElement('li');
      const jump = createButton(`${node.displayName || node.name || node.id} · ${node.type || ''}`, 'dependency-graph-list-button');
      jump.addEventListener('click', () => group.focus());
      item.appendChild(jump);
      list.appendChild(item);
    });
    canvas.appendChild(svg);
  };

  filter.addEventListener('input', draw);
  zoomOut.addEventListener('click', () => { zoom = Math.max(0.6, zoom - 0.2); draw(); });
  zoomIn.addEventListener('click', () => { zoom = Math.min(2, zoom + 0.2); draw(); });
  reset.addEventListener('click', () => { zoom = 1; filter.value = ''; draw(); });
  draw();
}
