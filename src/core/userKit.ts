// 내 소리 불러오기(§15.4, Q7): 사용자가 직접 녹음했거나 쓸 권리가 있는 소리를 브라우저에만
// 저장해서 쓰는 기능. 이 파일은 순수 로직만(분류, 슬롯 매핑) — 저장은 userKitStore.ts,
// 화면은 UserKitPanel.tsx.

// 260927 §10/§13: "voice" 신규 — f 스타일 chop(§6.4.1 소스 우선순위 1번)이 말소리·일상
// 녹음이 있으면 CC0 풀·로봇 목소리보다 먼저 그걸 쓴다.
export type UserSlot = "kick" | "snare" | "hat" | "perc" | "sig" | "voice";

export const USER_SLOTS: readonly UserSlot[] = ["kick", "snare", "hat", "perc", "sig", "voice"];

/** −50dB 이하를 무음으로 보고 앞뒤를 뺀 길이(초). 오디오 자체가 조용하면 원래 길이를 낸다. */
function trimmedDuration(data: Float32Array, sampleRate: number): number {
  const threshold = Math.pow(10, -50 / 20);
  let start = 0;
  let end = data.length - 1;
  while (start < data.length && Math.abs(data[start]) < threshold) start++;
  while (end > start && Math.abs(data[end]) < threshold) end--;
  if (start >= end) return data.length / sampleRate;
  return (end - start) / sampleRate;
}

// 1차 로우패스(150Hz)를 통과한 에너지 비율. 실시간 필터가 아니라 단순 이동평균(RC 저역통과와
// 같은 형태)으로 충분하다 — "저음이 얼마나 있는가"만 필요하다.
function lowEnergyRatio(data: Float32Array, sampleRate: number, cutoffHz: number): number {
  const alpha = 1 / (1 + sampleRate / (2 * Math.PI * cutoffHz));
  let low = 0;
  let totalEnergy = 0;
  let lowEnergy = 0;
  for (let i = 0; i < data.length; i++) {
    low += alpha * (data[i] - low);
    totalEnergy += data[i] * data[i];
    lowEnergy += low * low;
  }
  return totalEnergy > 0 ? lowEnergy / totalEnergy : 0;
}

// 첫 0.1초의 샘플당 영점 교차율.
function zeroCrossingRate(data: Float32Array, sampleRate: number): number {
  const window = Math.min(data.length, Math.round(sampleRate * 0.1));
  if (window < 2) return 0;
  let crossings = 0;
  for (let i = 1; i < window; i++) {
    if ((data[i - 1] >= 0) !== (data[i] >= 0)) crossings++;
  }
  return crossings / window;
}

/**
 * 오디오 조각 하나를 슬롯으로 자동 분류한다(§15.4, §10). 사용자가 슬롯을 고르지 않고,
 * sliceUserSound가 조각마다 한 번 부른다.
 * 규칙(위에서부터 처음 맞는 것): 아주 길다(말소리·일상 녹음 길이) → voice / 길다 → sig /
 * 저음 많다 → kick / 영점 교차 많다(밝다) → hat / 짧다 → snare / 나머지 → perc.
 */
export function classifySample(data: Float32Array, sampleRate: number): UserSlot {
  const dur = trimmedDuration(data, sampleRate);
  if (dur >= 2.0) return "voice";
  if (dur >= 0.6) return "sig";
  const low = lowEnergyRatio(data, sampleRate, 150);
  if (low > 0.5) return "kick";
  const zcr = zeroCrossingRate(data, sampleRate);
  if (zcr > 0.2) return "hat";
  if (dur < 0.4) return "snare";
  return "perc";
}

// ---------------------------------------------------------------- 넣은 소리 다듬기

/** 이보다 짧은 소리는 통째로 원 샷 하나로 쓴다. 길면 조각 몇 개만 뽑는다. */
export const ONE_SHOT_MAX_SECONDS = 3;
const HIT_SECONDS = 0.35;
const PHRASE_SECONDS = 2;
const FRAME = 512;
const PEAK = 0.89; // −1dBFS

export interface SoundSlice {
  slot: UserSlot;
  data: Float32Array<ArrayBuffer>;
}

// 앞뒤 −50dB 이하를 뺀 구간.
function trimRange(data: Float32Array): [number, number] {
  const threshold = Math.pow(10, -50 / 20);
  let start = 0;
  let end = data.length;
  while (start < end && Math.abs(data[start]) < threshold) start++;
  while (end > start && Math.abs(data[end - 1]) < threshold) end--;
  return start < end ? [start, end] : [0, data.length];
}

