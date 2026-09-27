export type VoiceId =
  | "square"
  | "sawUnison"
  | "triSub"
  | "fmBell"
  | "noiseZap"
  | "ringMod"
  // 260927 §7.1 신규. VOICES 배열에는 안 넣는다 — pick(rng, VOICES)로 뽑히면 기본 코드
  // 경로의 무작위 보이스 분포가 바뀐다(R9 위반). 스타일 코드가 pattern.ts에서 직접 배정한다.
  | "organBass"
  | "formantVox"
  | "fmEPiano"
  | "superPad"
  | "cheapSynth";

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
