import { describe, expect, it } from 'vitest';
import { buildSoapImportEnvelope, parseSoapResults } from '../shared/dataImportSoap.js';

describe('dataImportSoap', () => {
  it('parseSoapResults extrae éxito e id', () => {
    const xml = `
      <createResponse>
        <result><id>001xx</id><success>true</success></result>
        <result><success>false</success><errors><message>bad</message></errors></result>
      </createResponse>`;
    const results = parseSoapResults(xml, 2);
    expect(results[0]).toEqual({ success: true, id: '001xx', errors: undefined });
    expect(results[1].success).toBe(false);
    expect(results[1].errors).toContain('bad');
  });

  it('acepta respuestas SOAP con namespace y decodifica mensajes', () => {
    const xml = '<urn:result><urn:success>false</urn:success><urn:errors><urn:message>A &amp; B</urn:message></urn:errors></urn:result>';
    expect(parseSoapResults(xml, 1)).toEqual([
      { success: false, id: undefined, errors: ['A & B'] }
    ]);
  });

  it('serializa sObjects dinámicos con el namespace de Partner WSDL', () => {
    const xml = buildSoapImportEnvelope({
      sid: 'session',
      operation: 'insert',
      objectApiName: 'PermissionSetAssignment',
      records: [{ AssigneeId: '005xx', PermissionSetId: '0PSxx' }]
    });

    expect(xml).toContain('xmlns:urn1="urn:sobject.partner.soap.sforce.com"');
    expect(xml).toContain('<urn:sObjects><urn1:type>PermissionSetAssignment</urn1:type>');
    expect(xml).toContain('<urn1:AssigneeId>005xx</urn1:AssigneeId>');
    expect(xml).toContain('<urn1:PermissionSetId>0PSxx</urn1:PermissionSetId>');
    expect(xml).not.toContain('xsi:type="urn:PermissionSetAssignment"');
  });

  it('incluye statusCode y campos en el detalle de error', () => {
    const xml = `
      <createResponse><result><success>false</success><errors>
        <fields>PermissionSetId</fields>
        <message>Duplicate assignment</message>
        <statusCode>DUPLICATE_VALUE</statusCode>
      </errors></result></createResponse>`;

    expect(parseSoapResults(xml, 1)[0].errors).toEqual([
      'DUPLICATE_VALUE [PermissionSetId]: Duplicate assignment'
    ]);
  });
});
