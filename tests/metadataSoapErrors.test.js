import { describe, it, expect } from 'vitest';
import {
  metadataSoapHttpErrorMessage,
  summarizeSoapHttpErrorBody
} from '../shared/metadataRetrieve.js';

describe('metadata SOAP HTTP errors', () => {
  it('extracts faultstring from SOAP fault body', () => {
    const body =
      '<soapenv:Envelope><soapenv:Body><soapenv:Fault><faultstring>INVALID_SESSION_ID</faultstring></soapenv:Fault></soapenv:Body></soapenv:Envelope>';
    expect(summarizeSoapHttpErrorBody(body)).toBe('INVALID_SESSION_ID');
  });

  it('detects session expired in plain text', () => {
    expect(summarizeSoapHttpErrorBody('Session expired or invalid')).toBe(
      'Session expired or invalid'
    );
  });

  it('summarizes HTML error pages', () => {
    expect(summarizeSoapHttpErrorBody('<html><title>Unauthorized</title></html>')).toBe(
      'Unauthorized'
    );
  });

  it('builds readable HTTP error messages', () => {
    expect(metadataSoapHttpErrorMessage(401)).toContain('session expired');
    expect(metadataSoapHttpErrorMessage(403)).toContain('insufficient access');
    expect(metadataSoapHttpErrorMessage(500, 'Server error')).toBe(
      'Metadata SOAP call failed: HTTP 500 — Server error'
    );
  });
});
