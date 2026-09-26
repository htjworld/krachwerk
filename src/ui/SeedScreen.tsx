import { useState } from "react";
import { useI18n } from "../i18n/i18n";
import { canonicalize, findSeedForTraits, randomSeedCandidate, NO_TRAITS, type TraitSelection } from "../core";
import { TraitToggles } from "./TraitToggles";

interface Props {
  onGenerate: (seed: string) => void;
}

export function SeedScreen({ onGenerate }: Props) {
  const { t, lang, setLang } = useI18n();
  const [seedInput, setSeedInput] = useState("");
  const [traits, setTraits] = useState<TraitSelection>(NO_TRAITS);

  const hasTraits = traits.bassEmphasis || traits.unusualTimbre || traits.melodyStyle !== null;

  const handleRandom = () => setSeedInput(randomSeedCandidate());

  const handleGenerate = () => {
    // 여기서 정규 코드로 바꿔 두면 그 뒤로는(URL, 공유 링크, 화면 표시) 전부 코드로만
    // 다닌다. generatePattern도 어차피 내부에서 canonicalize하지만, 미리 해 두면 주소창에
    // 뜨는 값과 pattern.seedInput이 처음부터 같다 (§11 단계 4).
    if (hasTraits) {
      onGenerate(canonicalize(findSeedForTraits(traits)));
      return;
    }
    onGenerate(canonicalize(seedInput.trim() || randomSeedCandidate()));
  };

  return (
    <div className="device" style={{ position: "relative" }}>
      <button
        type="button"
        className="device-text-button language-toggle"
        onClick={() => setLang(lang === "ko" ? "en" : "ko")}
      >
        {t("language.toggle")}
      </button>
      <h1 className="device-heading">{t("seedScreen.heading")}</h1>
      <p className="device-subheading">{t("seedScreen.subheading")}</p>

      <label className="device-label" htmlFor="seed-input">
        {t("seedScreen.inputLabel")}
      </label>
      <div className="button-row" style={{ marginTop: 0, marginBottom: 16 }}>
        <input
          id="seed-input"
          className="device-input"
          value={seedInput}
          placeholder={t("seedScreen.inputPlaceholder")}
          onChange={(e) => setSeedInput(e.target.value)}
        />
        <button type="button" className="device-button" onClick={handleRandom}>
          {t("seedScreen.randomButton")}
        </button>
      </div>

      <span className="device-label">{t("seedScreen.traitsHeading")}</span>
      <TraitToggles traits={traits} onChange={setTraits} />

      <button type="button" className="device-button-primary" onClick={handleGenerate}>
        {t("seedScreen.generateButton")}
      </button>
    </div>
  );
}
