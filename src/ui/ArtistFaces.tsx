import { randomStyleCode, type StyleLetter } from "../core/seedCode";
import { useI18n } from "../i18n/i18n";

interface Props {
  selected: StyleLetter | null;
  onPick: (seed: string) => void;
}

// §9.1 표시 순서: Kraftwerk, Delroy Edwards, Fred again.., Peggy Gou (STYLE_LETTERS의
// 게놈/코드 순서 k·d·p·f와는 다르다 — 화면 순서만 요구 4를 따른다).
const DISPLAY_ORDER: readonly StyleLetter[] = ["k", "d", "f", "p"];

// d/p 앨범커버 스타일은 아직 blueprint가 없어서(generatePattern이 던진다) 얼굴은 보여주되
// 눌러도 반응하지 않는다 — 그 스타일 구현이 끝나면 이 배열에서 뺀다.
const IMPLEMENTED: readonly StyleLetter[] = ["k"];

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
            onClick={() => onPick(randomStyleCode(style))}
          >
            <img className="artist-face-img" src={faceUrl(style)} alt="" />
            <span className="artist-face-label">{t(`artistFaces.label.${style}`)}</span>
          </button>
        );
      })}
    </div>
  );
}
