import { randomCode, type StyleLetter } from "../core/seedCode";
import { useI18n } from "../i18n/i18n";

interface Props {
  selected: StyleLetter | null;
  onPick: (seed: string) => void;
}

// §9.1 표시 순서: Kraftwerk, Delroy Edwards, Fred again.., Peggy Gou (STYLE_LETTERS의
// 게놈/코드 순서 k·d·p·f와는 다르다 — 화면 순서만 요구 4를 따른다).
const DISPLAY_ORDER: readonly StyleLetter[] = ["k", "d", "f", "p"];

// 얼굴 4개 전부 구현됐다(§11 단계 3·8·9·10).
const IMPLEMENTED: readonly StyleLetter[] = ["k", "d", "p", "f"];

function faceUrl(style: StyleLetter): string {
  const base = import.meta.env?.BASE_URL ?? "/";
  return `${base}faces/${style}.${style === "d" ? "jpeg" : "webp"}`;
}

export function ArtistFaces({ selected, onPick }: Props) {
  const { t } = useI18n();

  return (
    <div className="artist-faces">
      {DISPLAY_ORDER.map((style) => {
        const enabled = IMPLEMENTED.includes(style);
        return (
          <button
            key={style}
            type="button"
            className="artist-face"
            aria-pressed={selected === style}
            aria-label={t(`artistFaces.aria.${style}`)}
            disabled={!enabled}
            onClick={() => onPick(randomCode(style))}
          >
            <img className="artist-face-img" src={faceUrl(style)} alt="" />
          </button>
        );
      })}
    </div>
  );
}
