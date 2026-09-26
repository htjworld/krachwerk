// 게놈 → 음악 재료 (§16.4). 이 파일은 여러 단계에 걸쳐 채워진다:
//   §11 단계 4: 블루프린트 선택(g1). 완료.
//   §11 단계 5: 드럼 계열(g8) — legacy 열만. 완료.
//   §11 단계 6: 조성·템포·리프·베이스(g2~g7) + compute/metropolis 드럼 계열. 지금 이 파일.

import { euclideanPattern, type BlueprintId, type DrumFamily } from "./blueprint";
import { makeScale, type Scale } from "./scales";
import type { Genome } from "./genome";
import type { StepCell } from "./pattern";

// pattern.ts의 STEP_COUNT와 같은 값이다. pattern.ts가 이미 motifs.ts를 불러오므로(순환
// import를 피하려고) 상수를 다시 불러오는 대신 그냥 16을 쓴다.
const STEPS = 16;

const LEGACY_IDS: readonly BlueprintId[] = ["classicBuild", "slowBurn", "doubleDrop"];

/**
 * §8.1 블루프린트 선택. g1(기수 15)을 0–5 compute / 6–11 metropolis / 12·13·14 legacy 3종으로
 * 나눈다 (Q2: 40/40/20 비중).
 */
export function blueprintIdFor(g1: number): BlueprintId {
  if (g1 <= 5) return "compute";
  if (g1 <= 11) return "metropolis";
  return LEGACY_IDS[g1 - 12];
}

// ---------------------------------------------------------------- 드럼 변형 (§16.4 표, legacy 열)

export interface LegacyDrumVariant {
  /** perc가 16스텝 중 몇 번 치는지 (유클리드 k) */
  percHits: 3 | 5 | 7 | 9;
  /** perc 유클리드 패턴 회전 (몇 번째 타격이 스텝 0에 오는지) */
  percRotation: 0 | 1 | 2 | 3;
  /** metal 후보 스텝 두 자리의 시작점. 두 번째 자리는 +8 */
  metalStart: 3 | 4 | 5 | 6;
  /** legacy 필 주기(마디) */
  fillPeriodBars: 4 | 8;
  /** fourFloor 킥에 스텝 14를 더 칠지 */
  kickStep14: boolean;
}

/** g8(drumVariant, 8비트)을 legacy 드럼 변형으로 푼다. §16.4 표의 legacy 열. */
export function legacyDrumVariantFor(g8: number): LegacyDrumVariant {
  const percHits = ([3, 5, 7, 9] as const)[g8 & 0b11];
  const percRotation = ((g8 >> 2) & 0b11) as 0 | 1 | 2 | 3;
  const metalStart = ([3, 4, 5, 6] as const)[(g8 >> 4) & 0b11];
  const fillPeriodBars = (g8 >> 6) & 1 ? 8 : 4;
  const kickStep14 = ((g8 >> 7) & 1) === 1;
  return { percHits, percRotation, metalStart, fillPeriodBars, kickStep14 };
}

/** legacy perc 레이어가 치는 16스텝. 유클리드 패턴이라 한 번에 정해진다(예전엔 마디마다
 *  독립적으로 rng()를 굴렸지만, 정해진 유클리드 패턴 하나가 legacy 전체에서 고정으로 쓰인다). */
export function legacyPercSteps(variant: LegacyDrumVariant): boolean[] {
  return euclideanPattern(variant.percHits, STEPS, variant.percRotation);
}

/**
 * fourFloor 킥 패턴(§7.2): 스텝 0·4·8·12가 필수, g8의 kickStep14 비트로 스텝 14를 더 친다.
 * 옛 fixedDrumLayer()가 항상 냈던 {0,4,8,12}를 대신한다 — 시드마다 스텝 14 하나만 다르다.
 */
export function legacyKickPattern(variant: LegacyDrumVariant): boolean[] {
  return Array.from({ length: STEPS }, (_, step) => step % 4 === 0 || (step === 14 && variant.kickStep14));
}

// ================================================================== compute

