import { useState } from "react";
import { useI18n } from "../i18n/i18n";
import { randomSeedCandidate } from "../core";
import { parseSeed } from "../core/seedCode";
import { ArtistFaces } from "./ArtistFaces";

interface Props {
  onGenerate: (seed: string) => void;
  myKitCount: number;
}

export function SeedScreen({ onGenerate, myKitCount }: Props) {
  const { t } = useI18n();
  const [seedInput, setSeedInput] = useState("");

  const selectedStyle = parseSeed(seedInput).family;

  const handleGenerate = () => {
    // 여기서 정규 코드로 바꿔 두면 그 뒤로는(URL, 공유 링크, 화면 표시) 전부 코드로만
    // 다닌다. generatePattern도 어차피 내부에서 canonicalize하지만, 미리 해 두면 주소창에
    // 뜨는 값과 pattern.seedInput이 처음부터 같다 (§11 단계 4).
    // parseSeed를 거쳐야 한다 — canonicalize를 바로 쓰면 스타일 코드(얼굴 버튼)를 정규
    // 코드가 아니라고 보고 해시해서 완전히 다른 곡으로 만들어버린다(§5.1).
    // 빈 칸으로 누르면 무작위 시드로 만든다.
    onGenerate(parseSeed(seedInput.trim() || randomSeedCandidate()).code);
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
