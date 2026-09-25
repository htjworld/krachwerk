import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n/i18n";
import {
  STEP_COUNT,
  secondsPerStep,
  loopDurationSeconds,
  resolveLayers,
  overrideFromLayers,
  type Pattern,
  type PatternOverride,
} from "../core";
import type { Player } from "./usePlayer";

interface Props {
  pattern: Pattern;
  override: PatternOverride | null;
  onOverrideChange: (override: PatternOverride | null) => void;
  onShuffle: () => void;
  onShare: () => void;
  player: Player;
}

const STEP_LABEL_POSITIONS = [3, 7, 11, 15];

export function MatrixEditor({ pattern, override, onOverrideChange, onShuffle, onShare, player }: Props) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"drum" | "melo">("drum");
  const [playheadStep, setPlayheadStep] = useState<number | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!player.isPlaying) {
      setPlayheadStep(null);
      return;
    }
    const tick = () => {
      const elapsed = player.getElapsedSeconds();
      const loopDuration = loopDurationSeconds(pattern.tempo);
      const stepDuration = secondsPerStep(pattern.tempo);
      const position = ((elapsed % loopDuration) + loopDuration) % loopDuration;
      setPlayheadStep(Math.floor(position / stepDuration));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [player, pattern.tempo]);

  const resolved = resolveLayers(pattern, override);
  const cells = tab === "drum" ? resolved.kick : resolved.lead.map((c) => c.on);

  const toggleStep = (index: number) => {
    const kick = resolved.kick.slice();
    const leadOn = resolved.lead.map((c) => c.on);
    if (tab === "drum") kick[index] = !kick[index];
    else leadOn[index] = !leadOn[index];
    onOverrideChange(overrideFromLayers(kick, leadOn));
  };

  return (
    <div className="device">
      <div className="button-row" style={{ marginTop: 0 }}>
        <button
          type="button"
          className="device-button"
          aria-pressed={tab === "drum"}
          onClick={() => setTab("drum")}
        >
          {t("matrix.drumTab")}
        </button>
        <button
          type="button"
          className="device-button"
          aria-pressed={tab === "melo"}
          onClick={() => setTab("melo")}
        >
          {t("matrix.melodyTab")}
        </button>
      </div>

      <div className="matrix-grid">
        {cells.map((on, i) => (
          <button
            key={i}
            type="button"
            className={`matrix-cell${playheadStep === i ? " playhead" : ""}`}
            aria-pressed={on}
            aria-label={`step ${i + 1}`}
            onClick={() => toggleStep(i)}
          />
        ))}
      </div>
      <div className="matrix-step-labels">
        {Array.from({ length: STEP_COUNT }, (_, i) => (
          <span key={i} style={{ textAlign: "center" }}>
            {STEP_LABEL_POSITIONS.includes(i) ? i + 1 : ""}
          </span>
        ))}
      </div>

      <div className="button-row">
        <span className="device-text-button" aria-hidden style={{ cursor: "default" }}>
          {t("matrix.seedLabel")}: {pattern.seedInput}
        </span>
      </div>
      <div className="button-row">
        <button type="button" className="device-text-button" onClick={onShuffle}>
          {t("matrix.shuffle")}
        </button>
        <button type="button" className="device-text-button" onClick={onShare}>
          {t("matrix.share")}
        </button>
        <button type="button" className="device-text-button" onClick={() => onOverrideChange(null)}>
          {t("matrix.reset")}
        </button>
      </div>
    </div>
  );
}