// §16.4 조성 표. 리프 후보는 반음 오프셋(scale.rootMidi 기준 직접, degreeToMidi를 안 거친다 —
// audioEngine.ts의 리프 재생 코드가 blueprintId==="compute"일 때만 이렇게 해석한다).
const COMPUTE_MODES: readonly { name: string; intervals: number[]; riffCandidates: number[] }[] = [
  { name: "Phrygian", intervals: [0, 1, 3, 5, 7, 8, 10], riffCandidates: [0, 1, 3, -2, 12] },
  { name: "Locrian", intervals: [0, 1, 3, 5, 6, 8, 10], riffCandidates: [0, 1, 3, -2, 12] },
  { name: "Phrygian Dominant", intervals: [0, 1, 4, 5, 7, 8, 10], riffCandidates: [0, 1, 3, -2, 12] },
  // mode 3: 리프 후보에 ♭2(1) 대신 2도(2)
  { name: "Aeolian(♭2 대신 2도)", intervals: [0, 1, 3, 5, 7, 8, 10], riffCandidates: [0, 2, 3, -2, 12] },
];

export function computeScale(genome: Genome): Scale {
  const mode = COMPUTE_MODES[genome.mode];
  return makeScale(genome.key, mode.intervals, mode.name);
}

// riffPitch(390625=5^8)를 8자리 5진수로. 낮은 자리부터.
function base5Digits(value: number, count: number): number[] {
  const digits: number[] = [];
  let remaining = value;
  for (let i = 0; i < count; i++) {
    digits.push(remaining % 5);
    remaining = Math.floor(remaining / 5);
  }
  return digits;
}

/**
 * compute 리프(§16.4): riffRhythm 12비트 = 스텝 1~12 on/off. 스텝 0은 항상 on, 13은 off,
 * 14·15는 on(원곡 리프 끝 연타 모양 고정). **on인 스텝에 순서대로**(스텝 인덱스가 아니라
 * "몇 번째로 켜진 스텝인지"의 카운터) riffPitch의 8자리 후보값을 8개마다 순환해서 붙인다.
 * degree 필드는 스케일 디그리가 아니라 **반음 오프셋**이다(scale.rootMidi + degree,
 * degreeToMidi를 안 거친다) — audioEngine.ts가 blueprintId==="compute"일 때 이렇게 읽는다.
 *
 * ponytail: §11 단계 4에서 발견한 RADICES 순서 문제(§16.3) 때문에 riffPitch는 지금
 * 모든 시드에서 0이다 — 그래서 이 리프는 당분간 항상 근음(반음 0)만 친다. 리듬(어느
 * 스텝을 치는지)은 riffRhythm이 부분 범위로나마 실제로 갈리니 그쪽으로 변주가 난다.
 * riffPitch에 예산을 더 주려면 다른 필드(예: bassShape·drumVariant 비트 수)를 줄여야
 * 한다 — 사용자 확인 없이 그 트레이드오프를 임의로 하지 않는다.
 */
export function computeRiff(genome: Genome): StepCell[] {
  const mode = COMPUTE_MODES[genome.mode];
  const digits = base5Digits(genome.riffPitch, 8);
  const onSteps = new Set<number>([0, 14, 15]);
  for (let step = 1; step <= 12; step++) {
    if ((genome.riffRhythm >> (step - 1)) & 1) onSteps.add(step);
  }
  const cells: StepCell[] = Array.from({ length: STEPS }, () => ({ on: false, degree: 0 }));
  let onIndex = 0;
  for (let step = 0; step < STEPS; step++) {
    if (!onSteps.has(step)) continue;
    cells[step] = { on: true, degree: mode.riffCandidates[digits[onIndex % 8]] };
    onIndex++;
  }
  return cells;
}

const COMPUTE_BASS_RHYTHM_TEMPLATES: readonly number[][] = [
  [0, 2, 7, 8, 13, 15],
  [0, 2, 6, 8, 12, 15],
  [0, 3, 7, 8, 11, 15],
  [0, 2, 4, 7, 8, 13],
];
const COMPUTE_BASS_NEIGHBOR_SETS: readonly number[][] = [
  [0, 3, -1, 1],
  [0, 2, -2, 1],
  [0, 1, -2, 5],
  [0, 3, -2, 7],
];
const COMPUTE_BASS_NEIGHBOR_ORDER = [0, 1, 2, 3, 0, 0];
const COMPUTE_BASS_JUMP_STEP: readonly (number | null)[] = [15, 13, 7, null];

