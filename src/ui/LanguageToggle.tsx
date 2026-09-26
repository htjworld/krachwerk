import { useI18n } from "../i18n/i18n";

export function LanguageToggle() {
  const { t, lang, setLang } = useI18n();
  return (
    <button
      type="button"
      className="device-text-button language-toggle"
      onClick={() => setLang(lang === "ko" ? "en" : "ko")}
    >
      {t("language.toggle")}
    </button>
  );
}
