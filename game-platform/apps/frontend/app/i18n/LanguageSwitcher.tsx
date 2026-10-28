'use client';

import { Languages } from 'lucide-react';
import { LOCALES, LOCALE_NAMES, LOCALE_SHORT, useLocale, type Locale } from './I18nProvider';

// A native select keeps this accessible and comfortable on phones; the visible label stays short
export default function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { locale, setLocale } = useLocale();
  return (
    <label className={`relative inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-chalk hover:bg-white/5 hover:text-white ${className}`}>
      <Languages className="h-4 w-4" aria-hidden="true" />
      <span aria-hidden="true">{LOCALE_SHORT[locale]}</span>
      <span className="sr-only">Language / Langue / Lang / Idioma</span>
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} lang={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