/** compute 베이스(§16.4). degree도 반음 오프셋이다(리프와 같은 해석). */
export function computeBass(genome: Genome): StepCell[] {
  const bits = genome.bassShape;
  const rhythm = COMPUTE_BASS_RHYTHM_TEMPLATES[bits & 0b11];
  const neighbors = COMPUTE_BASS_NEIGHBOR_SETS[(bits >> 2) & 0b11];
  const jumpStep = COMPUTE_BASS_JUMP_STEP[(bits >> 4) & 0b11];
  const cells: StepCell[] = Array.from({ length: STEPS }, () => ({ on: false, degree: 0 }));
  rhythm.forEach((step, i) => {
    const base = neighbors[COMPUTE_BASS_NEIGHBOR_ORDER[i % COMPUTE_BASS_NEIGHBOR_ORDER.length]];
    cells[step] = { on: true, degree: step === jumpStep ? base + 12 : base };
  });
  return cells;
}

// ---- compute 드럼 계열 (§7.2, §16.4 표 compute 열) ----

const LOWSEQ16_PICKUP: readonly number[][] = [[1, 3], [1, 11], [3, 9], [1, 3, 9]];
const LOWSEQ16_BACKBEAT: readonly number[][] = [[6, 10, 14], [2, 6, 10], [6, 14], [2, 6, 10, 14]];

/**
 * compute A계열(§4.4): 필수 0·4·8·12 + g8이 고른 16분 픽업 두어 자리 + 8분 뒷박 자리.
 * `barInCycle`(0~3)로 4마디 주기 끝 모양을 살짝 바꾼다(§4.4 실측: 마디마다 끝부분이
 * 조금씩 다르다).
 *
 * ponytail: §16.4 표의 4마디 주기 변형 4종을 문구 그대로 다 옮기지 않고, 같은 비트로
 * "그 주기의 어느 마디에 스텝 하나를 더하거나 빼는지"만 간단히 구현했다 — 청취로 다듬을
 * 여지가 있다(§11 단계 6 청취 확인에서).
 */
export function lowSeq16Mask(g8: number, barInCycle: number): boolean[] {
  const steps = new Set<number>([0, 4, 8, 12, ...LOWSEQ16_PICKUP[g8 & 0b11], ...LOWSEQ16_BACKBEAT[(g8 >> 2) & 0b11]]);
  const cycle = (g8 >> 4) & 0b11;
  const bar = barInCycle % 4;
  if (cycle === 0) {
    if (bar === 1) steps.delete(14);
    if (bar === 3) steps.add(15);
  } else if (cycle === 1) {
    if (bar === 3) {
      steps.add(13);
      steps.add(15);
    }
  } else if (cycle === 2) {
    if (bar === 1) steps.delete(10);
  } else {
    if (bar === 1 || bar === 3) steps.add(15);
  }
  return Array.from({ length: STEPS }, (_, i) => steps.has(i));
}

/** fourFloor(§7.2): 0·4·8·12 필수. g8 비트6로 스텝15 픽업 주기(2마디/4마디), 비트7로
 *  고스트 위치(스텝6/9, 세기만 낮다 — 마스크엔 포함하되 velocity는 audioEngine에서 낮춘다). */
export function fourFloorMask(g8: number, barIndex: number): boolean[] {
  const steps = new Set<number>([0, 4, 8, 12]);
  const pickupEvery = (g8 >> 6) & 1 ? 2 : 4;
  if (barIndex % pickupEvery === pickupEvery - 1) steps.add(15);
  return Array.from({ length: STEPS }, (_, i) => steps.has(i));
}

/** fourFloor 고스트 스텝(세기 0.3짜리). §16.4 표 compute 비트7. */
export function fourFloorGhostStep(g8: number): 6 | 9 {
  return (g8 >> 7) & 1 ? 6 : 9;
}

/**
 * burst16(§4.4 C계열): 앞쪽이 8분 위주로 촘촘하고(측정 `X.X.o.X.XX......`) 뒤쪽 5스텝은
 * 비운다. g8로 세부를 흔들 여지는 있지만(§16.4는 burst16 자체 비트를 안 정했다), 지금은
 * 측정 패턴 하나로 고정한다 — 버스트는 4마디뿐이라 변주보다 원곡 재현이 우선이다.
 */
