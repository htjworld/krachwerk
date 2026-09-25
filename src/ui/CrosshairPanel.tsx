import { useRef, useState } from "react";
import { useI18n } from "../i18n/i18n";
import {
  defaultCrosshairControl,
  isTextureActive,
  type CrosshairControl,
  type Pattern,
} from "../core";

interface Props {
  pattern: Pattern;
  control: CrosshairControl | null;
  onChange: (control: CrosshairControl | null) => void;
}

const MIN_TEMPO = 104;
const MAX_TEMPO = 132;

function loadSlot(key: string): CrosshairControl | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as CrosshairControl) : null;
  } catch {
    return null;
  }
}

function saveSlot(key: string, control: CrosshairControl): void {
  try {
    localStorage.setItem(key, JSON.stringify(control));
  } catch {
    // 프라이빗 브라우징 등에서는 저장을 조용히 건너뛴다.
  }
}

export function CrosshairPanel({ pattern, control, onChange }: Props) {
  const { t } = useI18n();
  const areaRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null);
  const [armed, setArmed] = useState(false);

  const effective = control ?? defaultCrosshairControl(pattern);
  const pos = draft ?? {
    x: (effective.tempo - MIN_TEMPO) / (MAX_TEMPO - MIN_TEMPO),
    y: effective.filterCutoff,
  };

  const toNormalized = (clientX: number, clientY: number) => {
    const rect = areaRef.current!.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, 1 - (clientY - rect.top) / rect.height));
    return { x, y };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    areaRef.current?.setPointerCapture(e.pointerId);
    setDraft(toNormalized(e.clientX, e.clientY));
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draft) return;
    setDraft(toNormalized(e.clientX, e.clientY));
  };

  const commitDraft = () => {
    if (draft) {
      onChange({
        tempo: Math.round(MIN_TEMPO + draft.x * (MAX_TEMPO - MIN_TEMPO)),
        filterCutoff: draft.y,
      });
    }
    setDraft(null);
  };

  const handleSlot = (n: 1 | 2) => {
    const key = `krachwerk.crosshair.slot${n}`;
    if (armed) {
      saveSlot(key, effective);
      setArmed(false);
      return;
    }
    const saved = loadSlot(key);
    if (saved) onChange(saved);
  };

  const icons: { key: string; active: boolean }[] = [
    { key: "bass", active: pattern.bass.some((s) => s.on) },
    { key: "lead", active: pattern.lead.some((s) => s.on) },
    { key: "drum", active: true },
    { key: "texture", active: isTextureActive(pattern) },
  ];

  return (
    <div className="device">
      <div className="crosshair-icons">
        {icons.map((icon) => (
          <div key={icon.key} className="crosshair-icon" style={{ opacity: icon.active ? 1 : 0.25 }} />
        ))}
      </div>

      <div
        ref={areaRef}
        className="crosshair-area"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={commitDraft}
        onPointerCancel={commitDraft}
      >
        <div className="crosshair-line-v" style={{ left: `${pos.x * 100}%` }} />
        <div className="crosshair-line-h" style={{ top: `${(1 - pos.y) * 100}%` }} />
      </div>

      <p className="device-subheading">
        TEMPO {Math.round(MIN_TEMPO + pos.x * (MAX_TEMPO - MIN_TEMPO))} BPM / TONE{" "}
        {Math.round(pos.y * 100)}%
      </p>

      <div className="button-row">
        <button type="button" className="device-text-button" aria-pressed={armed} onClick={() => setArmed((a) => !a)}>
          SAVE
        </button>
        <button type="button" className="device-text-button" onClick={() => handleSlot(1)}>
          1
        </button>
        <button type="button" className="device-text-button" onClick={() => handleSlot(2)}>
          2
        </button>
        <button type="button" className="device-text-button" onClick={() => onChange(null)}>
          {t("matrix.reset")}
        </button>
      </div>
    </div>
  );
}
