import { useState } from "react";
import { useI18n } from "../i18n/i18n";
import { isCanonical, parseSeed, randomCode } from "../core/seedCode";
import { ArtistFaces } from "./ArtistFaces";

interface Props {
  onGenerate: (seed: string) => void;
  myKitCount: number;
}

export function SeedScreen({ onGenerate, myKitCount }: Props) {
  const { t } = useI18n();
  const [seedInput, setSeedInput] = useState("");

  // 정규 코드를 다 입력했을 때만 얼굴에 불을 켠다. 자유 텍스트도 해시되면 어떤 장르가 되지만,
  // 한 글자 칠 때마다 얼굴이 바뀌면 산만하다.
  const selectedStyle = isCanonical(seedInput) ? parseSeed(seedInput).family : null;

  const handleGenerate = () => {
    // 여기서 정규 코드로 바꿔 두면 그 뒤로는(URL, 공유 링크, 화면 표시) 전부 코드로만
    // 다닌다. 빈 칸으로 누르면 다섯 장르가 같은 확률로 나오는 무작위 코드를 만든다.
    onGenerate(parseSeed(seedInput.trim() || randomCode()).code);
  };

  return (
    <div className="device device--seed">
      <form
        className="seed-composer"
        onSubmit={(e) => {
          e.preventDefault();
          handleGenerate();
        }}
      >
        <input
          id="seed-input"
          className="device-input"
          value={seedInput}
          placeholder={t("seedScreen.inputPlaceholder")}
          aria-label={t("seedScreen.inputPlaceholder")}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setSeedInput(e.target.value)}
        />
        <button type="submit" className="device-button-primary">
          {t("seedScreen.generateButton")}
        </button>
      </form>
      {myKitCount > 0 && <span className="device-label">{t("seedScreen.myKit", { count: myKitCount })}</span>}

      <p className="legends-heading">{t("seedScreen.legendsHeading")}</p>
      <ArtistFaces selected={selectedStyle === "open" ? null : selectedStyle} onPick={setSeedInput} />
    </div>
  );
}
