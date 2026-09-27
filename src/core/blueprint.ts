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
  | "drone"
  // ---- 260927 아티스트 스타일 확장(§6.4) ----
  | "chop" // p 찬트 / f 목소리 조각
  | "dialogue" // d 대사
  | "chord" // d 신스 코드 / p 건반·오르간 / f 패드·피아노
  | "texture" // d 테이프 히스 / f 일상 소리 베드
  | "sub" // f switchUp의 808 서브
  | "clapLayer"; // f 빌드업 클랩(킥 없는 구간 전용)

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
  /**
   * 260927 §6.1 신규. 스텝별 세기 0~1 (측정 세기표, §7.3). 없으면 v2 공식(강/고스트 등
   * downbeat 기반 계산)을 그대로 쓴다. 길이는 section의 stepsPerBar와 같아야 한다.
   */
  velocity?: readonly number[];
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
  /**
   * 260927 §6.1 신규. 마디마다 이 확률로만 켜진다(hashRand(seedHash, LAYER_SALT, 곡 마디, 0)
   * < barGate). 신스가 한 마디씩 띄엄띄엄 끼어드는 Delroy 구조(§4.1 D15: Promise 16마디 중
   * 5마디, Trigger 9마디 중 4마디), Fred 목소리 조각 등에 쓴다. 없으면 항상 켜져 있다(1과 같다).
   */
  barGate?: number;
  /**
   * 260927 §6.1 신규. 섹션-로컬 마디 번호 목록. 이 마디에서는 레이어를 끈다(베이스가
   * 한 마디씩 비는 §4.3 F15, Wild Animal 34·36마디). barGate와 달리 결정론적으로 고정된
   * 자리다.
   */
  skipBars?: number[];
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
  | "legacyDouble"
  // 260927 §6.1 신규.
  | "cut" // 첫 박 이후 전 레이어 정지 (Delroy 끝)
  | "snareRoll16"; // 중역 타악 16분 전부, 세기 0.4→1.0 선형 (Peggy 빌드)

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
  /** 시그니처 사운드(§15.2)가 한 번씩 울리는 섹션-로컬 마디 인덱스. compute/metropolis만 쓴다. */
  sigSlots?: number[];
  /** 260927 §6.1 신규. 이 섹션 동안 드럼 킷을 바꾼다(Fred switchUp 비트 전환). */
  kitSwap?: "sub808";
  /** 260927 §6.1 신규. 이 섹션 드럼 버스 게인 보정(dB). Trigger 인트로의 약한 드럼,
   *  Delilah 드롭 복귀 구간의 눌린 드럼 등. */
  drumGainDb?: number;
  /** 260927 §6.1 신규. 이 섹션 드럼 전 레이어를 16분 N칸 뒤로 민다(Delilah D13–D14: 비트
   *  전환 뒤 끝까지 한 칸 밀린 채로 간다). 신스·베이스는 안 민다. */
  beatShift?: number;
  /**
   * 260927 §13.3 신규. 이 섹션에서 해당 레이어의 필수 스텝을 이 목록으로 통째로 바꾼다
   * (clubHouse halfBeat: kick·clap이 스텝 4·12만, switchUp halfFeel: 스네어가 스텝 8만).
   * styleDrumMaps가 만든 기본 맵보다 우선한다.
   */
  drumOverride?: Partial<Record<LayerId, number[]>>;
  /** 260927 신규(창의성 감사 후 추가). 이 섹션의 `chord`는 진행표를 순환하지 않고 진행표의
   *  고정 브레이크 코드 하나를 잡는다(§7.4 "브레이크" 열 — halfBeat·breakdown 등). */
  chordBreak?: boolean;
}

export type BlueprintId =
  // open (v2, 불변)
  | "compute"
  | "metropolis"
  | "classicBuild"
  | "slowBurn"
  | "doubleDrop"
  // k
  | "computeK"
  | "metropolisK"
  // d
  | "tapeJam"
  | "fourFloorJam"
  | "beachDemo"
  | "shuffle12"
  // p
  | "clubHouse"
  | "slowJam"
  // f
  | "garageShuffle"
  | "halfStep"
  | "switchUp";

