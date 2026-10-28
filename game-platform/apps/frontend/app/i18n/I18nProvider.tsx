'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

// The four site languages. `ht` is Haitian Creole (Kreyòl ayisyen).
export const LOCALES = ['en', 'fr', 'ht', 'es'] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  fr: 'Français',
  ht: 'Kreyòl',
  es: 'Español',
};

// Short codes for compact switchers ("KR" reads better than ISO "HT" for Kreyòl speakers)
export const LOCALE_SHORT: Record<Locale, string> = { en: 'EN', fr: 'FR', ht: 'KR', es: 'ES' };

// Intl has no full Haitian Creole data; French formats dates and numbers the way Haiti does
const INTL_LOCALE: Record<Locale, string> = { en: 'en-US', fr: 'fr-FR', ht: 'fr-HT', es: 'es-ES' };

const STORAGE_KEY = 'joda-locale';

function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && (LOCALES as readonly string[]).includes(saved)) return saved as Locale;
  } catch {
    // Storage blocked: fall through to the browser language
  }
  for (const lang of navigator.languages ?? [navigator.language]) {
    const base = lang.toLowerCase().split('-')[0];
    if (base === 'ht') return 'ht';
    if (base === 'fr') return 'fr';
    if (base === 'es') return 'es';
    if (base === 'en') return 'en';
  }
  return 'en';
}

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  intlLocale: string;
};

const I18nContext = createContext<I18nContextValue>({ locale: 'en', setLocale: () => {}, intlLocale: 'en-US' });

export function I18nProvider({ children }: { children: ReactNode }) {
  // Render English on the server and first paint, then switch to the visitor's language after mount
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    setLocaleState(detectLocale());
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The choice still applies for this visit
    }
  }, []);

  const value = useMemo(() => ({ locale, setLocale, intlLocale: INTL_LOCALE[locale] }), [locale, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useLocale() {
  return useContext(I18nContext);
}

export type Messages = Record<string, string>;
export type Catalog<M extends Messages> = { en: M } & Record<Exclude<Locale, 'en'>, { [K in keyof M]: string }>;

/**
 * Translator for one message catalog. Each component area keeps its own catalog next to it
 * (`{ en: {...}, fr: {...}, ht: {...}, es: {...} }`), so the English object defines the keys and
 * TypeScript makes every other language provide all of them.
 * Placeholders use braces: t('greeting', { name }) with "Welcome back, {name}".
 */
export function useT<M extends Messages>(catalog: Catalog<M>) {
  const { locale } = useLocale();
  return useCallback(
    (key: keyof M & string, vars?: Record<string, string | number>) => {
      const template = (catalog[locale] as Messages)[key] ?? catalog.en[key] ?? key;
      if (!vars) return template;
      return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
    },
    [catalog, locale],
  );
}

/** Builds a catalog with full type checking against the English keys. */
export function defineMessages<M extends Messages>(catalog: Catalog<M>): Catalog<M> {
  return catalog;
}
