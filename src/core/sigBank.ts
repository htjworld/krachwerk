// 시그니처 사운드 S4(계산기/릴레이/타자기)·S5(모뎀)·S6(탐사선) 원샷(§15.2). S1(로봇 목소리)은
// voiceBank.ts, S2(우주 교신음)·S3(금속 벨)은 audioEngine.ts가 직접 합성한다 — 여긴 파일
// 기반인 세 종류만. 곡 하나는 이 중 하나만 고르므로(§15.2 sigKind), 고른 파일 하나만 받는다.
//
// §15.5 매니페스트가 "sig(S2·S5 보조)"·"sig(S6 보조)"로 태그해 둔 파일들을 각 풀에 더했다 —
// uzu misc(태그: sigBlip)는 계산기/릴레이/타자기와 같은 기계 질감이라 mech에, kenney는
// S5(모뎀) 자리에, VCSL의 사이렌·기차 호루라기·트라이앵글·비브라슬랩·플렉사톤은 S6(탐사선)
// 자리에 넣었다 — S2(합성 Quindar 톤)는 그대로 두고 안 건드렸다(고유한 신호음이라 섞으면
// 오히려 구분이 흐려진다).

export type SigSampleKind = "mech" | "modem" | "space";

const MECH_FILES = [
  "freesound/calculator-425187.wav",
  "freesound/calculator-841391.wav",
  "freesound/relay-384701.wav",
  "freesound/relay-674028.wav",
  "freesound/relay-740252.wav",
  "freesound/typewriter-160678.wav",
  "freesound/typewriter-641243.wav",
  "uzu/misc-1.wav",
  "uzu/misc-2.wav",
  "uzu/misc-3.wav",
  "uzu/misc-4.wav",
  "uzu/misc-5.wav",
];
const SPACE_FILES = [
  "nasa/insight-dink-1.wav",
  "nasa/insight-dink-2.wav",
  "vcsl/siren.wav",
  "vcsl/train-low.wav",
  "vcsl/train-med.wav",
  "vcsl/triangle.wav",
  "vcsl/vibraslap.wav",
  "vcsl/flexatone.wav",
  "vcsl/flexatone-slap.wav",
];
const MODEM_FILES = [
  "commons/modem-handshake.wav",
  "kenney/laser1.wav",
  "kenney/laser4.wav",
  "kenney/lowRandom.wav",
  "kenney/phaserDown1.wav",
  "kenney/threeTone1.wav",
  "kenney/tone1.wav",
  "kenney/twoTone1.wav",
  "kenney/zap1.wav",
  "kenney/zap2.wav",
  "kenney/zapThreeToneUp.wav",
];

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

/** index는 kind 안의 후보 중 몇 번째인지 — 풀마다 개수가 달라서 고른 풀 기준으로 모듈로 접는다. */
export function loadSigSample(ctx: BaseAudioContext, kind: SigSampleKind, index: number): Promise<AudioBuffer> {
  const files = kind === "mech" ? MECH_FILES : kind === "modem" ? MODEM_FILES : SPACE_FILES;
  return loadFile(ctx, files[index % files.length]);
}
