import { useRef, useState } from "react";
import { useI18n } from "../i18n/i18n";
import { classifySample, USER_SLOTS, type UserSlot } from "../core";
import { isPersistent, type UserKitFile } from "../core/userKitStore";

interface Props {
  files: UserKitFile[];
  onAddFiles: (files: UserKitFile[]) => void;
  onRemoveFile: (id: string) => void;
  onUpdateSlot: (id: string, slot: UserSlot) => void;
  onClearAll: () => void;
}

const MAX_FILES = 24;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

async function classifyAndBuild(file: File): Promise<UserKitFile | null> {
  if (file.size > MAX_FILE_BYTES) return null;
  const data = await file.arrayBuffer();
  try {
    const decodeCtx = new OfflineAudioContext(1, 1, 44100);
    const decoded = await decodeCtx.decodeAudioData(data.slice(0));
    const slot = classifySample(decoded.getChannelData(0), decoded.sampleRate);
    return { id: crypto.randomUUID(), name: file.name, slot, data, addedAt: Date.now() };
  } catch {
    return null; // 이 브라우저가 못 읽는 형식이면 조용히 건너뛴다.
  }
}

export function UserKitPanel({ files, onAddFiles, onRemoveFile, onUpdateSlot, onClearAll }: Props) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const room = MAX_FILES - files.length;
    if (room <= 0) return;
    setIsLoading(true);
    try {
      const candidates = Array.from(list).slice(0, room);
      const built = await Promise.all(candidates.map(classifyAndBuild));
      const ok = built.filter((f): f is UserKitFile => f !== null);
      if (ok.length > 0) onAddFiles(ok);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="device">
      <h2 className="device-heading">{t("userKit.title")}</h2>
      <p className="device-subheading">{t("userKit.notice")}</p>
      {!isPersistent() && <p className="device-error">{t("userKit.notPersistent")}</p>}

      <div
        className="userkit-dropzone"
        style={{ opacity: isDragging ? 0.7 : 1 }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          void handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
      >
        {isLoading ? t("userKit.loading") : t("userKit.dropHint")}
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {files.length > 0 && (
        <ul className="userkit-file-list">
          {files.map((file) => (
            <li key={file.id} className="userkit-file-row">
              <span className="userkit-file-name">{file.name}</span>
              <select
                className="device-input"
                value={file.slot}
                onChange={(e) => onUpdateSlot(file.id, e.target.value as UserSlot)}
              >
                {USER_SLOTS.map((slot) => (
                  <option key={slot} value={slot}>
                    {t(`userKit.slot.${slot}`)}
                  </option>
                ))}
              </select>
              <button type="button" className="device-text-button" onClick={() => onRemoveFile(file.id)}>
                {t("userKit.remove")}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="button-row">
        <button type="button" className="device-text-button" onClick={onClearAll} disabled={files.length === 0}>
          {t("userKit.reset")}
        </button>
      </div>
    </div>
  );
}
