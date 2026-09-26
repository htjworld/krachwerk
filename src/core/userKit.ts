// 내 소리 불러오기(§15.4, Q7): 사용자가 직접 녹음했거나 쓸 권리가 있는 소리를 브라우저에만
// 저장해서 쓰는 기능. 이 파일은 순수 로직만(분류, 슬롯 매핑) — 저장은 userKitStore.ts,
// 화면은 UserKitPanel.tsx.

export type UserSlot = "kick" | "snare" | "hat" | "perc" | "sig";

export const USER_SLOTS: readonly UserSlot[] = ["kick", "snare", "hat", "perc", "sig"];

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
 * 사용자가 넣은 오디오를 슬롯 하나로 자동 분류한다(§15.4). 파일을 처음 넣을 때 한 번만
 * 쓴다 — 이후 사용자가 슬롯을 바꾸면 그 값을 그대로 저장한다.
 * 규칙(위에서부터 처음 맞는 것): 길다 → sig / 저음 많다 → kick / 영점 교차 많다(밝다) → hat /
 * 짧다 → snare / 나머지 → perc.
 */
export function classifySample(data: Float32Array, sampleRate: number): UserSlot {
  const dur = trimmedDuration(data, sampleRate);
  if (dur >= 0.6) return "sig";
  const low = lowEnergyRatio(data, sampleRate, 150);
  if (low > 0.5) return "kick";
  const zcr = zeroCrossingRate(data, sampleRate);
  if (zcr > 0.2) return "hat";
  if (dur < 0.4) return "snare";
  return "perc";
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
};
