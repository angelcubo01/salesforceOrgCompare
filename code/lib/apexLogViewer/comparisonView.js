import { escapeHtml } from '../../../shared/htmlEscape.js';

let diffEditor = null;
let diffModels = null;

const esc = (value) => escapeHtml(value == null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value));
const result = (parsed, t) => parsed?.issues?.some((x) => x.type === 'error') ? t('apexLogViewer.compare.result.error') : t('apexLogViewer.compare.result.success');
const status = (value, t) => t(`apexLogViewer.compare.status.${value}`);
const category = (value, t) => t(`apexLogViewer.compare.category.${String(value || '').replace(/\s+/g, '')}`);

function evidenceValue(row, side, t) {
  const item = row?.[side];
  if (!item) return t('apexLogViewer.compare.notPresent');
  const values = [item.label || row.element];
  if (Number.isFinite(Number(item.rows))) values.push(`${t('apexLogViewer.compare.rows')}: ${item.rows}`);
  if (Number.isFinite(Number(item.statusCode)) && item.statusCode) values.push(`HTTP: ${item.statusCode}`);
  if (Number.isFinite(Number(item.used))) values.push(`${item.used}/${item.max || '?'}`);
  if (Number.isFinite(Number(item.durationMs)) && item.durationMs) values.push(`${item.durationMs} ms`);
  return values.join(' · ');
}

function flowContextRows(alignment, showAll) {
  const rows = (alignment || []).slice(0, 300);
  if (showAll) return rows;
  const important = new Set();
  rows.forEach((row, index) => {
    if (row.status === 'same') return;
    important.add(index);
    if (index > 0) important.add(index - 1);
    if (index < rows.length - 1) important.add(index + 1);
  });
  return important.size ? rows.filter((_, index) => important.has(index)) : rows.slice(0, 25);
}

function technicalExecutionCard(label, side, t) {
  const execution = side?.execution || {};
  const route = [execution.type, execution.name || side?.entry, execution.method !== 'N/A' ? execution.method : '']
    .filter(Boolean)
    .join(' · ') || t('apexLogViewer.compare.notPresent');
  const fields = [
    [t('apexLogViewer.compare.route'), route],
    [t('apexLogViewer.compare.logId'), side?.logId || t('apexLogViewer.compare.notPresent')],
    [t('apexLogViewer.compare.executedBy'), side?.user || t('apexLogViewer.compare.notPresent')]
  ];
  return `<article class="apex-log-comparison__execution-card"><strong>${esc(label)}</strong><span class="apex-log-comparison__environment">${esc(side?.environment || t('apexLogViewer.compare.notPresent'))}</span>${fields.map(([name, value]) => `<span><b>${esc(name)}</b>${esc(value)}</span>`).join('')}</article>`;
}

function disposeDiffEditor() {
  try { diffEditor?.dispose(); } catch { /* ignore */ }
  try { diffModels?.original?.dispose(); diffModels?.modified?.dispose(); } catch { /* ignore */ }
  diffEditor = null; diffModels = null;
}

function lineFor(change, side) {
  const key = side === 'a' ? 'originalStartLineNumber' : 'modifiedStartLineNumber';
  return Number(change?.[key]) || 1;
}

