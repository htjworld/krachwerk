import { useI18n } from "../i18n/i18n";

// figlet -f "ANSI Shadow" KRACHWERK
const KRACHWERK_ART = [
  "██╗  ██╗██████╗  █████╗  ██████╗██╗  ██╗██╗    ██╗███████╗██████╗ ██╗  ██╗",
  "██║ ██╔╝██╔══██╗██╔══██╗██╔════╝██║  ██║██║    ██║██╔════╝██╔══██╗██║ ██╔╝",
  "█████╔╝ ██████╔╝███████║██║     ███████║██║ █╗ ██║█████╗  ██████╔╝█████╔╝ ",
  "██╔═██╗ ██╔══██╗██╔══██║██║     ██╔══██║██║███╗██║██╔══╝  ██╔══██╗██╔═██╗ ",
  "██║  ██╗██║  ██║██║  ██║╚██████╗██║  ██║╚███╔███╔╝███████╗██║  ██║██║  ██╗",
  "╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝ ╚══╝╚══╝ ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝",
];

const BOOT_MS = 700;

export function Logo() {
  const { lang, t } = useI18n();
  // figlet 폰트는 한글을 지원하지 않아서, 한국어는 블록 아트 대신 같은 톤의
  // 큰 모노스페이스 워드마크로 보여준다.
  const lines = lang === "en" ? KRACHWERK_ART : [t("brand.wordmark")];
  const stagger = BOOT_MS / lines.length;

  return (
    <div className="logo-wrap">
      <pre className="logo-ascii" data-lang={lang} aria-hidden="true">
        {lines.map((line, i) => (
          <span
            key={i}
            className="logo-line"
            style={{ animationDelay: `${i * stagger}ms`, animationDuration: `${stagger}ms` }}
          >
            {line}
          </span>
        ))}
      </pre>
      <span className="sr-only">{t("brand.wordmark")}</span>
    </div>
  );
}