export function burst16Mask(): boolean[] {
  return Array.from({ length: STEPS }, (_, i) => i < 10 && (i % 2 === 0 || i === 9));
}

// ================================================================== metropolis

const METROPOLIS_MODES: readonly { name: string; intervals: number[]; harmonyShifts: [number, number] }[] = [
  { name: "Aeolian", intervals: [0, 2, 3, 5, 7, 8, 10], harmonyShifts: [3, 5] },
  { name: "Dorian", intervals: [0, 2, 3, 5, 7, 9, 10], harmonyShifts: [2, 5] },
  { name: "Harmonic Minor", intervals: [0, 2, 3, 5, 7, 8, 11], harmonyShifts: [5, 7] },
  { name: "Phrygian", intervals: [0, 1, 3, 5, 7, 8, 10], harmonyShifts: [3, 7] },
];
const METROPOLIS_RIFF_DEGREES: readonly number[] = [0, 3, 4, 5, 7]; // 1·4·5·6·8도

export function metropolisScale(genome: Genome): Scale {
  const mode = METROPOLIS_MODES[genome.mode];
  return makeScale(genome.key, mode.intervals, mode.name);
}

/** §5.10의 32마디(3분판은 16마디, §6.4) 주기 화성 이동 폭. genome.mode가 후보 4개 중 고른다. */
export function metropolisHarmonyShifts(genome: Genome): [number, number] {
  return METROPOLIS_MODES[genome.mode].harmonyShifts;
}

/** riffPitch 8자리를 metropolis 리프 후보(1·4·5·6·8도)로 읽은 스케일 디그리 8개.
 *  seq 레이어와 베이스가 같이 쓴다(§4.7: 베이스가 리프의 8분 뼈대를 따라간다). */
export function metropolisRiffDegrees(genome: Genome): number[] {
  const digits = base5Digits(genome.riffPitch, 8);
  return digits.map((d) => METROPOLIS_RIFF_DEGREES[d]);
}

/**
 * metropolis seq(§16.4): riffRhythm 비트 0~7 = 8분 음 i(0~7, 스텝 i*2)를 16분 두 번 칠지
 * (1) 8분 한 번 + 쉼(0)인지. 비트 8~11 = 4박(스텝 0/4/8/12 기준 그룹) 강세 1.0 대 0.8.
 */
export function metropolisSeq(genome: Genome): StepCell[] {
  const degrees = metropolisRiffDegrees(genome);
  const bits = genome.riffRhythm;
  const cells: StepCell[] = Array.from({ length: STEPS }, () => ({ on: false, degree: 0 }));
  for (let i = 0; i < 8; i++) {
    const step = i * 2;
    const doubled = (bits >> i) & 1;
    cells[step] = { on: true, degree: degrees[i] };
    if (doubled && step + 1 < STEPS) cells[step + 1] = { on: true, degree: degrees[i] };
  }
  return cells;
}

/** seq 강세(1.0/0.8). 스텝을 4로 나눈 박(0~3)마다 비트 8~11 중 하나. */
export function metropolisSeqAccent(genome: Genome, step: number): number {
  const beat = Math.floor(step / 4);
  return (genome.riffRhythm >> (8 + beat)) & 1 ? 1 : 0.8;
}

const METRO_BASS_GATE: readonly number[] = [0.9, 1.4, 1.8, 0.6];
const METRO_BASS_RESTS: readonly number[][] = [[], [6], [10], [6, 14]];

// degreeToMidi의 degree 단위(스케일 인덱스, 옥타브=len칸)로 -1/-2옥타브를 표현한다.
// metropolis 모드는 전부 7음 음계라 len=7 — 반음이 아니라 "칸 수"라서 -7/-14다.
function metropolisBassOctave(bits: number, step: number): -7 | -14 {
  const mode = bits & 0b11;
  if (mode === 0) return -7;
  if (mode === 1) return -14;
  if (mode === 2) return step === 12 ? -14 : -7;
  return step === 0 ? -7 : -14;
}

