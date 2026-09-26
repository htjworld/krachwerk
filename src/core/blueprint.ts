// 블루프린트: 곡의 구조(섹션 순서, 레이어 진입/퇴장, 박자 쪼개기, 드럼 계열)를 담는
// 선언적 데이터. 명세 §6.2. 시드(게놈)는 이 안에서 세부만 바꾸고, 큰 흐름은 블루프린트가
// 고정한다.
//
// 기존 TEMPLATES(SectionSpec[][], arrangement.ts)는 이 스키마로 옮겨
// `src/core/blueprints/legacy.ts`에 classicBuild/slowBurn/doubleDrop으로 남는다.
// 기존 스키마(SectionSpec)는 없앴다 (두 형식을 같이 두지 않는다).

export type LayerId =
  | "kick"
  | "hat"
  | "openHat"
  | "backbeat"
  | "perc"
  | "metal"
  | "bass"
  | "lead"
  | "arp"
  | "stab"
  | "pad"
  | "riser"
  | "lowDrum"
  | "clap"
  | "tom"
  | "tick"
  | "sig"
  | "seqRiff"
  | "seqRun"
  | "calls"
  | "glide"
  | "drone";

/** 음표 단위. 0=쉼(레이어는 켜져 있지만 안 친다), 1=온음표, 2=2분, 4=4분, 8=8분, 16=16분.
 *  셋잇단은 두 곡 모두 없어서 넣지 않는다. */
export type Rate = 0 | 1 | 2 | 4 | 8 | 16;

/** 햇 전용 모양. 분석에서 나온 세 가지. */
export type HatShape =
  | "offbeat8" // 스텝 2·6·10·14 강 + 3·7·11·15 고스트 (A-hat-8)
  | "holes16" // 16분에서 5·9·13 비움 (A-hat-16)
  | "dense16"; // 16분에서 5·13만 비움 (M-hat-dense)

export interface RateStep {
  atBar: number; // 섹션 시작 기준 마디
  rate: Rate;
  hatShape?: HatShape; // layer가 hat일 때만
  /**
   * §14.2 A(Grids 발상): priority와 짝을 이룬다. 0~255. `priority[step] > 255 - density`인
   * 스텝만 친다. density가 클수록 중요도 높은 스텝부터 켜진 채로 스텝이 늘어난다(부분집합
   * 보장) — compute/metropolis 데이터는 §11 단계 6에서 실측 priority 표와 함께 채운다.
   */
  density?: number;
  /** density와 짝을 이루는 16스텝 중요도(0~255). 없으면 density는 무시된다. */
  priority?: readonly number[];
  /**
   * ponytail: legacy 전용 탈출구. 옛 엔진의 hatOn()/베이스/아르페지오 게이트가 연속값
   * intensity의 4단계 문턱값으로 정해져 있어서(§4.10, §5.10에서 측정한 compute/metropolis의
   * 이산적인 rate/hatShape 어휘로는 못 담는 밴드가 있다), 16스텝 on/off를 그대로 박아 넣는다.
   * 있으면 rate/hatShape/density보다 우선한다. compute/metropolis 블루프린트는 안 쓴다.
   */
  mask?: readonly boolean[];
}

export interface LayerCue {
  layer: LayerId;
  enterBar: number; // 섹션 기준. 섹션 중간 진입 허용 (L5)
  enterStep?: number; // 진입 마디 안의 시작 스텝 (반 마디 픽업 = 8)
  exitBarsBeforeEnd: number; // 0이면 끝까지
  rateSteps: RateStep[]; // (L1, L2). rate가 이 레이어의 스텝 선택에 안 쓰이면(kick 등 원래
  // 패턴대로 치는 레이어) 더미 [{atBar:0, rate:16}] 하나만 둔다.
  /** 마디 안에서 칠 수 있는 스텝 범위 (L10). B'계열 = [0, 10] */
  window?: [from: number, to: number];
}

export type FillKind =
  | "none"
  | "halfBar8" // metropolis M-fill: 앞 반 마디 킥+스네어 8분
  | "stepFill" // compute T-fill: 스텝 7·8·9·10·12·13·14
  | "stop" // 첫 박만 치고 비움
  | "roll13" // 16분 연타, 스텝 13 이후 비움 (R1)
  | "pickup15" // 킥 스텝 15 한 번
  // legacy 4종 (옛 fillKind 0~2 + "double backbeat"). §16.7 6번.
  | "legacyTom"
  | "legacySnare"
  | "legacyMetal"
  | "legacyDouble";

export type DrumFamily =
  | "none"
  | "lowSeq16" // compute A: 저음 드럼 16분 싱코페이션, 4마디 주기 끝 모양 변화
  | "fourFloor" // compute B / metropolis 메인
  | "fourFloorCut" // compute B': fourFloor + 스텝 창 제한
  | "burst16" // compute C
  | "halfTime" // metropolis 브레이크: 킥 0·8·14
  | "pulse2"; // metropolis 인트로: 2분음표 틱

