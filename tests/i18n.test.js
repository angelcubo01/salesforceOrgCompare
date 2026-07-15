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
});
