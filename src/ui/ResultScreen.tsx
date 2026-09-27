import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n/i18n";
import {
  renderArrangement,
  encodeWav,
  effectiveTempo,
  arrangementFor,
  sectionAtSecond,
  editorLayers,
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

type Panel = "matrix" | "live" | "kit";

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// resultScreen.summaryStyle(§13.8, 신규): open은 blueprintId를 그대로 대문자로 풀어 보여주고
// (classicBuild → CLASSIC BUILD), 얼굴 스타일 코드는 ArtistFaces와 같은 이름을 쓴다.
function styleLabel(pattern: Pattern, t: (path: string) => string): string {
  if (pattern.style === "open") return pattern.blueprintId.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toUpperCase();
  return t(`artistFaces.label.${pattern.style}`);
}

// 지금 어느 섹션을 지나고 있는지 보여주고, 끌어서 그 자리로 건너뛴다. 3분 내내 구성이
// 바뀌는 게 이 트랙의 요점이라 섹션 경계도 바 위에 같이 찍는다.
function TrackProgress({ player, pattern, tempo }: { player: Player; pattern: Pattern; tempo: number }) {
  const { t } = useI18n();
  const [position, setPosition] = useState(0);
  // 끄는 중인 위치. 끄는 동안은 소리를 멈추고(player.hold) 표시만 따라가다가, 손을 떼는 순간
  // 그 자리로 한 번만 seek한다. 키보드 조작은 끌기가 아니라서 바로 seek한다.
  const [dragValue, setDragValue] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);
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
  const clamped = Math.min(dragValue ?? position, total);
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
          onPointerDown={(event) => {
            player.hold();
            dragRef.current = Number(event.currentTarget.value);
            setDragValue(dragRef.current);
            // 바 밖에서 손을 떼도 끝나도록 window에서 받는다.
            const release = () => {
              window.removeEventListener("pointerup", release);
              window.removeEventListener("pointercancel", release);
              const seconds = dragRef.current;
              dragRef.current = null;
              setDragValue(null);
              if (seconds === null) return;
              setPosition(seconds);
              player.seek(seconds);
            };
            window.addEventListener("pointerup", release);
            window.addEventListener("pointercancel", release);
          }}
          onChange={(event) => {
            const seconds = Number(event.target.value);
            if (dragRef.current !== null) {
              dragRef.current = seconds;
              setDragValue(seconds);
              return;
            }
            setPosition(seconds);
            player.seek(seconds);
          }}
        />
      </div>
      <div className="track-progress-labels">
        <span>{sectionAtSecond(arrangement, clamped).id.toUpperCase()}</span>
        {/* 렌더 진행률은 바 바로 아래 고정된 자리에만 띄운다. 끝나면 비워도 줄 높이가 그대로라 아래가 안 밀린다. */}
        <span className="track-progress-status">
          {player.isRendering && t("resultScreen.building", { pct: Math.round(player.progress * 100) })}
        </span>
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
  // 편집 패널은 한 번에 하나만 연다. 같은 타일을 다시 누르면 닫힌다.
  const [panel, setPanel] = useState<Panel | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // 편집 패널이 열려 있는 동안은 한 마디 미리듣기로 갈아탄다 (편집 즉시 반영).
  const mode = panel ? "loop" : "arrangement";
  const player = usePlayer(pattern, override, crosshair, mode, userKit);
  const tempo = effectiveTempo(pattern, crosshair);
  const arrangement = arrangementFor(pattern, tempo);
  const kick = editorLayers(pattern, override).kick.slice(0, pattern.stepsPerBar);

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

  // 복사 확인은 버튼 라벨 자리에서 잠깐 보여준다. 아래에 문구를 따로 띄우면 레이아웃이 밀린다.
  const handleShare = () => {
    onShare();
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  // 렌더가 끝나기 전에도 지금까지 나온 앞부분(player.duration > 0)만으로 바로 재생할 수 있다.
  const playable = player.duration > 0;
  const togglePanel = (next: Panel) => setPanel((current) => (current === next ? null : next));

  // 두 칸씩 짝지어 그리드에 놓는다(스타일/템포, 스케일/길이, 베이스/리드). 구성만 한 줄 전체.
  const specs: [string, string][] = [
    ["style", styleLabel(pattern, t)],
    ["tempo", `${Math.round(tempo)} BPM`],
    ["scale", pattern.scale.name],
    [
      "length",
      t("resultScreen.lengthValue", {
        length: formatTime(arrangement.totalSeconds),
        sections: arrangement.sections.length,
      }),
    ],
    ["bass", pattern.bassVoice],
    ["lead", pattern.leadVoice],
    ["structure", arrangement.sections.map((s) => s.id.toUpperCase()).join("\u00a0/ ")],
  ];

  return (
    <>
      <div className="device">
        <header className="result-head">
          <h1 className="result-seed">
            <span className="spec-key">SEED</span>
            {pattern.seedInput}
            {/* 편집값은 시드가 아니라 주소 뒤 파라미터에 담긴다. 시드만으로는 지금 소리가 안 나온다는 표시. */}
            {(override || crosshair) && <span className="result-edited">{t("resultScreen.edited")}</span>}
          </h1>
          <button type="button" className="device-text-button" onClick={onBackToSeed}>
            {t("resultScreen.newSeed")}
          </button>
        </header>

        <dl className="spec-sheet">
          {specs.map(([key, value]) => (
            <div key={key} className={`spec-row spec-row--${key}`}>
              <dt className="spec-key">{t(`resultScreen.spec.${key}`)}</dt>
              <dd className="spec-value">{value}</dd>
            </div>
          ))}
        </dl>

        {mode === "arrangement" ? (
          <TrackProgress player={player} pattern={pattern} tempo={tempo} />
        ) : (
          <p className="loop-note">{t("resultScreen.previewMode")}</p>
        )}

        {player.error && <p className="device-error">{t("resultScreen.renderFailed", { reason: player.error })}</p>}

        <div className="button-grid button-grid-3 transport">
          <button type="button" className="device-button-primary" onClick={player.toggle} disabled={!playable}>
            {player.isPlaying ? t("resultScreen.pause") : t("resultScreen.play")}
          </button>
          <button type="button" className="device-button" onClick={handleDownload} disabled={isExporting}>
            {isExporting ? t("resultScreen.exporting") : t("resultScreen.download")}
          </button>
          <button type="button" className="device-button" onClick={handleShare}>
            {linkCopied ? t("resultScreen.linkCopied") : t("resultScreen.copyLink")}
          </button>
        </div>

        <div className="tool-rack">
          <button
            type="button"
            className="tool-tile"
            aria-pressed={panel === "matrix"}
            onClick={() => togglePanel("matrix")}
          >
            <span className="tool-tile-label">{t("resultScreen.tool.pattern")}</span>
            <span className="tool-tile-steps" aria-hidden="true">
              {kick.map((on, i) => (
                <i key={i} data-on={on} />
              ))}
            </span>
          </button>
          <button
            type="button"
            className="tool-tile"
            aria-pressed={panel === "live"}
            onClick={() => togglePanel("live")}
          >
            <span className="tool-tile-label">{t("resultScreen.tool.live")}</span>
            <span className="tool-tile-value">{Math.round(tempo)} BPM</span>
          </button>
          <button
            type="button"
            className="tool-tile"
            aria-pressed={panel === "kit"}
            onClick={() => togglePanel("kit")}
          >
            <span className="tool-tile-label">{t("resultScreen.tool.sounds")}</span>
            <span className="tool-tile-value">
              {userKitFiles.length > 0
                ? t("resultScreen.tool.soundsCount", { count: userKitFiles.length })
                : t("resultScreen.tool.soundsDefault")}
            </span>
          </button>
        </div>
        {receivedLocalKit && <p className="device-subheading">{t("resultScreen.receivedLocalKit")}</p>}
      </div>

      {panel === "kit" && (
        <UserKitPanel
          files={userKitFiles}
          onAddFiles={onAddUserKitFiles}
          onRemoveFile={onRemoveUserKitFile}
          onUpdateSlot={onUpdateUserKitSlot}
          onClearAll={onClearUserKit}
        />
      )}

      {panel === "matrix" && (
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

      {panel === "live" && <CrosshairPanel pattern={pattern} control={crosshair} onChange={onCrosshairChange} />}
    </>
  );
}
