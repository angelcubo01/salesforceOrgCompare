import { describe, it, expect } from 'vitest';
import { hostnameMatchesSfCloud } from '../shared/sfDomains.js';

describe('hostnameMatchesSfCloud', () => {
  it('acepta dominios estándar y gobierno/China', () => {
    expect(hostnameMatchesSfCloud('foo.my.salesforce.com')).toBe(true);
    expect(hostnameMatchesSfCloud('foo.lightning.force.com')).toBe(true);
    expect(hostnameMatchesSfCloud('foo.cloudforce.com')).toBe(true);
    expect(hostnameMatchesSfCloud('foo.salesforce.mil')).toBe(true);
    expect(hostnameMatchesSfCloud('foo.sfcrmapps.cn')).toBe(true);
  });

  it('rechaza dominios no Salesforce', () => {
    expect(hostnameMatchesSfCloud('evil.example.com')).toBe(false);
    expect(hostnameMatchesSfCloud('')).toBe(false);
  });
});
