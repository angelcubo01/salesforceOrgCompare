import { describe, it, expect, beforeEach } from 'vitest';
import { t, setLang, getCurrentLang, getAvailableLanguages } from '../shared/i18n.js';

describe('i18n', () => {
  beforeEach(() => {
    setLang('en');
  });

  it('traduce claves en inglés por defecto', () => {
    expect(t('popup.compare')).toBe('Open');
    expect(getCurrentLang()).toBe('en');
  });

  it('cambia a español con setLang', () => {
    setLang('es');
    expect(t('popup.compare')).toBe('Abrir');
    expect(getCurrentLang()).toBe('es');
  });

  it('ignora idioma no soportado', () => {
    setLang('en');
    setLang('fr');
    expect(getCurrentLang()).toBe('en');
  });

  it('sustituye parámetros {name}', () => {
    setLang('en');
    const text = t('toast.copied', { name: 'MyClass' });
    expect(text).toContain('MyClass');
  });

  it('devuelve la clave si no existe traducción', () => {
    expect(t('nonexistent.key.xyz')).toBe('nonexistent.key.xyz');
  });

  it('lista idiomas disponibles', () => {
    const langs = getAvailableLanguages();
    expect(langs.map((l) => l.code)).toEqual(['es', 'en']);
  });

  it('traduce el grupo de navegación Event Monitor por idioma', () => {
    setLang('en');
    expect(t('code.toolGroup.streaming')).toBe('Events');
    setLang('es');
    expect(t('code.toolGroup.streaming')).toBe('Eventos');
  });
  it('translates Environment Status health in Spanish and English', () => {
    setLang('es');
    expect(t('envStatus.health.operational')).toBe('Operativo');
    setLang('en');
    expect(t('envStatus.health.operational')).toBe('Operational');
    expect(t('envStatus.sectionActiveIncidents')).toBe('Active incidents');
    expect(t('envStatus.openTrust')).toBe('Open Trust');
    expect(t('envStatus.rootCause')).toBe('Root cause');
    expect(t('envStatus.timelineHint')).toBe('Hover or select a bar to view its details.');
    expect(t('envStatus.noMetrics')).toBe('No metrics are available for this instance.');
  });
});