// 페이드를 걸고 피크를 −1dBFS로 맞춘 복사본. 페이드 없이 자르면 조각 끝이 딸깍거리고,
// 음량을 안 맞추면 곡 전체를 가져온 조각이 기본 킷보다 훨씬 크거나 작게 들린다.
function shape(data: Float32Array, sampleRate: number, fadeOutSeconds: number): Float32Array<ArrayBuffer> {
  const out = Float32Array.from(data);
  const fadeIn = Math.min(out.length, Math.round(sampleRate * 0.002));
  const fadeOut = Math.min(out.length, Math.round(sampleRate * fadeOutSeconds));
  for (let i = 0; i < fadeIn; i++) out[i] *= i / fadeIn;
  for (let i = 0; i < fadeOut; i++) out[out.length - 1 - i] *= i / fadeOut;
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) for (let i = 0; i < out.length; i++) out[i] *= PEAK / peak;
  return out;
}

/**
 * 사용자가 넣은 소리(모노)를 곡에 섞을 조각으로 만든다. 슬롯은 사용자가 고르지 않는다.
 *  - 3초 이하: 앞뒤 무음만 잘라 원 샷 하나. 슬롯은 classifySample이 정한다.
 *  - 그보다 길면(곡, 긴 녹음): 통째로 쓰면 타격마다 곡 전체가 겹쳐 지지직거린다. 그래서
 *    가장 센 어택 두 곳에서 짧은 타격 조각(0.35초, 킥/스네어/햇 등으로 자동 분류)을, 가장
 *    소리가 큰 2초 구간에서 목소리 조각(voice, f 스타일이 잘라 쓴다)을 하나 뽑는다.
 */
export function sliceUserSound(data: Float32Array, sampleRate: number): SoundSlice[] {
  const [start, end] = trimRange(data);
  if ((end - start) / sampleRate <= ONE_SHOT_MAX_SECONDS) {
    const one = shape(data.subarray(start, end), sampleRate, 0.02);
    return [{ slot: classifySample(one, sampleRate), data: one }];
  }

  const frames = Math.floor((end - start) / FRAME);
  const energy = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let i = start + f * FRAME, n = i + FRAME; i < n; i++) sum += data[i] * data[i];
    energy[f] = sum;
  }

  // 목소리 조각: 2초 창의 에너지 합이 가장 큰 곳.
  const phraseLen = Math.round((PHRASE_SECONDS * sampleRate) / FRAME);
  let windowSum = 0;
  for (let f = 0; f < Math.min(phraseLen, frames); f++) windowSum += energy[f];
  let phraseFrame = 0;
  let best = windowSum;
  for (let f = 1; f + phraseLen <= frames; f++) {
    windowSum += energy[f + phraseLen - 1] - energy[f - 1];
    if (windowSum > best) [best, phraseFrame] = [windowSum, f];
  }

  const cut = (frame: number, seconds: number) => {
    const from = start + frame * FRAME;
    return data.subarray(from, Math.min(end, from + Math.round(seconds * sampleRate)));
  };

  // 타격 조각: 에너지가 가장 크게 뛰어오르는 프레임(어택). 목소리 조각과 겹치지 않고
  // 서로 1초 이상 떨어진 두 곳을 고른다. 곡은 가장 센 어택이 대개 전부 킥이라, 앞쪽 후보
  // 안에서는 이미 뽑은 조각과 다른 슬롯(스네어, 햇 등)을 먼저 고른다.
  const hitLen = Math.round((HIT_SECONDS * sampleRate) / FRAME);
  const minGap = Math.round(sampleRate / FRAME);
  const onsets = Array.from({ length: Math.max(0, frames - hitLen - 1) }, (_, i) => i + 1).sort(
    (a, b) => energy[b] - energy[b - 1] - (energy[a] - energy[a - 1])
  );
  const slices: SoundSlice[] = [];
  const hitFrames: number[] = [];
  let fallback: { frame: number; slice: SoundSlice } | null = null;
  let scanned = 0;
  for (const f of onsets) {
    if (slices.length === 2 || scanned === 60) break;
    const overlapsPhrase = f + hitLen > phraseFrame && f < phraseFrame + phraseLen;
    if (overlapsPhrase || hitFrames.some((h) => Math.abs(h - f) < minGap)) continue;
    scanned++;
    const hit = shape(cut(f, HIT_SECONDS), sampleRate, 0.04);
    const slice = { slot: classifySample(hit, sampleRate), data: hit };
    if (slices.some((s) => s.slot === slice.slot)) {
      fallback ??= { frame: f, slice };
      continue;
    }
    slices.push(slice);
    hitFrames.push(f);
  }
  if (slices.length < 2 && fallback) slices.push(fallback.slice);

  slices.push({ slot: "voice", data: shape(cut(phraseFrame, PHRASE_SECONDS), sampleRate, 0.08) });
  return slices;
}

/** DrumRole(오디오 엔진 쪽 타격 역할)이 어느 UserSlot을 참조하는지(§15.4 표). */
export const ROLE_TO_USER_SLOT: Partial<Record<string, UserSlot>> = {
  kick: "kick",
  lowDrum: "kick",
  backbeat: "snare",
  hat: "hat",
  openHat: "hat",
  perc: "perc",
  metal: "perc",
  sig: "sig",
  chop: "voice",
};
