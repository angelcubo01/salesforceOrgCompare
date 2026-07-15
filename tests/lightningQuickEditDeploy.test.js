import { describe, it, expect } from 'vitest';
import {
  artifactTypeToMetadataType,
  createBundleDeployZipBase64
} from '../shared/metadataRetrieve.js';
import { getZipEntries } from '../code/lib/zipBinary.js';

function decodeZipPaths(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const entries = getZipEntries(bytes);
  expect(entries).not.toBeNull();
  return entries.map((e) => e.fileName).sort();
}

describe('lightningQuickEdit deploy', () => {
  it('artifactTypeToMetadataType mapea LWC y Aura', () => {
    expect(artifactTypeToMetadataType('LWC')).toBe('LightningComponentBundle');
    expect(artifactTypeToMetadataType('Aura')).toBe('AuraDefinitionBundle');
    expect(artifactTypeToMetadataType('ApexClass')).toBe('ApexClass');
  });

  it('createBundleDeployZipBase64 incluye todos los archivos LWC', () => {
    const zipBase64 = createBundleDeployZipBase64(
      'LightningComponentBundle',
      'myCmp',
      [
        { fileName: 'myCmp.js', content: 'export default class {}' },
        { fileName: 'myCmp.html', content: '<template></template>' },
        { fileName: 'myCmp.js-meta.xml', content: '<LightningComponentBundle />' }
      ],
      '60.0'
    );

    const paths = decodeZipPaths(zipBase64);
    expect(paths).toEqual([
      'lwc/myCmp/myCmp.html',
      'lwc/myCmp/myCmp.js',
      'lwc/myCmp/myCmp.js-meta.xml',
      'package.xml'
    ]);
  });

  it('createBundleDeployZipBase64 incluye archivos Aura', () => {
    const zipBase64 = createBundleDeployZipBase64(
      'AuraDefinitionBundle',
      'myAura',
      [
        { fileName: 'myAura.cmp', content: '<aura:component />' },
        { fileName: 'controller.js', content: '({})' }
      ],
      '61.0'
    );

    const paths = decodeZipPaths(zipBase64);
    expect(paths).toEqual([
      'aura/myAura/controller.js',
      'aura/myAura/myAura.cmp',
      'package.xml'
    ]);
  });
});
