import { useState } from "react";
import { useI18n } from "../i18n/i18n";
import { canonicalize, findSeedForTraits, randomSeedCandidate, NO_TRAITS, type TraitSelection } from "../core";
import { parseSeed } from "../core/seedCode";
import { ArtistFaces } from "./ArtistFaces";
import { TraitToggles } from "./TraitToggles";

interface Props {
  onGenerate: (seed: string) => void;
  myKitCount: number;
}

export function SeedScreen({ onGenerate, myKitCount }: Props) {
  const { t } = useI18n();
  const [seedInput, setSeedInput] = useState("");
  const [traits, setTraits] = useState<TraitSelection>(NO_TRAITS);

  const hasTraits = traits.bassEmphasis || traits.unusualTimbre || traits.melodyStyle !== null;
  const selectedStyle = parseSeed(seedInput).family;

  const handleRandom = () => setSeedInput(randomSeedCandidate());

  const handlePickFace = (seed: string) => {
    setSeedInput(seed);
    setTraits(NO_TRAITS);
  };

  const handleGenerate = () => {
    // 여기서 정규 코드로 바꿔 두면 그 뒤로는(URL, 공유 링크, 화면 표시) 전부 코드로만
    // 다닌다. generatePattern도 어차피 내부에서 canonicalize하지만, 미리 해 두면 주소창에
    // 뜨는 값과 pattern.seedInput이 처음부터 같다 (§11 단계 4).
    // parseSeed를 거쳐야 한다 — canonicalize를 바로 쓰면 스타일 코드(얼굴 버튼)를 정규
    // 코드가 아니라고 보고 해시해서 완전히 다른 곡으로 만들어버린다(§5.1).
    if (hasTraits) {
      onGenerate(canonicalize(findSeedForTraits(traits)));
      return;
    }
    onGenerate(parseSeed(seedInput.trim() || randomSeedCandidate()).code);
  };

  return (
    <div className="device device--seed">
      <ArtistFaces selected={selectedStyle === "open" ? null : selectedStyle} onPick={handlePickFace} />
      <div className="seed-composer">
        <input
          id="seed-input"
          className="device-input"
          value={seedInput}
          placeholder={t("seedScreen.inputPlaceholder")}
          onChange={(e) => setSeedInput(e.target.value)}
        />
        <button type="button" className="device-button-primary" onClick={handleGenerate}>
          {t("seedScreen.generateButton")}
        </button>
      </div>

      <button type="button" className="device-text-button seed-random-button" onClick={handleRandom}>
        {t("seedScreen.randomButton")}
      </button>
      {myKitCount > 0 && <span className="device-label">{t("seedScreen.myKit", { count: myKitCount })}</span>}

      <span className="device-label">{t("seedScreen.traitsHeading")}</span>
      <TraitToggles traits={traits} onChange={setTraits} />
    </div>
  );
}
