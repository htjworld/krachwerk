export type VoiceId = "square" | "sawUnison" | "triSub" | "fmBell" | "noiseZap" | "ringMod";

export interface Voice {
  id: VoiceId;
  // 특이한 음색 위주 태그가 가중치를 주는 대상인지
  unusual: boolean;
}

export const VOICES: readonly Voice[] = [
  { id: "square", unusual: false },
  { id: "sawUnison", unusual: false },
  { id: "triSub", unusual: false },
  { id: "fmBell", unusual: true },
  { id: "noiseZap", unusual: true },
  { id: "ringMod", unusual: true },
];