export interface BlueprintSection {
  id: string;
  /** 3분(약 92마디 @122BPM) 기준 마디 수. 길이 게놈으로 비율 조정 (§8.2).
   *  legacy 3종은 옛 SectionSpec.weight 값을 그대로 옮겼다(이미 92로 합산돼 있었다). */
  bars: number;
  /**
   * ponytail: §6.2 코드 블록엔 없지만 §16.7 8번이 "compute·metropolis 섹션에도 intensity를
   * 데이터로 적어 넣는다"고 못 박아서 실질적으로 모든 블루프린트가 쓰는 값이다. 옛 엔진의
   * 여러 연속값 공식(메탈 확률, 킥 보강, 사이드체인 깊이, 섹션 게인)이 여기 바로 물려 있다.
   * 0~1. legacy는 옛 SectionSpec.intensity 그대로.
   */
  intensity: number;
  freeTime?: boolean; // 박 없음 (metropolis M0)
  transpose?: number; // 반음. compute 버스트 +1, 리프라이즈 −2
  cues: LayerCue[];
  drumFamily: DrumFamily;
  fill: { everyBars: number; kind: FillKind; atBarInCycle: number }[]; // 예: {4, "halfBar8", 3}
  endFill?: FillKind; // 섹션 마지막 마디 전용
  filter: { from: number; to: number };
  /** 킥 저역 컷 (metropolis 아웃트로). 0=없음, 1=초저역 완전 제거 */
  kickLowCut?: { from: number; to: number };
  /** 시퀀서 옥타브 이동 (metropolis 브레이크 +12) */
  seqOctave?: number;
  /** 섹션 안 화성 이동. 음정 레이어 전체를 반음 단위로 평행 이동한다 (metropolis 32마디 주기).
   *  atStep 8이면 마디 한가운데서 바뀐다. transpose와 더해진다. */
  harmony?: { atBar: number; atStep: 0 | 8; semitones: number }[];
  /** 섹션 마스터 게인 보정(dB). compute 버스트 +4, metropolis 브레이크 +2 */
  gainDb?: number;
  /** 신스 스테레오 폭 0~1 (1 = 아주 넓음). metropolis 인트로·브레이크 1, 메인 0.4 */
  synthWidth?: number;
}

export type BlueprintId = "compute" | "metropolis" | "classicBuild" | "slowBurn" | "doubleDrop";

export interface Blueprint {
  id: BlueprintId;
  tempoRange: [number, number]; // 정수 BPM 16개 폭 (§9.2 g4)
  /** 홀수 16분 스텝을 16분 길이의 몇 %만큼 늦출지. compute 0, metropolis 0.04 */
  swing: number;
  sections: BlueprintSection[];
}

// ---------------------------------------------------------------- 해석 (§7.1)

/** rate 격자: 이 스텝이 그 음표 단위의 자리인지. §7.1. mask가 있는 RateStep은
 *  rateStepActive에서 이쪽을 아예 안 거친다. */
function rateGridHas(rate: Rate, step: number): boolean {
  switch (rate) {
    case 0:
      return false;
    case 1:
      return step === 0;
    case 2:
      return step === 0 || step === 8;
    case 4:
      return step % 4 === 0;
    case 8:
      return step % 2 === 0;
    case 16:
      return true;
  }
}

// §6.2 hatShape의 on/off. 주석이 그대로 정의다. 세기(강/고스트)는 지금처럼
// downbeat/짝수/홀수 기반 공식이 정하고(§11 단계 6에서 실측 세기로 다듬을 수 있다), 여기서는
// "이 스텝을 치는가"만 표현한다.
const HAT_SHAPE_STEPS: Record<HatShape, readonly boolean[]> = {
  offbeat8: [false, false, true, true, false, false, true, true, false, false, true, true, false, false, true, true],
  holes16: [true, true, true, true, true, false, true, true, true, false, true, true, true, false, true, true],
  dense16: [true, true, true, true, true, false, true, true, true, true, true, true, true, false, true, true],
};

/** RateStep 하나가 이 스텝에서 켜지는지. 우선순위: mask > (priority+density) > hatShape > rate 격자. */
export function rateStepActive(rateStep: RateStep, step: number): boolean {
  if (rateStep.mask) return rateStep.mask[step];
  if (rateStep.priority && rateStep.density !== undefined) return rateStep.priority[step] > 255 - rateStep.density;
  if (rateStep.hatShape) return HAT_SHAPE_STEPS[rateStep.hatShape][step];
  return rateGridHas(rateStep.rate, step);
}

/** 큐의 rateSteps 중 이 마디(섹션 기준 sectionBar)에 적용되는 것: atBar가 sectionBar
 *  이하인 것 중 가장 늦게 시작한 것. rateSteps가 비어 있을 리 없지만(§16.1 계약), 방어적으로
 *  null도 돌려준다. */
export function rateAt(cue: LayerCue, sectionBar: number): RateStep | null {
  let found: RateStep | null = null;
  for (const step of cue.rateSteps) {
    if (step.atBar <= sectionBar && (found === null || step.atBar > found.atBar)) found = step;
  }
  return found;
}

