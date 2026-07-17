import { describe, expect, it } from 'vitest';
import { linkifyLogiLineRefs, logiMarkdownToPlainText, renderLogiMarkdown } from '../shared/logi/logiMarkdown.js';

describe('linkifyLogiLineRefs', () => {
  it('linkifies L123 and explicit log-line phrases', () => {
    const html = linkifyLogiLineRefs(
      'See L42 and log line 10 then log lines 40-80 and línea del log 3 and L10-L20'
    );
    expect(html).toContain('data-line="42"');
    expect(html).toContain('data-line="10"');
    expect(html).toContain('data-start-line="40"');
    expect(html).toContain('data-end-line="80"');
    expect(html).toContain('data-line="3"');
    expect(html).toContain('data-start-line="10"');
    expect(html).toContain('data-end-line="20"');
    expect(html).toMatch(/logi-md-line-ref/g);
  });

  it('does not linkify bare line/línea (often Apex source lines)', () => {
    const html = linkifyLogiLineRefs('See línea 10 then lines 40-80 and line 99');
    expect(html).not.toContain('logi-md-line-ref');
    expect(html).toContain('línea 10');
    expect(html).toContain('lines 40-80');
    expect(html).toContain('line 99');
  });

  it('does not linkify L-refs in Apex class/source context', () => {
    const html = linkifyLogiLineRefs(
      'En la clase CCEmailMessageBI_TRHan la lógica entre L15102 - L15212 consulta el Contact. ' +
        'Class.Foo.bar: L88 throws. Source line L12 in the trigger.'
    );
    expect(html).not.toContain('logi-md-line-ref');
    expect(html).toContain('L15102');
    expect(html).toContain('L88');
    expect(html).toContain('L12');
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

describe('renderLogiMarkdown entities and identifiers', () => {
  it('does not double-escape quotes inside inline code', () => {
    const html = renderLogiMarkdown('Use `"CC_Interno__c":true` in the payload');
    expect(html).toContain('<code class="logi-md-code">&quot;CC_Interno__c&quot;:true</code>');
    expect(html).not.toContain('&amp;quot;');
  });

  it('decodes literal &quot; entities from the model', () => {
    const html = renderLogiMarkdown('Email is &quot;user@example.com&quot;');
    // Decoded to real quotes, then escaped once for HTML — never &amp;quot;
    expect(html).toContain('Email is &quot;user@example.com&quot;');
    expect(html).not.toContain('&amp;quot;');
  });

  it('does not italicize Apex names with underscores', () => {
    const html = renderLogiMarkdown(
      'Trigger CCEmailMessageBI_TRHan.validarDestinatariosCorreo and CCEmailMessageBI_TRHan_validarDestinatariosCorreo'
    );
    expect(html).not.toContain('<em>');
    expect(html).toContain('CCEmailMessageBI_TRHan.validarDestinatariosCorreo');
    expect(html).toContain('CCEmailMessageBI_TRHan_validarDestinatariosCorreo');
  });

  it('still supports real _italic_ and __bold__ with word boundaries', () => {
    const html = renderLogiMarkdown('This is _italic_ and __bold__ text');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<strong>bold</strong>');
  });

  it('does not bold Salesforce custom field API names', () => {
    const html = renderLogiMarkdown('Field ns__Field__c stays plain');
    expect(html).not.toContain('<strong>');
    expect(html).toContain('ns__Field__c');
  });
});

describe('logiMarkdownToPlainText', () => {
  it('strips markdown so copy is document-ready', () => {
    const plain = logiMarkdownToPlainText(
      '## Findings\n\n- **Error** in `Foo.cls`\n- See [docs](https://example.com)\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n```\nSELECT Id FROM Account\n```\n'
    );
    expect(plain).toContain('Findings');
    expect(plain).toContain('• Error in Foo.cls');
    expect(plain).toContain('See docs');
    expect(plain).toContain('1\t2');
    expect(plain).toContain('SELECT Id FROM Account');
    expect(plain).not.toContain('##');
    expect(plain).not.toContain('**');
    expect(plain).not.toContain('```');
    expect(plain).not.toContain('[docs]');
    expect(plain).not.toContain('| ---');
  });

  it('keeps Apex API names readable', () => {
    const plain = logiMarkdownToPlainText('Check `CC_Interno__c` on Case');
    expect(plain).toBe('Check CC_Interno__c on Case');
  });
});
