import { mulberry32, pick } from "./prng";
import { SCALES, type Scale } from "./scales";
import { VOICES, type VoiceId } from "./voices";
import { genomeFromCode, type Genome } from "./genome";
import { blueprintIdFor, legacyDrumVariantFor, legacyKickPattern } from "./motifs";
import type { BlueprintId } from "./blueprint";

export const STEP_COUNT = 16;

export interface StepCell {
  on: boolean;
  degree: number;
}

export interface Pattern {
  /** 정규 시드 코드([0-9a-z]{8}). 입력이 그 형식이 아니었으면 canonicalize한 결과다. */
  seedInput: string;
  /** 게놈 밖 무작위성(보이스, 텍스처 비트 등)에 계속 쓰는 값. genome.n % 2^32. */
  seedHash: number;
  /** 시드 코드가 결정하는 정체성 필드 9개 (§9.2). */
  genome: Genome;
  /** genome.blueprint(g1)로 고른 블루프린트. §11 단계 6 전까진 legacy 3종 중 하나뿐이다. */
  blueprintId: BlueprintId;
  tempo: number;
  scale: Scale;
  bassVoice: VoiceId;
  leadVoice: VoiceId;
  /**
   * §11 단계 5부터 fourFloor 계열(0·4·8·12 필수) + 게놈 drumVariant의 1비트(스텝 14)로
   * 생성한다 — 예전엔 시드와 무관하게 항상 완전히 같았다(1.4의 원래 취지). 매트릭스
   * 에디터에서만 덮어쓸 수 있다(PatternOverride.kick).
   */
  drum: { kick: boolean[] };
  bass: StepCell[];
  lead: StepCell[];
}

function emptySteps(): StepCell[] {
  return Array.from({ length: STEP_COUNT }, () => ({ on: false, degree: 0 }));
}

// 크로스헤어 컨트롤(4.5)의 텍스처 레이어 활성 여부. seedHash의 별도 비트에서 뽑아
// generatePattern의 rng 순서와 완전히 독립적으로 결정한다.
export function isTextureActive(pattern: Pick<Pattern, "seedHash">): boolean {
  return ((pattern.seedHash >>> 3) & 1) === 1;
}

// 시드 문자열 하나로 완전히 결정되는 트랙. 태그(traits.ts)는 이 함수의 입력이 아니라
// 이 함수의 결과를 검사해서 원하는 후보 시드를 고르는 필터로만 쓰인다.
//
// 정규 코드가 아닌 입력(자유 텍스트)은 canonicalize해서 쓴다(§9.3) — 그래서 seedInput은
// 항상 정규 코드다. 여기서 뽑는 tempo/scale/보이스/베이스/리드는 게놈 밖 rng(seedHash =
// genome.n % 2^32)에서 나온다. 드럼(drum.kick)만 게놈(drumVariant)에서 바로 나온다 — 아직
// 조성·템포·리프·베이스는 게놈을 안 쓴다(§11 단계 6에서 rng 기반 생성을 게놈 기반으로 바꾼다).
export function generatePattern(seedInput: string): Pattern {
  const { code, genome, n } = genomeFromCode(seedInput);
  const seedHash = n % 2 ** 32;
  const blueprintId = blueprintIdFor(genome.blueprint);
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

  const drumVariant = legacyDrumVariantFor(genome.drumVariant);

  return {
    seedInput: code,
    seedHash,
    genome,
    blueprintId,
    tempo,
    scale,
    bassVoice,
    leadVoice,
    drum: { kick: legacyKickPattern(drumVariant) },
    bass,
    lead,
  };
}