/** 섹션에서 특정 레이어의 큐. enterBar/exitBarsBeforeEnd로 활성 구간 밖이면 null
 *  (그 레이어는 이 마디에 안 켜져 있다). 옛 `section.layers.includes(id)`를 대신한다. */
export function cueFor(section: BlueprintSection, layer: LayerId, sectionBar: number): LayerCue | null {
  const cue = section.cues.find((c) => c.layer === layer);
  if (!cue) return null;
  if (sectionBar < cue.enterBar) return null;
  if (sectionBar >= section.bars - cue.exitBarsBeforeEnd) return null;
  return cue;
}

/**
 * cueFor에 스텝 단위 게이트 두 개를 더한 것 (§11 단계 3, L5/L10):
 *  - enterStep: 큐가 활성화되는 첫 마디(sectionBar === enterBar)에서만, 그 스텝 전은 죽인다
 *    (반 마디 픽업 진입 같은 것). 이후 마디는 영향 없다.
 *  - window: 마디 안에서 칠 수 있는 스텝 범위 밖이면 죽인다 (B'계열처럼 뒤쪽을 비우는 것).
 * 드럼/신스 가리지 않고 스텝 단위로 "이 레이어가 지금 여기 있는가"를 물을 땐 이걸 쓴다.
 */
export function cueActiveAtStep(
  section: BlueprintSection,
  layer: LayerId,
  sectionBar: number,
  step: number
): LayerCue | null {
  const cue = cueFor(section, layer, sectionBar);
  if (!cue) return null;
  if (sectionBar === cue.enterBar && cue.enterStep !== undefined && step < cue.enterStep) return null;
  if (cue.window && (step < cue.window[0] || step > cue.window[1])) return null;
  return cue;
}

/**
 * 섹션의 transpose(고정 반음)와 harmony(마디·스텝 단위로 바뀌는 반음)를 합친 총 반음 이동.
 * harmony는 (atBar, atStep) 사전식으로 지금 위치보다 앞서거나 같은 것 중 가장 늦은 걸 쓴다
 * (rateAt과 같은 "마지막 값" 규칙). 반환값을 `freq *= 2 ** (semitones / 12)`로 곱하면 된다.
 */
export function semitoneShift(section: BlueprintSection, sectionBar: number, step: number): number {
  let shift = section.transpose ?? 0;
  if (!section.harmony) return shift;
  let bestBar = -1;
  let bestStep = -1;
  for (const h of section.harmony) {
    const reached = h.atBar < sectionBar || (h.atBar === sectionBar && h.atStep <= step);
    if (!reached) continue;
    if (h.atBar > bestBar || (h.atBar === bestBar && h.atStep > bestStep)) {
      bestBar = h.atBar;
      bestStep = h.atStep;
      shift = (section.transpose ?? 0) + h.semitones;
    }
  }
  return shift;
}

/**
 * FillKind 하나가 어느 스텝을 치는지 (§11 단계 3). legacy 4종(legacyTom 등)은 audioEngine.ts가
 * 옛 rng() 기반 분기로 직접 처리하므로 여기선 빈 배열이다 — 그쪽 fillKind 선택 자체가
 * "매 필 마디마다 무작위로 하나"라서 정적인 스텝 목록으로 못 담는다(§16.7 6번).
 */
export function fillSteps(kind: FillKind): readonly number[] {
  switch (kind) {
    case "none":
      return [];
    case "stop":
      return [0];
    case "roll13":
      return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
    case "pickup15":
      return [15];
    case "halfBar8": // metropolis M-fill: 앞 반 마디 8분
      return [0, 2, 4, 6];
    case "stepFill": // compute T-fill: 스텝 7·8·9·10·12·13·14
      return [7, 8, 9, 10, 12, 13, 14];
    case "legacyTom":
    case "legacySnare":
    case "legacyMetal":
    case "legacyDouble":
      return [];
  }
}

// ---------------------------------------------------------------- 유클리드 리듬 (§14.2 H)

// Orca의 Bresenham식 한 줄 공식(MIT). k개 타격을 n스텝에 최대한 고르게 편다.
// 재귀도 표도 없이 O(1)이라 매 스텝 그냥 불러도 된다.
export function euclideanHit(k: number, n: number, step: number): boolean {
  if (k <= 0) return false;
  if (k >= n) return true;
  return ((k * (step + n - 1)) % n) + k >= n;
}

/** rotation번째 타격이 스텝 0에 오도록 돌린 n스텝 유클리드 패턴. */
export function euclideanPattern(k: number, n: number, rotation: number): boolean[] {
  const base = Array.from({ length: n }, (_, i) => euclideanHit(k, n, i));
  const hitSteps = base.reduce<number[]>((acc, hit, i) => (hit ? [...acc, i] : acc), []);
  if (hitSteps.length === 0) return base;
  const pivot = hitSteps[rotation % hitSteps.length];
  return Array.from({ length: n }, (_, i) => base[(i + pivot) % n]);
}
