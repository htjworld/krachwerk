// VCSL/Karoryfer 음색 샘플(§15.3): pad/stab 신스 위에 겹치는 샘플 톤 하나. voiceBank.ts/
// sigBank.ts와 같은 원칙 — 곡 하나가 실제로 고른 파일 하나만 받는다. VCSL은 "stab 대용"
// (chime/clavi/fmpiano/glass/glock, 전부 음높이가 있는 톤), Karoryfer는 "pad 대용"(오르간)로
// §15.5 매니페스트가 태그해 둔 그대로 나눠 쓴다. VCSL의 siren/train/triangle/vibraslap
// 같은 질감(texture) 계열은 아직 안 쓴다(ponytail, 시그니처 확장 때 같이 붙일 자리).

export type TonalKit = "vcsl" | "karoryfer";

const VCSL_STAB_FILES = [
  "vcsl/chime-c4.wav",
  "vcsl/clavi-c3.wav",
  "vcsl/clavi-c4.wav",
  "vcsl/fmpiano-c3.wav",
  "vcsl/fmpiano-c4.wav",
  "vcsl/glass-d5.wav",
  "vcsl/glock-c5.wav",
  "vcsl/glock-c6.wav",
];
const KARORYFER_PAD_FILES = [
  "karoryfer/organ-bass-c3.wav",
  "karoryfer/organ-c4.wav",
  "karoryfer/organ-flute-c5.wav",
  "karoryfer/organ-g4.wav",
];

function tonalUrl(file: string): string {
  const base = import.meta.env?.BASE_URL ?? "/";
  return `${base}samples/${file}`;
}

const cache = new Map<string, Promise<AudioBuffer>>();

function loadFile(ctx: BaseAudioContext, file: string): Promise<AudioBuffer> {
  const key = `${ctx.sampleRate}:${file}`;
  let promise = cache.get(key);
  if (!promise) {
    promise = fetch(tonalUrl(file))
      .then((response) => {
        if (!response.ok) throw new Error(`tonal sample ${file} failed: ${response.status}`);
        return response.arrayBuffer();
      })
      .then((data) => ctx.decodeAudioData(data));
    cache.set(key, promise);
  }
  return promise;
}

/** index는 그 킷 안의 후보 중 몇 번째인지 (킷마다 개수가 달라서 킷을 정한 뒤 모듈로 접는다). */
export function loadTonalSample(ctx: BaseAudioContext, kit: TonalKit, index: number): Promise<AudioBuffer> {
  const files = kit === "vcsl" ? VCSL_STAB_FILES : KARORYFER_PAD_FILES;
  return loadFile(ctx, files[index % files.length]);
}
