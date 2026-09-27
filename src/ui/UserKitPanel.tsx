import { useRef, useState } from "react";
import { useI18n } from "../i18n/i18n";
import { encodeWav, sliceUserSound } from "../core";
import { isPersistent, sourceCount, type UserKitFile } from "../core/userKitStore";

interface Props {
  files: UserKitFile[];
  onAddFiles: (files: UserKitFile[]) => void;
  onRemoveFile: (id: string) => void;
  onClearAll: () => void;
}

const MAX_SOURCES = 12;
// 곡 한 곡(무압축 WAV 4~5분)도 받을 수 있게 넉넉히 둔다 — 저장하는 건 잘라낸 조각뿐이다.
const MAX_FILE_BYTES = 80 * 1024 * 1024;
const SAMPLE_RATE = 44100;

// 파일 하나를 모노로 풀어서 조각(짧은 소리면 1개, 길면 3개)으로 만들고, 조각마다 WAV로 저장한다.
async function buildSlices(file: File): Promise<UserKitFile[]> {
  if (file.size > MAX_FILE_BYTES) return [];
  try {
    const decoded = await new OfflineAudioContext(1, 1, SAMPLE_RATE).decodeAudioData(await file.arrayBuffer());
    const mono = new Float32Array(decoded.length);
    for (let c = 0; c < decoded.numberOfChannels; c++) {
      const channel = decoded.getChannelData(c);
      for (let i = 0; i < mono.length; i++) mono[i] += channel[i] / decoded.numberOfChannels;
    }
    const group = crypto.randomUUID();
    return await Promise.all(
      sliceUserSound(mono, decoded.sampleRate).map(async ({ slot, data }) => {
        const buffer = new AudioBuffer({ length: data.length, numberOfChannels: 1, sampleRate: decoded.sampleRate });
        buffer.copyToChannel(data, 0);
        const wav = await encodeWav(buffer).arrayBuffer();
        return { id: crypto.randomUUID(), name: file.name, group, slot, data: wav, addedAt: Date.now() };
      })
    );
  } catch {
    return []; // 이 브라우저가 못 읽는 형식이면 조용히 건너뛴다.
  }
}

export function UserKitPanel({ files, onAddFiles, onRemoveFile, onClearAll }: Props) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // 같은 원본에서 나온 조각을 한 줄로 묶는다. 슬롯은 자동이라 보여주지 않는다.
  const sources = [
    ...files.reduce((map, file) => {
      const key = file.group ?? file.id;
      map.set(key, [...(map.get(key) ?? []), file]);
      return map;
    }, new Map<string, UserKitFile[]>()),
  ];

  const handleFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const room = MAX_SOURCES - sourceCount(files);
    if (room <= 0) return;
    setIsLoading(true);
    try {
      const built = (await Promise.all(Array.from(list).slice(0, room).map(buildSlices))).flat();
      if (built.length > 0) onAddFiles(built);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="device">
      <h2 className="device-heading">{t("userKit.title")}</h2>
      <p className="device-subheading">{t("userKit.notice")}</p>
      <p className="device-subheading">{t("userKit.voiceHint")}</p>
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

      {sources.length > 0 && (
        <ul className="userkit-file-list">
          {sources.map(([group, pieces]) => (
            <li key={group} className="userkit-file-row">
              <span className="userkit-file-name">{pieces[0].name}</span>
              <span className="userkit-file-meta">
                {pieces.length > 1 ? t("userKit.pieces", { count: pieces.length }) : t("userKit.oneShot")}
              </span>
              <button
                type="button"
                className="device-text-button"
                onClick={() => pieces.forEach((piece) => onRemoveFile(piece.id))}
              >
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
