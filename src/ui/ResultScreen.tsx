import { useState } from "react";
import { useI18n } from "../i18n/i18n";
import {
  renderLoopBuffer,
  encodeWav,
  loopDurationSeconds,
  effectiveTempo,
  type Pattern,
  type PatternOverride,
  type CrosshairControl,
} from "../core";
import { usePlayer } from "./usePlayer";
import { MatrixEditor } from "./MatrixEditor";
import { CrosshairPanel } from "./CrosshairPanel";

interface Props {
  pattern: Pattern;
  override: PatternOverride | null;
  onOverrideChange: (override: PatternOverride | null) => void;
  crosshair: CrosshairControl | null;
  onCrosshairChange: (control: CrosshairControl | null) => void;
  onShuffle: () => void;
  onShare: () => void;
  onBackToSeed: () => void;
}

const TARGET_DOWNLOAD_SECONDS = 60;

export function ResultScreen({
  pattern,
  override,
  onOverrideChange,
  crosshair,
  onCrosshairChange,
  onShuffle,
  onShare,
  onBackToSeed,
}: Props) {
  const { t, lang, setLang } = useI18n();
  const player = usePlayer(pattern, override, crosshair);
  const [showMatrix, setShowMatrix] = useState(false);
  const [showCrosshair, setShowCrosshair] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const tempo = effectiveTempo(pattern, crosshair);

  const handleDownload = async () => {
    const buffer = await renderLoopBuffer(pattern, override, crosshair);
    const repeats = Math.max(1, Math.round(TARGET_DOWNLOAD_SECONDS / loopDurationSeconds(tempo)));
    const blob = encodeWav(buffer, repeats);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `krachwerk-${pattern.seedInput}.wav`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleShare = () => {
    onShare();
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  return (
    <>
      <div className="device" style={{ position: "relative" }}>
        <button
          type="button"
          className="device-text-button language-toggle"
          onClick={() => setLang(lang === "ko" ? "en" : "ko")}
        >
          {t("language.toggle")}
        </button>
        <h1 className="device-heading">{t("resultScreen.generatedMessage")}</h1>

        <p className="track-summary">
          {t("resultScreen.summaryTempo", { tempo })}
          <br />
          {t("resultScreen.summaryScale", { scale: pattern.scale.name })}
          <br />
          {t("resultScreen.summaryVoices", { bass: pattern.bassVoice, lead: pattern.leadVoice })}
        </p>

        <div className="button-row" style={{ marginTop: 0 }}>
          <button type="button" className="device-button-primary" onClick={player.toggle} disabled={player.isRendering}>
            {player.isPlaying ? t("resultScreen.pause") : t("resultScreen.play")}
          </button>
          <button type="button" className="device-button" onClick={handleDownload}>
            {t("resultScreen.download")}
          </button>
          <button type="button" className="device-button" onClick={handleShare}>
            {t("resultScreen.copyLink")}
          </button>
        </div>
        {linkCopied && <p className="device-subheading">{t("resultScreen.linkCopied")}</p>}

        <div className="button-row">
          <button type="button" className="device-text-button" onClick={() => setShowMatrix((v) => !v)}>
            {t("resultScreen.editPattern")}
          </button>
          <button type="button" className="device-text-button" onClick={() => setShowCrosshair((v) => !v)}>
            {t("resultScreen.liveControl")}
          </button>
          <button type="button" className="device-text-button" onClick={onBackToSeed}>
            {t("resultScreen.newSeed")}
          </button>
        </div>
      </div>

      {showMatrix && (
        <MatrixEditor
          pattern={pattern}
          override={override}
          onOverrideChange={onOverrideChange}
          onShuffle={onShuffle}
          onShare={handleShare}
          player={player}
          tempo={tempo}
        />
      )}

      {showCrosshair && <CrosshairPanel pattern={pattern} control={crosshair} onChange={onCrosshairChange} />}
    </>
  );
}
