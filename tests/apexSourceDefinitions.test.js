import { describe, expect, it } from 'vitest';
import {
  findApexMethodDeclarations,
  findApexSymbolAt,
  inferApexCallOwner,
  resolveDefinitionInApexClass
} from '../shared/apexSourceDefinitions.js';

function positionOf(source, needle, from = 0) {
  const index = source.indexOf(needle, from);
  const before = source.slice(0, index);
  return { lineNumber: before.split('\n').length, column: before.length - before.lastIndexOf('\n') };
}

describe('navegación de definiciones Apex', () => {
  it('resuelve la clase y el método estático de FRA_TestDataFactory', () => {
    const source = 'private static List<String> primerosCanalesResolucion(Integer n) {\n  return FRA_TestDataFactory.getCanalesResolucionValidos(n);\n}';
    const pos = positionOf(source, 'getCanalesResolucionValidos');
    const symbol = findApexSymbolAt(source, pos.lineNumber, pos.column);
    expect(symbol).toMatchObject({ kind: 'method', name: 'getCanalesResolucionValidos', qualifier: 'FRA_TestDataFactory', argumentCount: 1 });
    expect(inferApexCallOwner(source, 'MiClase', symbol, pos.lineNumber, pos.column)).toBe('FRA_TestDataFactory');
    const row = { Id: '01p000000000001', Name: 'FRA_TestDataFactory', Body: 'public class FRA_TestDataFactory {\n  public static List<String> getCanalesResolucionValidos(Integer n) { return null; }\n}' };
    expect(resolveDefinitionInApexClass(row, symbol.name, 'method', 1).definition).toMatchObject({ className: 'FRA_TestDataFactory', lineNumber: 2 });
  });

  it('resuelve métodos locales, this y constructores', () => {
    const source = 'public class MiClase {\n void validarDatos() {}\n void run() { validarDatos(); this.validarDatos(); new MiServicio(1); }\n}';
    for (const offset of [source.indexOf('validarDatos();'), source.indexOf('validarDatos();', source.indexOf('validarDatos();') + 1)]) {
      const pos = positionOf(source, 'validarDatos', offset);
      const symbol = findApexSymbolAt(source, pos.lineNumber, pos.column);
      expect(inferApexCallOwner(source, 'MiClase', symbol, pos.lineNumber, pos.column)).toBe('MiClase');
    }
    const ctor = positionOf(source, 'MiServicio');
    expect(findApexSymbolAt(source, ctor.lineNumber, ctor.column)).toMatchObject({ kind: 'constructor', name: 'MiServicio', argumentCount: 1 });
  });

  it('infiere tipos de variable local, parámetro y atributo', () => {
    const source = `public class MiClase {
      private MiServicio atributo;
      void porParametro(MiServicio servicio) { servicio.procesar(); }
      void porLocal() { MiServicio local = new MiServicio(); local.procesar(); atributo.procesar(); }
    }`;
    for (const index of [source.indexOf('procesar();'), source.indexOf('procesar();', source.indexOf('procesar();') + 1), source.lastIndexOf('procesar();')]) {
      const pos = positionOf(source, 'procesar', index);
      const symbol = findApexSymbolAt(source, pos.lineNumber, pos.column);
      expect(inferApexCallOwner(source, 'MiClase', symbol, pos.lineNumber, pos.column)).toBe('MiServicio');
    }
  });

  it('resuelve cadenas estáticas seguras y prioriza la ubicación de SymbolTable', () => {
    const source = 'void run() { MiServicio.getInstance().procesarCaso(); }';
    const pos = positionOf(source, 'procesarCaso');
    const symbol = findApexSymbolAt(source, pos.lineNumber, pos.column);
    expect(inferApexCallOwner(source, 'MiClase', symbol, pos.lineNumber, pos.column)).toBe('MiServicio');
    const row = {
      Id: '01p000000000001', Name: 'MiServicio', Body: 'public class MiServicio {\n void procesarCaso() {}\n}',
      SymbolTable: { methods: [{ name: 'procesarCaso', parameters: [], location: { line: 2, column: 7 } }] }
    };
    expect(resolveDefinitionInApexClass(row, 'procesarCaso', 'method', 0).definition).toMatchObject({ lineNumber: 2, column: 7 });
  });

  it('no navega llamadas dentro de comentarios/strings ni propiedades sin paréntesis', () => {
    const source = `// FRA_TestDataFactory.getCanalesResolucionValidos(n)
String text = 'FRA_TestDataFactory.getCanalesResolucionValidos(n)';
Object value = servicio.propiedad;`;
    for (const index of [source.indexOf('getCanales'), source.lastIndexOf('getCanales')]) {
      const pos = positionOf(source, 'getCanales', index);
      expect(findApexSymbolAt(source, pos.lineNumber, pos.column)).toBeNull();
    }
    const prop = positionOf(source, 'propiedad');
    expect(findApexSymbolAt(source, prop.lineNumber, prop.column)).toBeNull();
  });

  it('discrimina sobrecargas por número de argumentos y deja la ambigua sin resolver', () => {
    const row = { Id: '01p000000000001', Name: 'MiServicio', Body: `public class MiServicio {
      void procesar() {}
      void procesar(String value) {}
      void ambigua(String a) {}
      void ambigua(Integer a) {}
    }` };
    expect(resolveDefinitionInApexClass(row, 'procesar', 'method', 1).definition).toMatchObject({ lineNumber: 3 });
    expect(resolveDefinitionInApexClass(row, 'ambigua', 'method', 1)).toMatchObject({ ok: false, reason: 'AMBIGUOUS' });
    expect(findApexMethodDeclarations(row.Body, 'MiServicio')).toHaveLength(4);
  });
});
