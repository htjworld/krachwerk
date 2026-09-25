import { hashSeedString, mulberry32, pick } from "./prng";
import { SCALES, type Scale } from "./scales";
import { VOICES, type VoiceId } from "./voices";

export const STEP_COUNT = 16;
export const KICK_STEPS = [0, 4, 8, 12];

export interface StepCell {
  on: boolean;
  degree: number;
}

export interface Pattern {
  seedInput: string;
  seedHash: number;
  tempo: number;
  scale: Scale;
  bassVoice: VoiceId;
  leadVoice: VoiceId;
  // 드럼 레이어는 시드와 무관하게 항상 동일하다 (1.4). 매트릭스 에디터에서만 덮어쓸 수 있다.
  drum: { kick: boolean[]; hihat: boolean[] };
  bass: StepCell[];
  lead: StepCell[];
}

function emptySteps(): StepCell[] {
  return Array.from({ length: STEP_COUNT }, () => ({ on: false, degree: 0 }));
}

export function fixedDrumLayer(): { kick: boolean[]; hihat: boolean[] } {
  const kick = Array.from({ length: STEP_COUNT }, (_, i) => KICK_STEPS.includes(i));
  const hihat = Array.from({ length: STEP_COUNT }, () => true);
  return { kick, hihat };
}

// 시드 문자열 하나로 완전히 결정되는 트랙. 태그(traits.ts)는 이 함수의 입력이 아니라
// 이 함수의 결과를 검사해서 원하는 후보 시드를 고르는 필터로만 쓰인다.
export function generatePattern(seedInput: string): Pattern {
  const seedHash = hashSeedString(seedInput);
  const rng = mulberry32(seedHash);

  const tempo = 104 + Math.floor(rng() * 29);
  const scale = pick(rng, SCALES);

  const bassVoice = pick(rng, VOICES).id;
  let leadVoice = pick(rng, VOICES).id;
  while (leadVoice === bassVoice) {
    leadVoice = pick(rng, VOICES).id;
  }

  // degree는 on/off와 무관하게 매 스텝 채운다. 매트릭스 에디터에서 꺼진 스텝을 다시 켜도
  // 시드가 정해둔 음정 그대로 재생되도록 하기 위해서다.
  const bass = emptySteps();
  for (let i = 0; i < STEP_COUNT; i++) {
    const degree = pick(rng, [-1, 0, 0, 0, 2]);
    const isEvenStep = i % 2 === 0;
    const on = isEvenStep || rng() < 0.15;
    bass[i] = { on, degree };
  }

  const lead = emptySteps();
  for (let i = 0; i < STEP_COUNT; i++) {
    const degree = Math.floor(rng() * 10) - 2;
    const on = rng() < 0.5;
    lead[i] = { on, degree };
  }

  return {
    seedInput,
    seedHash,
    tempo,
    scale,
    bassVoice,
    leadVoice,
    drum: fixedDrumLayer(),
    bass,
    lead,
  };
}