/** open = 기본 코드(8자)가 쓰는 기존 5개 블루프린트. 나머지는 얼굴 버튼(스타일 코드)
 *  전용이다(§6.1). */
export type StyleId = "open" | "k" | "d" | "p" | "f";

export interface Blueprint {
  id: BlueprintId;
  /** 260927 §6.1 신규. 이 블루프린트가 속한 스타일 — 블루프린트 집합이 스타일끼리
   *  겹치지 않는다는 유일성 증명(§5.5)의 근거다. */
  style: StyleId;
  tempoRange: [number, number]; // 정수 BPM 16개 폭 (§9.2 g4)
  /** 홀수 16분 스텝을 16분 길이의 몇 %만큼 늦출지. compute 0, metropolis 0.04 */
  swing: number;
  sections: BlueprintSection[];
  /**
   * 260927 §6.1 신규. 실제 BPM = 크로스헤어 템포(tempoRange, 104~132 인코딩) × tempoScale.
   * 기본 1. 크로스헤어 인코딩을 안 바꾸면서 87 BPM(0.75), 102 BPM(0.8), 134 BPM(1.05) 같은
   * 곡을 담는다(R10).
   */
  tempoScale?: number;
  /** 260927 §6.1 신규. 마디당 칸 수. 기본 16. shuffle12만 12(8분 셋잇단, §6.2). */
  stepsPerBar?: 16 | 12;
  /** 260927 §6.1 신규. 길이 조정 반올림 단위(§8.2). 기본 4. compute·Delroy 계열은 2. */
  roundTo?: 2 | 4;
  /** 260927 §6.1 신규. 드럼 원샷 출처. v2 5종은 기존 경로(synthKit/legacy 킷)를 그대로 쓴다
   *  (undefined). */
  kitFamily?: "circuitK" | "skylineK" | "tape" | "house" | "garage";
  /** 260927 §6.1/§6.5 신규. 베이스 전용 사이드체인 버스. 없으면 v2 공유 펌핑 그대로. */
  sidechain?: { synthDb: number; bassDb: number; releaseBeats: number };
  /** 260927 §6.1/§6.5 신규. 마스터 로파이 체인(Delroy). 세부 수치는 게놈 tape가 고른다. */
  lofi?: boolean;
  /** 260927 §6.1 신규. 신스 기본 스테레오 폭(0~1). 섹션 synthWidth가 있으면 그게 우선한다. */
  synthWidth?: number;
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

/**
 * 260927 §6.3: computeK/metropolisK는 v2 compute/metropolis 섹션을 그대로 복사해 쓰므로
 * (kraftwerkK.ts), 드럼 계열·조성·리프 생성(motifs.ts)도 "compute"/"metropolis"와 완전히
 * 같은 로직을 타야 한다 — blueprintId 문자열만 다를 뿐이다. 이 함수 하나로 그 동치 관계를
 * 표현해서, audioEngine.ts/motifs.ts 여기저기서 `=== "compute" || === "computeK"`를
 * 반복하지 않는다.
 */
export function blueprintFamily(id: BlueprintId): "compute" | "metropolis" | null {
  if (id === "compute" || id === "computeK") return "compute";
  if (id === "metropolis" || id === "metropolisK") return "metropolis";
  return null;
}

/** RateStep에 velocity 표가 있으면 그 스텝 값을, 없으면 fallback을 돌려준다(§6.1 신규). */
export function rateStepVelocity(rateStep: RateStep, step: number, fallback: number): number {
  return rateStep.velocity ? rateStep.velocity[step] : fallback;
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
    // 260927 §6.1 신규.
    case "cut": // 첫 박 이후 전 레이어 정지 (Delroy 끝). "stop"과 스텝은 같고 이름만 다르다
      // — v2 "stop"은 곡 중간의 짧은 정지, "cut"은 곡이 끝나며 뚝 끊기는 것이라 뜻이 다르다.
      return [0];
    case "snareRoll16": // 중역 타악 16분 전부. 세기 0.4→1.0 선형 램프는 호출부(§13.6
      // scheduleStyleBar)가 fillSteps 순서(0→15)로 직접 계산한다.
      return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
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
