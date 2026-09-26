// 시그니처 사운드 S4(계산기/릴레이/타자기)·S5(모뎀)·S6(탐사선) 원샷(§15.2). S1(로봇 목소리)은
// voiceBank.ts, S2(우주 교신음)·S3(금속 벨)은 audioEngine.ts가 직접 합성한다 — 여긴 파일
// 기반인 세 종류만. 곡 하나는 이 중 하나만 고르므로(§15.2 sigKind), 고른 파일 하나만 받는다.

export type SigSampleKind = "mech" | "modem" | "space";

const MECH_FILES = [
  "freesound/calculator-425187.wav",
  "freesound/calculator-841391.wav",
  "freesound/relay-384701.wav",
  "freesound/relay-674028.wav",
  "freesound/relay-740252.wav",
  "freesound/typewriter-160678.wav",
  "freesound/typewriter-641243.wav",
];
const SPACE_FILES = ["nasa/insight-dink-1.wav", "nasa/insight-dink-2.wav"];
const MODEM_FILE = "commons/modem-handshake.wav";

function sigUrl(file: string): string {
  const base = import.meta.env?.BASE_URL ?? "/";
  return `${base}samples/${file}`;
}

const cache = new Map<string, Promise<AudioBuffer>>();

function loadFile(ctx: BaseAudioContext, file: string): Promise<AudioBuffer> {
  const key = `${ctx.sampleRate}:${file}`;
  let promise = cache.get(key);
  if (!promise) {
    promise = fetch(sigUrl(file))
      .then((response) => {
        if (!response.ok) throw new Error(`sig sample ${file} failed: ${response.status}`);
        return response.arrayBuffer();
      })
      .then((data) => ctx.decodeAudioData(data));
    cache.set(key, promise);
  }
  return promise;
}

/** index는 kind 안의 후보 중 몇 번째인지(mech: 0~6, space: 0~1, modem은 하나뿐이라 무시). */
export function loadSigSample(ctx: BaseAudioContext, kind: SigSampleKind, index: number): Promise<AudioBuffer> {
  if (kind === "modem") return loadFile(ctx, MODEM_FILE);
  const files = kind === "mech" ? MECH_FILES : SPACE_FILES;
  return loadFile(ctx, files[index % files.length]);
}
