const TRACK_COLOR = '#334155';
const DEFAULT_SIZE = 92;
const START_ANGLE = -Math.PI / 2;

function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function prepareCanvas(canvas, size = DEFAULT_SIZE) {
  if (!canvas) return null;
  const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  return { ctx, size };
}

function drawRing(ctx, cx, cy, radius, width, percent, color) {
  const p = clamp01(percent);
  const end = START_ANGLE + p * Math.PI * 2;
  ctx.lineCap = 'round';
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.strokeStyle = TRACK_COLOR;
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  if (p > 0) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.arc(cx, cy, radius, START_ANGLE, end);
    ctx.stroke();
  }
}

function drawRingInteractive(ctx, cx, cy, radius, width, percent, color, isActive) {
  drawRing(ctx, cx, cy, radius, width, percent, color);
  if (!isActive) return;
  ctx.lineCap = 'round';
  ctx.lineWidth = width + 3;
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.25;
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function ensureTooltip(container) {
  let tip = container.querySelector('.org-limits-chart-tooltip');
  if (tip) return tip;
  tip = document.createElement('div');
  tip.className = 'org-limits-chart-tooltip hidden';
  container.appendChild(tip);
  return tip;
}

function setTooltip(container, text, x, y) {
  const tip = ensureTooltip(container);
  tip.textContent = text;
  tip.classList.remove('hidden');
  void tip.offsetWidth;
  const pad = 8;
  const cw = container.clientWidth;
  const ch = container.clientHeight;
  let tw = tip.offsetWidth;
  let th = tip.offsetHeight;
  if (tw < 4 || th < 4) {
    tw = 44;
    th = 18;
  }
  const tx = Math.max(pad + tw / 2, Math.min(cw - pad - tw / 2, x));
  const nearTop = y < th + pad;
  const nearBottom = y > ch - th - pad;
  let top;
  let transform;
  if (nearTop && !nearBottom) {
    transform = 'translate(-50%, 0)';
    top = Math.min(ch - th - pad, y + pad);
  } else if (nearBottom) {
    transform = 'translate(-50%, -100%)';
    top = Math.max(th + pad, y - pad);
  } else {
    transform = 'translate(-50%, -100%)';
    top = Math.max(pad, y - pad);
  }
  tip.style.left = `${tx}px`;
  tip.style.top = `${top}px`;
  tip.style.transform = transform;
}

function hideTooltip(container) {
  const tip = container.querySelector('.org-limits-chart-tooltip');
  if (tip) tip.classList.add('hidden');
}

function drawDonut(canvas, percent, color) {
  if (!canvas) return;
  const prepared = prepareCanvas(canvas);
  if (!prepared) return;
  const { ctx, size } = prepared;
  const cx = size / 2;
  const cy = size / 2;
  drawRing(ctx, cx, cy, 30, 12, percent, color);
}

export function renderDonutChart(container, percent, color) {
  if (!container) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'org-limits-chart-canvas';
  container.innerHTML = '';
  container.appendChild(canvas);
  const p = clamp01(percent);
  const pctTxt = `${(p * 100).toFixed(1)}%`;
  canvas.title = pctTxt;
  const draw = (hovered) => {
    const prepared = prepareCanvas(canvas);
    if (!prepared) return;
    const { ctx, size } = prepared;
    const cx = size / 2;
    const cy = size / 2;
    drawRingInteractive(ctx, cx, cy, 30, 12, p, color, hovered);
  };
  draw(false);
  canvas.addEventListener('mouseenter', (ev) => {
    draw(true);
    const rect = canvas.getBoundingClientRect();
    setTooltip(container, pctTxt, ev.clientX - rect.left, ev.clientY - rect.top);
  });
  canvas.addEventListener('mousemove', (ev) => {
    const rect = canvas.getBoundingClientRect();
    setTooltip(container, pctTxt, ev.clientX - rect.left, ev.clientY - rect.top);
  });
  canvas.addEventListener('mouseleave', () => {
    draw(false);
    hideTooltip(container);
  });
}

export function renderMultiSeriesPieChart(
  container,
  outerPercent,
  innerPercent,
  outerColor,
  innerColor,
  options = {}
) {
  if (!container) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'org-limits-chart-canvas org-limits-chart-canvas-multi';
  container.innerHTML = '';
  container.appendChild(canvas);
  const outerP = clamp01(outerPercent);
  const innerP = clamp01(innerPercent);
  const outerLabel = options.outerLabel || 'Org 1';
  const innerLabel = options.innerLabel || 'Org 2';
  const seriesText = {
    outer: `${outerLabel}: ${(outerP * 100).toFixed(1)}%`,
    inner: `${innerLabel}: ${(innerP * 100).toFixed(1)}%`
  };
  canvas.title = `${seriesText.outer} | ${seriesText.inner}`;
  const draw = (activeSeries) => {
    const prepared = prepareCanvas(canvas);
    if (!prepared) return;
    const { ctx, size } = prepared;
    const cx = size / 2;
    const cy = size / 2;
    drawRingInteractive(ctx, cx, cy, 33, 10, outerP, outerColor, activeSeries === 'outer');
    drawRingInteractive(ctx, cx, cy, 20, 10, innerP, innerColor, activeSeries === 'inner');
  };
  draw(null);
  canvas.addEventListener('mousemove', (ev) => {
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const dist = Math.hypot(x - cx, y - cy);
    let active = null;
    if (dist >= 28 && dist <= 38) active = 'outer';
    else if (dist >= 15 && dist <= 25) active = 'inner';
    draw(active);
    if (active) setTooltip(container, seriesText[active], x, y);
    else hideTooltip(container);
  });
  canvas.addEventListener('mouseleave', () => {
    draw(null);
    hideTooltip(container);
  });
}