/** metropolis 베이스(§16.4): 리프 8분 뼈대(스텝 0,2,…,14)를 옥타브 내려 따라간다. */
export function metropolisBass(genome: Genome): { cells: StepCell[]; gateBeats: number } {
  const degrees = metropolisRiffDegrees(genome);
  const bits = genome.bassShape;
  const rests = new Set(METRO_BASS_RESTS[(bits >> 4) & 0b11]);
  const cells: StepCell[] = Array.from({ length: STEPS }, () => ({ on: false, degree: 0 }));
  for (let i = 0; i < 8; i++) {
    const step = i * 2;
    if (rests.has(step)) continue;
    cells[step] = { on: true, degree: degrees[i] + metropolisBassOctave(bits, step) };
  }
  return { cells, gateBeats: METRO_BASS_GATE[(bits >> 2) & 0b11] };
}

// ---- metropolis 드럼 계열 (§7.2, §16.4 표 metropolis 열) ----

/** fourFloor + 2·4박 클랩(스네어)은 legacy와 같은 필수 스텝. g8은 halfBar8 필 세부에만 쓰인다
 *  (아래 halfBar8FillSteps). 메인 킥 자체엔 legacy 같은 선택 스텝이 없어서 항상 {0,4,8,12}다. */
export function metropolisFourFloorKick(): boolean[] {
  return Array.from({ length: STEPS }, (_, i) => i % 4 === 0);
}

const HALFBAR8_EXTRA: readonly number[][] = [[2, 6], [6], [2, 6, 7], [2, 3, 6]];

/** halfBar8 필(§6.4 mainA2 등)의 스텝: 기본 0·2·4·6 + g8이 고른 추가 스텝. */
export function halfBar8FillSteps(g8: number): number[] {
  return Array.from(new Set([0, 2, 4, 6, ...HALFBAR8_EXTRA[g8 & 0b11]])).sort((a, b) => a - b);
}

const HALFTIME_THIRD_KICK: readonly number[] = [14, 10, 11, 15];

/** halfTime(§4.6/§6.4 breakdown): 킥 0·8 필수 + g8이 고른 세 번째 킥 자리. */
export function halfTimeMask(g8: number): boolean[] {
  const third = HALFTIME_THIRD_KICK[(g8 >> 2) & 0b11];
  const steps = new Set([0, 8, third]);
  return Array.from({ length: STEPS }, (_, i) => steps.has(i));
}

/** pulse2(§5.4 인트로 펄스): g8 비트7로 2·10 또는 0·8. */
export function pulse2Steps(g8: number): [number, number] {
  return (g8 >> 7) & 1 ? [2, 10] : [0, 8];
}

// ---- 드럼 계열 → 실제로 어느 역할(DrumRole)이 어느 스텝에서 치는지 (compute/metropolis 공용) ----

/**
 * drumFamily 하나를 실제 타격 역할·스텝으로 푼다. legacy("none")는 이 함수를 안 쓴다 —
 * legacy는 §11 단계 5까지 만든 자기 경로(Pattern.drum.kick, PatternOverride)를 그대로 쓴다.
 *
 * ponytail: burst16은 실측(§4.4 C계열)이 lowDrum·drumTone·noise·hat 네 레이어가 동시에
 * 촘촘히 친다 — 지금은 kick 역할 하나로 단순화했다. §11 단계 6 청취 확인 후 더 채울 수
 * 있다. pulse2는 kick이 아니라 tick 역할이다(§4.2/§16.7: pulse2 = 2분음표 틱).
 */
export function familyDrumHit(
  family: DrumFamily,
  genome: Genome,
  barIndex: number
): { role: "kick" | "lowDrum" | "tick"; mask: boolean[] } | null {
  switch (family) {
    case "lowSeq16":
      return { role: "lowDrum", mask: lowSeq16Mask(genome.drumVariant, barIndex % 4) };
    case "fourFloor":
    case "fourFloorCut":
      return { role: "kick", mask: fourFloorMask(genome.drumVariant, barIndex) };
    case "burst16":
      return { role: "kick", mask: burst16Mask() };
    case "halfTime":
      return { role: "kick", mask: halfTimeMask(genome.drumVariant) };
    case "pulse2": {
      const [a, b] = pulse2Steps(genome.drumVariant);
      const mask = Array.from({ length: STEPS }, (_, i) => i === a || i === b);
      return { role: "tick", mask };
    }
    case "none":
      return null;
  }
}
