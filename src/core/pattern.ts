import { mulberry32, pick } from "./prng";
import { SCALES, type Scale } from "./scales";
import { VOICES, type VoiceId } from "./voices";
import { seedToGenome, kToV2Genome, type Genome, type StyleGenome } from "./genome";
import { blueprintIdFor, legacyDrumVariantFor, legacyKickPattern, computeScale, metropolisScale } from "./motifs";
import { blueprintFor, dBlueprintIdFor, kBlueprintIdFor } from "./blueprints";
import { blueprintFamily, type BlueprintId } from "./blueprint";
import type { StyleId } from "./blueprint";
import { dScale } from "./styleMotifs";

export const STEP_COUNT = 16;

export interface StepCell {
  on: boolean;
  degree: number;
}

export interface Pattern {
  /**
   * 정규 시드 코드. 기본 코드([0-9a-z]{8}) 또는 스타일 코드([kdpf][0-9a-z]{15}). 입력이 그
   * 형식이 아니었으면 canonicalize한 결과(기본 코드)다.
   */
  seedInput: string;
  /** 게놈 밖 무작위성(보이스, 텍스처 비트 등)에 계속 쓰는 값. 260927: open은 genome.n %
   *  2^32 그대로(불변), 스타일 코드는 styleFeistel 결과(P) % 2^32다(genome.ts seedToGenome). */
  seedHash: number;
  /** 260927 §13.5 신규. 어느 시드 가족인지 — open(기본 8자) 또는 얼굴 버튼 스타일 4종. */
  style: StyleId;
  /** 시드 코드가 결정하는 정체성 필드 9개 (§9.2). style==="open"이면 실제 게놈이고,
   *  스타일 코드는 kToV2Genome로 공통 필드만 채운 값(나머지 0)이다 — 이름이 같은 v2
   *  함수(computeScale 등)가 그대로 동작하게 하는 어댑터다(§13.5). 실제 음악 결정은
   *  스타일 코드일 때 styleGenome에서 한다. */
  genome: Genome;
  /** 260927 §13.5 신규. style이 "open"이면 null, 스타일 코드면 그 스타일의 원본 게놈
   *  (form/kit/voice/sig/timbre/tape/sample/hook/chop 등 스타일 전용 필드를 담는다). */
  styleGenome: StyleGenome | null;
  /** genome.blueprint(g1)로 고른 블루프린트(open) 또는 styleGenome.form으로 고른
   *  블루프린트(스타일 코드). */
  blueprintId: BlueprintId;
  /** 크로스헤어 단위(104~132 폭) 템포. 실제 BPM은 `effectiveTempo(pattern, control)`처럼
   *  blueprint.tempoScale을 곱해야 한다(§6.6) — open은 tempoScale 1이라 지금처럼 그대로 BPM. */
  tempo: number;
  /** 260927 §6.1 신규. 실제 BPM = tempo × tempoScale. open은 항상 1. */
  tempoScale: number;
  /** 260927 §6.2 신규. 마디당 칸 수. open/k는 16, d의 shuffle12만 12(8분 셋잇단). */
  stepsPerBar: 16 | 12;
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

// v2 §16.6 방향(구현은 안 됐던 규칙 — open 경로는 지금 그대로 전 6종 중 무작위다, 손대지
// 않는다): compute/metropolis 계열은 그 곡 음색에 맞는 보이스 후보 2개만 쓴다. k 스타일은
// 처음부터 이 규칙으로 만든다(§5.4 timbre 비트 0=베이스, 비트 1=리드).
const K_BASS_VOICES: Record<"compute" | "metropolis", [VoiceId, VoiceId]> = {
  compute: ["square", "sawUnison"],
  metropolis: ["sawUnison", "triSub"],
};
const K_LEAD_VOICES: Record<"compute" | "metropolis", [VoiceId, VoiceId]> = {
  compute: ["square", "fmBell"],
  metropolis: ["square", "sawUnison"],
};

// bass/lead StepCell 채우기(레거시 방식, rng 순서 고정). open 경로와 완전히 같은 알고리즘 —
// compute/metropolis(open이든 k든)에서는 실제 리프·베이스가 motifs.ts의 computeRiff 등에서
// 따로 나오므로(§16.7, buildRig의 motifRiff/motifBass) 이 값은 매트릭스 에디터의 MELO 탭
// 기본값과 크로스헤어 아이콘 점등에만 쓰인다(레거시 bass 큐는 motifBass가 있으면 안 읽는다).
function fillLegacyBassLead(rng: () => number): { bass: StepCell[]; lead: StepCell[] } {
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
  return { bass, lead };
}

// 시드 문자열 하나로 완전히 결정되는 트랙. 태그(traits.ts)는 이 함수의 입력이 아니라
// 이 함수의 결과를 검사해서 원하는 후보 시드를 고르는 필터로만 쓰인다.
//
// 정규 코드가 아닌 입력(자유 텍스트)은 canonicalize해서 쓴다(§9.3) — 그래서 open 경로의
// seedInput은 항상 기본 정규 코드다. 스타일 코드([kdpf]+15자)는 §5.1 해석 순서에 따라
// 절대 canonicalize를 거치지 않는다(얼굴 버튼을 눌러야만 스타일이 된다, 요구 6).
export function generatePattern(seedInput: string): Pattern {
  const result = seedToGenome(seedInput);
  return result.family === "open" ? generateOpenPattern(result) : generateStylePattern(result);
}

// ---------------------------------------------------------------- open(기본 코드, 불변)

/**
 * §12 단계 0 스냅샷이 보증하는 경로. genomeFromCode(v2) 시절과 완전히 같은 순서로 같은
 * rng를 소비한다 — 여기 한 줄이라도 달라지면 기존 공유 링크가 다른 곡을 낸다(R9 위반).
 */
function generateOpenPattern(result: { code: string; genome: Genome; n: number; seedHash: number }): Pattern {
  const { code, genome, seedHash } = result;
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
  const { bass, lead } = fillLegacyBassLead(rng);

  const drumVariant = legacyDrumVariantFor(genome.drumVariant);

  return {
    seedInput: code,
    seedHash,
    style: "open",
    genome,
    styleGenome: null,
    blueprintId,
    tempo,
    tempoScale: 1,
    stepsPerBar: 16,
    scale,
    bassVoice,
    leadVoice,
    drum: { kick: legacyKickPattern(drumVariant) },
    bass,
    lead,
  };
}

// ---------------------------------------------------------------- 스타일 코드 (얼굴 버튼)

/** 스타일별 form → blueprintId (§6.3 표). d/p/f는 §11 단계 8~10에서 채운다. */
function styleBlueprintIdFor(styleGenome: StyleGenome): BlueprintId {
  const form = styleGenome.form ?? 0;
  switch (styleGenome.style) {
    case "k":
      return kBlueprintIdFor(form);
    case "d":
      return dBlueprintIdFor(form);
    case "p":
    case "f":
      throw new Error(`generatePattern: 스타일 "${styleGenome.style}"은 아직 구현되지 않았다`);
  }
}

function generateStylePattern(result: {
  code: string;
  styleGenome: StyleGenome;
  n: bigint;
  seedHash: number;
}): Pattern {
  const { code, styleGenome, seedHash } = result;
  const blueprintId = styleBlueprintIdFor(styleGenome);
  const blueprint = blueprintFor(blueprintId);
  const genome = kToV2Genome(styleGenome);
  const tempo = blueprint.tempoRange[0] + (styleGenome.tempo ?? 0);
  const family = blueprintFamily(blueprintId); // k는 항상 "compute" | "metropolis" 중 하나

  // k: 조성은 v2 compute/metropolis와 같은 함수로(§13.5) — buildRig의 motifScale과 같은 값을
  // 써야 요약 화면(pattern.scale.name)이 실제로 나는 소리와 어긋나지 않는다. 보이스는
  // timbre 비트 0~1(§5.4)로, 전 6종이 아니라 그 계열에 맞는 후보 2개 중에서 고른다.
  // d: 화성이 사실상 고정(§4.1 D12)이라 dScale 하나, 보이스는 cheapSynth 고정(§13.5).
  const timbre = styleGenome.timbre ?? 0;
  const scale = family === "metropolis" ? metropolisScale(genome) : family === "compute" ? computeScale(genome) : dScale(styleGenome);
  const bassVoice: VoiceId =
    family === "metropolis"
      ? K_BASS_VOICES.metropolis[timbre & 1]
      : family === "compute"
        ? K_BASS_VOICES.compute[timbre & 1]
        : "cheapSynth";
  const leadVoice: VoiceId =
    family === "metropolis"
      ? K_LEAD_VOICES.metropolis[(timbre >> 1) & 1]
      : family === "compute"
        ? K_LEAD_VOICES.compute[(timbre >> 1) & 1]
        : "cheapSynth";

  const rng = mulberry32(seedHash);
  const { bass, lead } = fillLegacyBassLead(rng);
  const drumVariant = legacyDrumVariantFor(genome.drumVariant);

  return {
    seedInput: code,
    seedHash,
    style: styleGenome.style,
    genome,
    styleGenome,
    blueprintId,
    tempo,
    tempoScale: blueprint.tempoScale ?? 1,
    stepsPerBar: blueprint.stepsPerBar ?? 16,
    scale,
    bassVoice,
    leadVoice,
    drum: { kick: legacyKickPattern(drumVariant) },
    bass,
    lead,
  };
}
