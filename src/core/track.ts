import { mulberry32, pick } from "./prng";
import { STEP_COUNT, type Pattern, type StepCell } from "./pattern";
import type { SampleId } from "./samples";
import { legacyDrumVariantFor, legacyPercSteps } from "./motifs";

// generatePattern이 뽑는 것(템포, 스케일, 보이스, 16스텝 베이스/리드)은 시드의 정체성이자
// 매트릭스 에디터의 편집 대상이라 손대지 않는다. 3분짜리 편곡에 더 필요한 재료
// (드럼 킷 선택, 두 번째 프레이즈, 아르페지오, 코드, 악센트)는 여기서 별도의 난수열로 뽑는다.
// 시드 하나에서 결정론적으로 나오는 건 똑같다.
const TRACK_SALT = 0x9e3779b9;

const KICKS: SampleId[] = ["kickTight", "kickMid", "kickLong"];
const BACKBEATS: SampleId[] = ["clap", "snare", "snareTight", "rim"];
const SHAKERS: SampleId[] = ["maraca", "clave", "congaHigh", "cowbell"];
const METALS: SampleId[] = [
  "anvil1",
  "anvil2",
  "brake1",
  "brake2",
  "logLow",
  "logHigh",
  "slapstick",
  "ratchet",
  "agogoHigh",
  "agogoLow",
];

export interface Track {
  kick: SampleId;
  backbeat: SampleId;
  shaker: SampleId;
  metalA: SampleId;
  metalB: SampleId;
  /** 셰이커/퍼커션이 들어가는 16스텝. §11 단계 5부터 게놈 drumVariant의 유클리드 패턴이다. */
  percSteps: boolean[];
  /** 금속 타격음이 들어갈 후보 스텝 두 자리. 게놈 drumVariant에서 나온다(§16.4). */
  metalSteps: [number, number];
  /** legacy 필 주기(마디). 게놈 drumVariant에서 나온다(§16.4) — 예전엔 8로 고정이었다. */
  fillPeriodBars: 4 | 8;
  /** 베이스가 한 옥타브 위로 튀는 스텝 */
  bassOctave: boolean[];
  /** 벨로시티가 세지는 스텝 */
  accent: boolean[];
  /** 리드의 두 번째 프레이즈. 한 프레이즈만 반복하면 3분을 못 버틴다. */
  leadB: StepCell[];
  /** 16분음표 아르페지오가 훑는 스케일 디그리 */
  arp: number[];
  /** 코드 스탭이 쓰는 디그리 3개 */
  chord: [number, number, number];
  /** 코드 진행(섹션 안에서 4마디마다 루트가 이 값만큼 움직인다) */
  progression: number[];
}

export function deriveTrack(pattern: Pattern): Track {
  const rng = mulberry32((pattern.seedHash ^ TRACK_SALT) >>> 0);
  const drumVariant = legacyDrumVariantFor(pattern.genome.drumVariant);

  const metalA = pick(rng, METALS);
  let metalB = pick(rng, METALS);
  while (metalB === metalA) metalB = pick(rng, METALS);

  const bassOctave = Array.from({ length: STEP_COUNT }, () => rng() < 0.18);
  const accent = Array.from({ length: STEP_COUNT }, (_, i) => (i % 8 === 0 ? true : rng() < 0.22));

  const leadB: StepCell[] = Array.from({ length: STEP_COUNT }, () => ({
    degree: Math.floor(rng() * 10) - 2,
    on: rng() < 0.45,
  }));

  // 아르페지오는 완전 무작위보다 삼화음 위아래를 훑는 쪽이 음악적으로 붙는다.
  const arpShape = pick(rng, [
    [0, 2, 4, 7],
    [0, 4, 2, 7],
    [0, 2, 4, 2],
    [7, 4, 2, 0],
  ]);
  const arpOffset = pick(rng, [0, 0, 0, -2, 1]);
  const arp = Array.from({ length: STEP_COUNT }, (_, i) => arpShape[i % arpShape.length] + arpOffset);

  const chordRoot = pick(rng, [0, 0, -2, 3]);
  const chord: [number, number, number] = [chordRoot, chordRoot + 2, chordRoot + 4];

  const progression = pick(rng, [
    [0, 0, 0, 0],
    [0, 0, 3, 2],
    [0, -2, 3, 0],
    [0, 4, 2, -1],
  ]);

  return {
    kick: pick(rng, KICKS),
    backbeat: pick(rng, BACKBEATS),
    shaker: pick(rng, SHAKERS),
    metalA,
    metalB,
    percSteps: legacyPercSteps(drumVariant),
    metalSteps: [drumVariant.metalStart, drumVariant.metalStart + 8],
    fillPeriodBars: drumVariant.fillPeriodBars,
    bassOctave,
    accent,
    leadB,
    arp,
    chord,
    progression,
  };
}
