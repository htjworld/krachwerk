import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n/i18n";
import {
  renderArrangement,
  encodeWav,
  effectiveTempo,
  arrangementFor,
  sectionAtSecond,
  type Pattern,
  type PatternOverride,
  type CrosshairControl,
  type UserSlot,
} from "../core";
import type { UserKitFile } from "../core/userKitStore";
import { usePlayer, type Player } from "./usePlayer";
import { MatrixEditor } from "./MatrixEditor";
import { CrosshairPanel } from "./CrosshairPanel";
import { UserKitPanel } from "./UserKitPanel";

interface Props {
  pattern: Pattern;
  override: PatternOverride | null;
  onOverrideChange: (override: PatternOverride | null) => void;
  crosshair: CrosshairControl | null;
  onCrosshairChange: (control: CrosshairControl | null) => void;
  onShuffle: () => void;
  onShare: () => void;
  onBackToSeed: () => void;
  userKitFiles: UserKitFile[];
  userKit: Partial<Record<UserSlot, ArrayBuffer[]>> | null;
  onAddUserKitFiles: (files: UserKitFile[]) => void;
  onRemoveUserKitFile: (id: string) => void;
  onUpdateUserKitSlot: (id: string, slot: UserSlot) => void;
  onClearUserKit: () => void;
  receivedLocalKit: boolean;
}

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// 지금 어느 섹션을 지나고 있는지 보여주고, 끌어서 그 자리로 건너뛴다. 3분 내내 구성이
// 바뀌는 게 이 트랙의 요점이라 섹션 경계도 바 위에 같이 찍는다.
function TrackProgress({ player, pattern, tempo }: { player: Player; pattern: Pattern; tempo: number }) {
  const { t } = useI18n();
  const [position, setPosition] = useState(0);
  // player는 렌더마다 새 객체라 이펙트 의존성에 넣으면 rAF가 매 프레임 재등록된다.
  const playerRef = useRef(player);
  playerRef.current = player;

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const next = playerRef.current.getPosition();
      setPosition((prev) => (Math.abs(next - prev) < 0.02 ? prev : next));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const arrangement = arrangementFor(pattern, tempo);
  const total = arrangement.totalSeconds;
  const clamped = Math.min(position, total);
  const ratio = total > 0 ? clamped / total : 0;

  // 아직 렌더가 안 끝났으면 지금까지 나온 앞부분만큼만 재생/이동할 수 있다(비디오 버퍼링 바와 같은 개념).
  const bufferedRatio = total > 0 ? Math.min(1, player.duration / total) : 0;

  return (
    <div className="track-progress">
      <div className="track-progress-bar">
        <div className="track-progress-buffered" style={{ width: `${bufferedRatio * 100}%` }} />
        <div className="track-progress-fill" style={{ width: `${ratio * 100}%` }} />
        {arrangement.sections.slice(1).map((section) => (
          <div
            key={section.id + section.startBar}
            className="track-progress-mark"
            style={{ left: `${((section.startBar * arrangement.barSeconds) / total) * 100}%` }}
          />
        ))}
        <input
          type="range"
          className="track-progress-input"
          min={0}
          max={Math.max(total, 1)}
          step={0.25}
          value={clamped}
          aria-label={t("resultScreen.seek")}
          onChange={(event) => {
            const seconds = Number(event.target.value);
            setPosition(seconds);
            player.seek(seconds);
          }}
        />
      </div>
      <div className="track-progress-labels">
        <span>{sectionAtSecond(arrangement, clamped).id.toUpperCase()}</span>
        <span>
          {formatTime(clamped)} / {formatTime(total)}
        </span>
      </div>
    </div>
  );
}