function mountTextDiff(content, state, comparison, t, monaco, target = null) {
  let original = false;
  let onlyDiff = false;
  let changes = [];
  let current = -1;
  const textFor = (side) => original
    ? String(state[side].raw || '')
    : (comparison[side === 'a' ? 'normalizedA' : 'normalizedB'] || []).map((line) => line.text).join('\n');
  const render = () => {
    disposeDiffEditor();
    content.innerHTML = `<div class="apex-log-comparison__text-tools">
      <label><input type="checkbox" data-original ${original ? 'checked' : ''}> ${esc(t('apexLogViewer.compare.original'))}</label>
      <label><input type="checkbox" data-only-diff ${onlyDiff ? 'checked' : ''}> ${esc(t('apexLogViewer.compare.onlyDifferences'))}</label>
      <button type="button" data-prev disabled>${esc(t('apexLogViewer.compare.previousDifference'))}</button>
      <span data-index aria-live="polite">${esc(t('apexLogViewer.compare.noDifferences'))}</span>
      <button type="button" data-next disabled>${esc(t('apexLogViewer.compare.nextDifference'))}</button>
      <button type="button" data-find>${esc(t('apexLogViewer.compare.search'))}</button>
    </div><div class="apex-log-comparison__monaco" data-diff-mount></div>`;
    const mount = content.querySelector('[data-diff-mount]');
    if (!monaco?.editor || !mount) return;
    diffModels = {
      original: monaco.editor.createModel(textFor('a'), 'apex'),
      modified: monaco.editor.createModel(textFor('b'), 'apex')
    };
    diffEditor = monaco.editor.createDiffEditor(mount, {
      readOnly: true, originalEditable: false, automaticLayout: true, renderSideBySide: true,
      renderIndicators: true, renderOverviewRuler: true, minimap: { enabled: false },
      ignoreTrimWhitespace: true, diffAlgorithm: 'advanced', renderMarginRevertIcon: false,
      fontSize: 13, lineHeight: 20, wordWrap: 'off', glyphMargin: true, folding: false
    });
    diffEditor.setModel(diffModels);
    const prev = content.querySelector('[data-prev]'); const next = content.querySelector('[data-next]'); const index = content.querySelector('[data-index]');
    const updateControls = () => {
      changes = diffEditor?.getLineChanges?.() || [];
      if (current >= changes.length) current = changes.length - 1;
      const has = changes.length > 0;
      prev.disabled = !has; next.disabled = !has;
      index.textContent = has ? t('apexLogViewer.compare.differenceIndex', { current: String(current + 1), total: String(changes.length) }) : t('apexLogViewer.compare.noDifferences');
    };
    const go = (direction) => {
      if (!changes.length) return;
      current = (current + direction + changes.length) % changes.length;
      const change = changes[current];
      diffEditor.getOriginalEditor().revealLineInCenter(lineFor(change, 'a'));
      diffEditor.getModifiedEditor().revealLineInCenter(lineFor(change, 'b'));
      updateControls();
    };
    const revealTarget = () => {
      const line = Number(target?.line) || 0;
      if (!line) return;
      const editor = target.side === 'a' ? diffEditor.getOriginalEditor() : diffEditor.getModifiedEditor();
      editor.revealLineInCenter(line);
      editor.setPosition({ lineNumber: line, column: 1 });
      editor.focus();
    };
    prev.addEventListener('click', () => go(-1)); next.addEventListener('click', () => go(1));
    content.querySelector('[data-find]')?.addEventListener('click', () => { void diffEditor.getModifiedEditor().getAction('actions.find')?.run(); });
    content.querySelector('[data-original]')?.addEventListener('change', (event) => { original = event.target.checked; render(); });
    content.querySelector('[data-only-diff]')?.addEventListener('change', (event) => {
      onlyDiff = event.target.checked;
      diffEditor.updateOptions({ hideUnchangedRegions: { enabled: onlyDiff, contextLineCount: 3, minimumLineCount: 4 } });
    });
    diffEditor.onDidUpdateDiff(() => { updateControls(); if (changes.length && current < 0) go(1); revealTarget(); });
    setTimeout(() => { updateControls(); revealTarget(); }, 0);
  };
  render();
}

