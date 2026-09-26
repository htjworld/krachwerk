import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import ko from "./ko.json";
import en from "./en.json";

export type Lang = "ko" | "en";

const DICTS: Record<Lang, Record<string, unknown>> = { ko, en };

function lookup(dict: Record<string, unknown>, path: string): string | undefined {
  const value = path.split(".").reduce<unknown>((node, key) => {
    if (node && typeof node === "object") return (node as Record<string, unknown>)[key];
    return undefined;
  }, dict);
  return typeof value === "string" ? value : undefined;
}

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (path: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("en");

  const value = useMemo<I18nContextValue>(() => {
    const t = (path: string, vars?: Record<string, string | number>) => {
      const text = lookup(DICTS[lang], path) ?? lookup(DICTS.ko, path) ?? path;
      if (!vars) return text;
      return Object.entries(vars).reduce(
        (result, [key, value]) => result.replace(`{${key}}`, String(value)),
        text
      );
    };
    return { lang, setLang, t };
  }, [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
