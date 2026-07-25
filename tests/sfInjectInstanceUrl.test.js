import { describe, it, expect } from 'vitest';
import { instanceUrlFromHostname, instanceUrlFromLocationUrl } from '../sfInject/lib/instanceUrl.js';

describe('sfInjectInstanceUrl', () => {
  it('maps lightning.force.com to my.salesforce.com', () => {
    expect(instanceUrlFromHostname('myorg.lightning.force.com')).toBe(
      'https://myorg.my.salesforce.com'
    );
  });

  it('maps salesforce-setup.com sandbox host', () => {
    expect(instanceUrlFromHostname('org--str.sandbox.my.salesforce-setup.com')).toBe(
      'https://org--str.sandbox.my.salesforce.com'
    );
  });

  it('parses full tab URL', () => {
    expect(
      instanceUrlFromLocationUrl(
        'https://org--str.sandbox.my.salesforce-setup.com/lightning/setup/ApexDebugLogs/home'
      )
    ).toBe('https://org--str.sandbox.my.salesforce.com');
  });
});
