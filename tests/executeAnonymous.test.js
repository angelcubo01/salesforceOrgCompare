import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  shouldUseSoapForAnonymousBody,
  parseExecuteAnonymousSoapResponse,
  buildExecuteAnonymousSoapEnvelope,
  executeAnonymous
} from '../shared/salesforceApi.js';

describe('shouldUseSoapForAnonymousBody', () => {
  it('returns false for short scripts', () => {
    expect(shouldUseSoapForAnonymousBody("System.debug('ok');")).toBe(false);
    expect(shouldUseSoapForAnonymousBody('x'.repeat(3999))).toBe(false);
  });

  it('returns true when char count reaches threshold', () => {
    expect(shouldUseSoapForAnonymousBody('x'.repeat(4000))).toBe(true);
  });

  it('returns true when encoded length exceeds threshold', () => {
    const body = 'a'.repeat(2000) + ' '.repeat(1500);
    expect(body.length).toBeLessThan(4000);
    expect(encodeURIComponent(body).length).toBeGreaterThanOrEqual(6000);
    expect(shouldUseSoapForAnonymousBody(body)).toBe(true);
  });
});

describe('parseExecuteAnonymousSoapResponse', () => {
  it('parses successful execution', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <executeAnonymousResponse xmlns="http://soap.sforce.com/2006/08/apex">
      <result>
        <column>-1</column>
        <compiled>true</compiled>
        <compileProblem xsi:nil="true" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"/>
        <exceptionMessage xsi:nil="true" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"/>
        <exceptionStackTrace xsi:nil="true" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"/>
        <line>-1</line>
        <success>true</success>
      </result>
    </executeAnonymousResponse>
  </soapenv:Body>
</soapenv:Envelope>`;
    expect(parseExecuteAnonymousSoapResponse(xml)).toEqual({
      line: -1,
      column: -1,
      compiled: true,
      success: true,
      compileProblem: null,
      exceptionMessage: null,
      exceptionStackTrace: null
    });
  });

  it('parses compile error', () => {
    const xml = `<result>
      <column>12</column>
      <compiled>false</compiled>
      <compileProblem>Unexpected token &apos;;&apos;.</compileProblem>
      <exceptionMessage xsi:nil="true"/>
      <exceptionStackTrace xsi:nil="true"/>
      <line>3</line>
      <success>false</success>
    </result>`;
    const parsed = parseExecuteAnonymousSoapResponse(xml);
    expect(parsed.compiled).toBe(false);
    expect(parsed.success).toBe(false);
    expect(parsed.compileProblem).toContain('Unexpected token');
    expect(parsed.line).toBe(3);
    expect(parsed.column).toBe(12);
  });

  it('parses runtime exception', () => {
    const xml = `<result>
      <column>5</column>
      <compiled>true</compiled>
      <compileProblem xsi:nil="true"/>
      <exceptionMessage>Divide by 0</exceptionMessage>
      <exceptionStackTrace>Class.Foo.bar: line 5</exceptionStackTrace>
      <line>5</line>
      <success>false</success>
    </result>`;
    const parsed = parseExecuteAnonymousSoapResponse(xml);
    expect(parsed.compiled).toBe(true);
    expect(parsed.success).toBe(false);
    expect(parsed.exceptionMessage).toBe('Divide by 0');
    expect(parsed.exceptionStackTrace).toContain('Class.Foo.bar');
  });

  it('throws on SOAP fault', () => {
    const xml = `<soapenv:Envelope>
      <soapenv:Body>
        <soapenv:Fault>
          <faultstring>INVALID_SESSION_ID</faultstring>
        </soapenv:Fault>
      </soapenv:Body>
    </soapenv:Envelope>`;
    expect(() => parseExecuteAnonymousSoapResponse(xml)).toThrow('INVALID_SESSION_ID');
  });
});

describe('buildExecuteAnonymousSoapEnvelope', () => {
  it('uses Apex SOAP namespace and executeAnonymous operation', () => {
    const xml = buildExecuteAnonymousSoapEnvelope('sid123', "System.debug('ok');");
    expect(xml).toContain('xmlns="http://soap.sforce.com/2006/08/apex"');
    expect(xml).toContain('<executeAnonymous>');
    expect(xml).toContain('<sessionId>sid123</sessionId>');
    expect(xml).not.toContain('2006/04/apex');
    expect(xml).not.toContain('<executeanonymous');
  });
});

describe('executeAnonymous transport routing', () => {
  /** @type {import('vitest').Mock} */
  let fetchMock;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses REST GET for small scripts', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ compiled: true, success: true })
    });
    const result = await executeAnonymous('https://example.my.salesforce.com', 'sid', '60.0', "System.debug('ok');");
    expect(result).toEqual({ compiled: true, success: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/services/data/v60.0/tooling/executeAnonymous/');
    expect(init.method).toBe('GET');
    expect(url).toContain('anonymousBody=');
  });

  it('uses SOAP POST for large scripts', async () => {
    const largeBody = 'System.debug(\'' + 'x'.repeat(5000) + '\');';
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        `<soapenv:Envelope><soapenv:Body><executeAnonymousResponse>
          <result><column>-1</column><compiled>true</compiled>
          <compileProblem xsi:nil="true"/><exceptionMessage xsi:nil="true"/>
          <exceptionStackTrace xsi:nil="true"/><line>-1</line><success>true</success>
          </result></executeAnonymousResponse></soapenv:Body></soapenv:Envelope>`
    });
    const result = await executeAnonymous(
      'https://example.my.salesforce.com',
      'sid',
      '60.0',
      largeBody,
      '00Dxx0000000001'
    );
    expect(result.compiled).toBe(true);
    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/services/Soap/s/60.0/00Dxx0000000001');
    expect(init.method).toBe('POST');
    expect(init.body).toContain('<executeAnonymous>');
    expect(init.body).toContain('http://soap.sforce.com/2006/08/apex');
    expect(init.body).toContain('System.debug');
  });
});