export function ResultScreen({
  pattern,
  override,
  onOverrideChange,
  crosshair,
  onCrosshairChange,
  onShuffle,
  onShare,
  onBackToSeed,
  userKitFiles,
  userKit,
  onAddUserKitFiles,
  onRemoveUserKitFile,
  onUpdateUserKitSlot,
  onClearUserKit,
  receivedLocalKit,
}: Props) {
  const { t } = useI18n();
  const [showMatrix, setShowMatrix] = useState(false);
  const [showCrosshair, setShowCrosshair] = useState(false);
  const [showUserKit, setShowUserKit] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // 편집 패널이 열려 있는 동안은 한 마디 미리듣기로 갈아탄다 (편집 즉시 반영).
  const mode = showMatrix || showCrosshair || showUserKit ? "loop" : "arrangement";
  const player = usePlayer(pattern, override, crosshair, mode, userKit);
  const tempo = effectiveTempo(pattern, crosshair);
  const arrangement = arrangementFor(pattern, tempo);

  const handleDownload = async () => {
    setIsExporting(true);
    try {
      const buffer = await renderArrangement(pattern, { override, liveControls: crosshair, userKit });
      const url = URL.createObjectURL(encodeWav(buffer));
      const a = document.createElement("a");
      a.href = url;
      a.download = `krachwerk-${pattern.seedInput}.wav`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  const handleShare = () => {
    onShare();
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  // 렌더가 끝나기 전에도 지금까지 나온 앞부분(player.duration > 0)만으로 바로 재생할 수 있다.
  const playable = player.duration > 0;
  const playLabel = player.isPlaying
    ? t("resultScreen.pause")
    : playable
      ? t("resultScreen.play")
      : `${t("resultScreen.rendering")} ${Math.round(player.progress * 100)}%`;

  return (
    <>
      <div className="device">
        <h1 className="device-heading">{t("resultScreen.generatedMessage")}</h1>

        <p className="track-summary">
          {t("resultScreen.summaryTempo", { tempo })}
          <br />
          {t("resultScreen.summaryScale", { scale: pattern.scale.name })}
          <br />
          {t("resultScreen.summaryVoices", { bass: pattern.bassVoice, lead: pattern.leadVoice })}
          <br />
          {t("resultScreen.summaryLength", {
            length: formatTime(arrangement.totalSeconds),
            sections: arrangement.sections.length,
          })}
          <br />
          {t("resultScreen.summaryStructure", {
            structure: arrangement.sections.map((s) => s.id.toUpperCase()).join(" / "),
          })}
        </p>

        {mode === "arrangement" && <TrackProgress player={player} pattern={pattern} tempo={tempo} />}

        {player.error && <p className="device-error">{t("resultScreen.renderFailed", { reason: player.error })}</p>}

        <div className="button-grid button-grid-3" style={{ marginTop: 0 }}>
          <button type="button" className="device-button-primary" onClick={player.toggle} disabled={!playable}>
            {playLabel}
          </button>
          <button type="button" className="device-button" onClick={handleDownload} disabled={isExporting}>
            {isExporting ? t("resultScreen.exporting") : t("resultScreen.download")}
          </button>
          <button type="button" className="device-button" onClick={handleShare}>
            {t("resultScreen.copyLink")}
          </button>
        </div>
        {linkCopied && <p className="device-subheading">{t("resultScreen.linkCopied")}</p>}
        {playable && player.isRendering && (
          <p className="device-subheading">
            {t("resultScreen.stillRendering", { pct: Math.round(player.progress * 100) })}
          </p>
        )}

        <div className="button-grid button-grid-2">
          <button type="button" className="device-text-button" onClick={() => setShowMatrix((v) => !v)}>
            {t("resultScreen.editPattern")}
          </button>
          <button type="button" className="device-text-button" onClick={() => setShowCrosshair((v) => !v)}>
            {t("resultScreen.liveControl")}
          </button>
          <button type="button" className="device-text-button" onClick={() => setShowUserKit((v) => !v)}>
            {t("resultScreen.userKit")}
          </button>
          <button type="button" className="device-text-button" onClick={onBackToSeed}>
            {t("resultScreen.newSeed")}
          </button>
        </div>
        {mode === "loop" && <p className="device-subheading">{t("resultScreen.previewMode")}</p>}
        {receivedLocalKit && <p className="device-subheading">{t("resultScreen.receivedLocalKit")}</p>}
      </div>

      {showUserKit && (
        <UserKitPanel
          files={userKitFiles}
          onAddFiles={onAddUserKitFiles}
          onRemoveFile={onRemoveUserKitFile}
          onUpdateSlot={onUpdateUserKitSlot}
          onClearAll={onClearUserKit}
        />
      )}

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
