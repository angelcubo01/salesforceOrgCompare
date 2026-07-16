import { describe, expect, it } from 'vitest';
import { linkifyLogiLineRefs, renderLogiMarkdown } from '../shared/logiMarkdown.js';

describe('linkifyLogiLineRefs', () => {
  it('linkifies L123 and line/línea ranges', () => {
    const html = linkifyLogiLineRefs('See L42 and línea 10 then lines 40-80 and líneas 1–3');
    expect(html).toContain('data-line="42"');
    expect(html).toContain('data-line="10"');
    expect(html).toContain('data-start-line="40"');
    expect(html).toContain('data-end-line="80"');
    expect(html).toContain('data-start-line="1"');
    expect(html).toContain('data-end-line="3"');
    expect(html).toMatch(/logi-md-line-ref/g);
  });

  it('does not break existing tags or code blocks', () => {
    const md = renderLogiMarkdown('Error at L99\n\n```\nL100 inside code\n```');
    expect(md).toContain('data-line="99"');
    expect(md).toContain('logi-md-pre-copy');
    expect(md).toContain('L100 inside code');
    expect(md.match(/data-line="100"/)).toBeNull();
  });
});

describe('renderLogiMarkdown tables', () => {
  it('renders a normal GFM table', () => {
    const html = renderLogiMarkdown('| A | B |\n| --- | --- |\n| 1 | 2 |');
    expect(html).toContain('logi-md-table');
    expect(html).toContain('<th>A</th>');
    expect(html).toContain('<td>1</td>');
  });

  it('keeps pipes inside inline code as one cell', () => {
    const html = renderLogiMarkdown(
      '| Name | Query |\n| --- | --- |\n| q1 | `SELECT Id | Name FROM Account` |'
    );
    expect(html).toContain('logi-md-table');
    expect(html).toContain('<code class="logi-md-code">SELECT Id | Name FROM Account</code>');
    expect(html.match(/<th>/g)?.length).toBe(2);
    expect(html.match(/<td>/g)?.length).toBe(2);
  });

  it('allows a blank line between header and separator', () => {
    const html = renderLogiMarkdown('| A | B |\n\n| --- | --- |\n| 1 | 2 |');
    expect(html).toContain('logi-md-table');
    expect(html).toContain('<td>1</td>');
  });

  it('tolerates partial body rows while streaming', () => {
    const html = renderLogiMarkdown('| A | B |\n| --- | --- |\n| 1 |');
    expect(html).toContain('logi-md-table');
    expect(html).toContain('<td>1</td>');
    expect(html).not.toContain('<p class="logi-md-p">| 1 |</p>');
  });

  it('pads mismatched columns without inventing empty header columns from body overflow', () => {
    const html = renderLogiMarkdown('| A | B |\n| --- | --- |\n| 1 | 2 | 3 |');
    expect(html).toContain('logi-md-table');
    expect(html.match(/<th>/g)?.length).toBe(2);
    expect(html).toContain('2 | 3');
  });

  it('renders blockquotes and ordered list markers', () => {
    const html = renderLogiMarkdown('> note\n\n1. first\n2. second');
    expect(html).toContain('logi-md-quote');
    expect(html).toContain('logi-md-ol');
    expect(html).toContain('class="logi-md-li"');
  });
});