export function renderComparisonView(mount, state, t, monaco, onSummaryMount) {
  if (!mount || !state?.comparison) return;
  disposeDiffEditor();
  const { comparison, a, b } = state;
  const rows = comparison.differences.slice(0, 200);
  mount.innerHTML = `<div class="apex-log-comparison">
    <section class="apex-log-comparison__summary">
      <article><strong>${esc(t('apexLogViewer.compare.logA'))} · ${esc(a.environment)}</strong><span class="apex-log-comparison__result">${esc(result(a.parsed, t))}</span></article>
      <article><strong>${esc(t('apexLogViewer.compare.logB'))} · ${esc(b.environment)}</strong><span class="apex-log-comparison__result">${esc(result(b.parsed, t))}</span></article>
      <article><strong>${esc(t('apexLogViewer.compare.firstDivergence'))}</strong><span>${esc(comparison.firstDivergence?.element || t('apexLogViewer.compare.none'))}</span></article>
      <article><strong>${esc(t('apexLogViewer.compare.routes'))}</strong><span>${rows.filter((x) => x.category === 'Ruta').length}</span></article>
    </section>
    <section class="apex-log-comparison__execution-context">${technicalExecutionCard(t('apexLogViewer.compare.logA'), a, t)}${technicalExecutionCard(t('apexLogViewer.compare.logB'), b, t)}</section>
    ${comparison.truncated ? `<p class="apex-log-comparison__warning">${esc(t('apexLogViewer.compare.truncated'))}</p>` : ''}
    <div class="apex-log-comparison__subtabs" role="tablist" aria-label="${esc(t('apexLogViewer.compare.views'))}">${['summary', 'flow', 'differences', 'text'].map((view, index) => `<button type="button" role="tab" aria-selected="${index === 0}" data-view="${view}">${esc(t(`apexLogViewer.compare.${view}`))}</button>`).join('')}</div>
    <div data-comparison-content role="tabpanel"></div>
  </div>`;
  const content = mount.querySelector('[data-comparison-content]');
  const activate = (view, target = null) => {
    const logiMount = view === 'summary' ? '<div id="apexLogComparisonSummaryMount" class="apex-log-comparison__logi-summary"></div>' : '';
    if (view !== 'text') disposeDiffEditor();
    mount.querySelectorAll('[data-view]').forEach((button) => button.setAttribute('aria-selected', String(button.dataset.view === view)));
    if (view === 'summary') {
      const important = rows.slice().sort((left, right) => (right.impact === 'high') - (left.impact === 'high')).slice(0, 6);
      const routeCount = rows.filter((row) => row.category === 'Ruta').length;
      const highCount = rows.filter((row) => row.impact === 'high').length;
      content.innerHTML = `${logiMount}<section class="apex-log-comparison__diagnosis"><header><span class="apex-log-comparison__state">${esc(t('apexLogViewer.compare.summary'))}</span><div><strong>${esc(t('apexLogViewer.compare.firstDivergence'))}</strong><p>${esc(comparison.firstDivergence?.element || t('apexLogViewer.compare.none'))}</p></div></header><div class="apex-log-comparison__metrics"><article><strong>${esc(t('apexLogViewer.compare.routes'))}</strong><span>${routeCount}</span></article><article><strong>${esc(t('apexLogViewer.compare.differences'))}</strong><span>${rows.length}</span></article><article><strong>${esc(t('apexLogViewer.compare.impact.high'))}</strong><span>${highCount}</span></article></div></section><section class="apex-log-comparison__summary-differences"><h3>${esc(t('apexLogViewer.compare.differences'))}</h3><div class="apex-log-comparison__difference-cards">${important.map((row) => `<article class="apex-log-comparison__difference-card is-${esc(row.impact)}"><header><span class="apex-log-comparison__state">${esc(category(row.category, t))}</span><span>${esc(status(row.status, t))} · ${esc(t(`apexLogViewer.compare.impact.${row.impact}`))}</span></header><strong>${esc(row.element)}</strong><div class="apex-log-comparison__difference-evidence"><div><b>${esc(t('apexLogViewer.compare.logA'))}</b><span>${esc(evidenceValue(row, 'a', t))}</span>${row.lineA ? `<button data-a="${row.lineA}">${esc(t('apexLogViewer.compare.openTextA'))} · L${row.lineA}</button>` : ''}</div><div><b>${esc(t('apexLogViewer.compare.logB'))}</b><span>${esc(evidenceValue(row, 'b', t))}</span>${row.lineB ? `<button data-b="${row.lineB}">${esc(t('apexLogViewer.compare.openTextB'))} · L${row.lineB}</button>` : ''}</div></div></article>`).join('') || `<p class="apex-log-compare-empty">${esc(t('apexLogViewer.compare.noDifferences'))}</p>`}</div></section>`;
      onSummaryMount?.(content.querySelector('#apexLogComparisonSummaryMount'));
      content.querySelectorAll('[data-a]').forEach((button) => button.addEventListener('click', () => activate('text', { side: 'a', line: Number(button.dataset.a) })));
      content.querySelectorAll('[data-b]').forEach((button) => button.addEventListener('click', () => activate('text', { side: 'b', line: Number(button.dataset.b) })));
      return;
    }
    if (view === 'flow') {
      let onlyDifferences = true;
      const paint = () => {
        const showAll = !onlyDifferences;
        const flowRows = onlyDifferences
          ? comparison.alignment.slice(0, 300).filter((row) => row.status !== 'same')
          : flowContextRows(comparison.alignment, true);
        content.innerHTML = `<section class="apex-log-comparison__guide"><strong>${esc(t('apexLogViewer.compare.flow'))}</strong><p>${esc(t('apexLogViewer.compare.flowHelp'))}</p><button type="button" data-flow-context>${esc(t(showAll ? 'apexLogViewer.compare.hideAllFlow' : 'apexLogViewer.compare.showAllFlow'))}</button></section><ol class="apex-log-comparison__flow-cards">${flowRows.map((x) => {
          const key = x.status === 'same' ? 'same' : x.status;
          const label = x.a?.label || x.b?.label || t('apexLogViewer.compare.none');
          return `<li class="apex-log-comparison__flow-card is-${esc(x.status)}"><span class="apex-log-comparison__state">${esc(t(`apexLogViewer.compare.flow.${key}`))}</span><strong>${esc(label)}</strong><div class="apex-log-comparison__flow-evidence"><div><b>${esc(t('apexLogViewer.compare.logA'))}</b>${x.a ? `<button data-a="${x.a.line || 0}">${esc(t('apexLogViewer.compare.openTextA'))} · L${x.a.line || '—'}</button>` : `<span>${esc(t('apexLogViewer.compare.notPresent'))}</span>`}</div><div><b>${esc(t('apexLogViewer.compare.logB'))}</b>${x.b ? `<button data-b="${x.b.line || 0}">${esc(t('apexLogViewer.compare.openTextB'))} · L${x.b.line || '—'}</button>` : `<span>${esc(t('apexLogViewer.compare.notPresent'))}</span>`}</div></div></li>`;
        }).join('')}</ol>`;
        const legacyControl = content.querySelector('[data-flow-context]');
        const flowToggle = document.createElement('label');
        flowToggle.className = 'apex-log-comparison__flow-toggle';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = onlyDifferences;
        input.addEventListener('change', () => { onlyDifferences = input.checked; paint(); });
        flowToggle.append(input, document.createTextNode(` ${t('apexLogViewer.compare.flowOnlyDifferences')}`));
        legacyControl?.replaceWith(flowToggle);
        content.querySelectorAll('[data-a]').forEach((button) => button.addEventListener('click', () => activate('text', { side: 'a', line: Number(button.dataset.a) })));
        content.querySelectorAll('[data-b]').forEach((button) => button.addEventListener('click', () => activate('text', { side: 'b', line: Number(button.dataset.b) })));
      };
      paint();
      return;
    }
    if (view === 'differences') {
      let selectedCategory = '';
      let selectedImpact = '';
      const paint = () => {
        const categories = [...new Set(rows.map((row) => row.category))];
        const visible = rows.filter((row) => (!selectedCategory || row.category === selectedCategory) && (!selectedImpact || row.impact === selectedImpact));
        content.innerHTML = `<section class="apex-log-comparison__guide"><strong>${esc(t('apexLogViewer.compare.differences'))}</strong><p>${esc(t('apexLogViewer.compare.differencesHelp'))}</p><div class="apex-log-comparison__filters"><label>${esc(t('apexLogViewer.compare.category'))}<select data-category><option value="">${esc(t('apexLogViewer.compare.all'))}</option>${categories.map((value) => `<option value="${esc(value)}" ${value === selectedCategory ? 'selected' : ''}>${esc(category(value, t))}</option>`).join('')}</select></label><label>${esc(t('apexLogViewer.compare.impact'))}<select data-impact><option value="">${esc(t('apexLogViewer.compare.all'))}</option>${['high', 'medium', 'low'].map((value) => `<option value="${value}" ${value === selectedImpact ? 'selected' : ''}>${esc(t(`apexLogViewer.compare.impact.${value}`))}</option>`).join('')}</select></label></div></section><div class="apex-log-comparison__difference-cards">${visible.map((row) => `<article class="apex-log-comparison__difference-card is-${esc(row.impact)}"><header><span class="apex-log-comparison__state">${esc(category(row.category, t))}</span><span>${esc(status(row.status, t))} · ${esc(t(`apexLogViewer.compare.impact.${row.impact}`))}</span></header><strong>${esc(row.element)}</strong><p>${esc(t('apexLogViewer.compare.whatChanged'))}: ${esc(status(row.status, t))}</p><div class="apex-log-comparison__difference-evidence"><div><b>${esc(t('apexLogViewer.compare.logA'))}</b><span>${esc(evidenceValue(row, 'a', t))}</span>${row.lineA ? `<button data-a="${row.lineA}">${esc(t('apexLogViewer.compare.openTextA'))} · L${row.lineA}</button>` : ''}</div><div><b>${esc(t('apexLogViewer.compare.logB'))}</b><span>${esc(evidenceValue(row, 'b', t))}</span>${row.lineB ? `<button data-b="${row.lineB}">${esc(t('apexLogViewer.compare.openTextB'))} · L${row.lineB}</button>` : ''}</div></div></article>`).join('') || `<p class="apex-log-compare-empty">${esc(t('apexLogViewer.compare.noDifferences'))}</p>`}</div>`;
        content.querySelector('[data-category]')?.addEventListener('change', (event) => { selectedCategory = event.target.value; paint(); });
        content.querySelector('[data-impact]')?.addEventListener('change', (event) => { selectedImpact = event.target.value; paint(); });
        content.querySelectorAll('[data-a]').forEach((button) => button.addEventListener('click', () => activate('text', { side: 'a', line: Number(button.dataset.a) })));
        content.querySelectorAll('[data-b]').forEach((button) => button.addEventListener('click', () => activate('text', { side: 'b', line: Number(button.dataset.b) })));
      };
      paint();
      return;
    }
    if (view === 'flow') content.innerHTML = `<ol class="apex-log-comparison__flow">${comparison.alignment.slice(0, 300).map((x) => `<li class="is-${x.status}"><b>${esc(status(x.status, t))}</b> ${esc(x.a?.label || x.b?.label)} <button data-a="${x.a?.line || 0}">${esc(t('apexLogViewer.compare.logA'))} · L${x.a?.line || '—'}</button><button data-b="${x.b?.line || 0}">${esc(t('apexLogViewer.compare.logB'))} · L${x.b?.line || '—'}</button></li>`).join('')}</ol>`;
    else if (view === 'text') mountTextDiff(content, state, comparison, t, monaco, target);
    else {
      const visible = view === 'summary' ? rows.slice(0, 8) : rows;
      content.innerHTML = `<table class="apex-log-comparison__table"><thead><tr><th>${esc(t('apexLogViewer.compare.category'))}</th><th>${esc(t('apexLogViewer.compare.element'))}</th><th>${esc(t('apexLogViewer.compare.logA'))}</th><th>${esc(t('apexLogViewer.compare.logB'))}</th><th>${esc(t('apexLogViewer.compare.impact'))}</th></tr></thead><tbody>${visible.map((x) => `<tr><td>${esc(category(x.category, t))}</td><td>${esc(x.element)}</td><td><button data-a="${x.lineA}">${esc(x.a?.rows ?? x.a?.statusCode ?? x.a?.used ?? status(x.status, t))} · L${x.lineA || '—'}</button></td><td><button data-b="${x.lineB}">${esc(x.b?.rows ?? x.b?.statusCode ?? x.b?.used ?? status(x.status, t))} · L${x.lineB || '—'}</button></td><td>${esc(t(`apexLogViewer.compare.impact.${x.impact}`))}</td></tr>`).join('')}</tbody></table>`;
    }
    if (view === 'summary') {
      content.insertAdjacentHTML('afterbegin', logiMount);
      onSummaryMount?.(content.querySelector('#apexLogComparisonSummaryMount'));
    }
    content.querySelectorAll('[data-a]').forEach((button) => button.addEventListener('click', () => activate('text', { side: 'a', line: Number(button.dataset.a) })));
    content.querySelectorAll('[data-b]').forEach((button) => button.addEventListener('click', () => activate('text', { side: 'b', line: Number(button.dataset.b) })));
  };
  mount.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => activate(button.dataset.view)));
  activate('summary');
  return {
    /** @param {{ side?: 'a' | 'b', line?: number }} target */
    showText: (target = {}) => activate('text', {
      side: target.side === 'b' ? 'b' : 'a',
      line: Number(target.line) || 1
    })
  };
}
