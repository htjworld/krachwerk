import { mulberry32, pick } from "./prng";
import { STEP_COUNT, type Pattern, type StepCell } from "./pattern";
import type { KitId, SampleId } from "./samples";
import { legacyDrumVariantFor, legacyPercSteps } from "./motifs";

// generatePattern이 뽑는 것(템포, 스케일, 보이스, 16스텝 베이스/리드)은 시드의 정체성이자
// 매트릭스 에디터의 편집 대상이라 손대지 않는다. 3분짜리 편곡에 더 필요한 재료
// (드럼 킷 선택, 두 번째 프레이즈, 아르페지오, 코드, 악센트)는 여기서 별도의 난수열로 뽑는다.
// 시드 하나에서 결정론적으로 나오는 건 똑같다.
const TRACK_SALT = 0x9e3779b9;

// legacy 킷 다양성(§15.3/§15.5): analog808(코어) 외에 uzu-drumkit·Simmons로 킥/스네어/퍼커션
// 세트를 통째로 바꿔 낀다. 하나 고르면 buildRig가 그 킷의 샘플만 받는다(samples.ts).
const KITS: (KitId | null)[] = [null, "legacy-uzu", "legacy-simmons"];

const KICKS_BY_KIT: Record<string, SampleId[]> = {
  core: ["kickTight", "kickMid", "kickLong"],
  "legacy-uzu": ["uzuBd1", "uzuBd2", "uzuBd3", "uzuBd4", "uzuBd5", "uzuBd6", "uzuBd7", "uzuBd8"],
  // 심몬스 팩엔 킥이 없어서(§15.6) uzu 킥을 빌린다.
  "legacy-simmons": ["uzuBd1", "uzuBd2", "uzuBd3", "uzuBd4"],
};
const BACKBEATS_BY_KIT: Record<string, SampleId[]> = {
  core: ["clap", "snare", "snareTight", "rim"],
  "legacy-uzu": ["uzuSd1", "uzuSd2", "uzuSd3", "uzuSd4", "uzuSd5", "uzuCp1", "uzuCp2", "uzuRim1", "uzuRim2"],
  "legacy-simmons": ["freesoundSimmonsSnare1", "freesoundSimmonsSnare2", "freesoundSimmonsSnare3", "freesoundCr78Snare"],
};
const SHAKERS_BY_KIT: Record<string, SampleId[]> = {
  core: ["maraca", "clave", "congaHigh", "cowbell"],
  "legacy-uzu": ["uzuSh1", "uzuTb1", "uzuCb1"],
  "legacy-simmons": ["freesoundSimmonsPerc", "freesoundSimmonsNoise1", "freesoundSimmonsNoise2", "freesoundSimmonsNoise3"],
};
const HATS_BY_KIT: Record<string, SampleId[]> = {
  core: ["hatClosed"],
  "legacy-uzu": ["uzuHh1", "uzuHh2", "uzuHh3", "uzuHh4", "uzuHh5"],
  "legacy-simmons": ["freesoundSimmonsHatClosed"],
};
const OPEN_HATS_BY_KIT: Record<string, SampleId[]> = {
  core: ["hatOpen"],
  "legacy-uzu": ["uzuOh1", "uzuOh2", "uzuOh3", "uzuOh4"],
  "legacy-simmons": ["freesoundSimmonsHatOpen"],
};
// core만 "8마디마다 한 번 더 긴 오픈햇"이 실제로 다른 파일이다(hatOpenLong). 나머지 킷은
// 오픈햇 후보가 하나뿐이거나(심몬스) 그 자리도 그냥 한 번 더 고른다(uzu).
const OPEN_HAT_LONGS_BY_KIT: Record<string, SampleId[]> = {
  core: ["hatOpenLong"],
  "legacy-uzu": OPEN_HATS_BY_KIT["legacy-uzu"],
  "legacy-simmons": ["freesoundSimmonsHatOpen"],
};
const CYMBALS_BY_KIT: Record<string, SampleId[]> = {
  core: ["cymbal"],
  "legacy-uzu": ["uzuCr1", "uzuCr2", "uzuRd1"],
  "legacy-simmons": ["freesoundSimmonsCymbal1", "freesoundSimmonsCymbal2"],
};
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
  /** 킥/스네어/퍼커션 세트를 통째로 바꿔 끼는 킷(§15.3). null이면 코어(analog808). */
  kit: KitId | null;
  kick: SampleId;
  backbeat: SampleId;
  shaker: SampleId;
  hat: SampleId;
  hatOpen: SampleId;
  hatOpenLong: SampleId;
  cymbal: SampleId;
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

  // 킷 선택은 compute/metropolis도 같은 rng 자리를 소비한다(호출 순서를 지키려는 것 —
  // §11 단계 4/5의 교훈). 실제로는 legacy만 킷을 쓴다(kick/backbeat/shaker 풀 선택).
  const kit = pick(rng, KITS);
  const kitKey = kit ?? "core";

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
    kit,
    kick: pick(rng, KICKS_BY_KIT[kitKey]),
    backbeat: pick(rng, BACKBEATS_BY_KIT[kitKey]),
    shaker: pick(rng, SHAKERS_BY_KIT[kitKey]),
    hat: pick(rng, HATS_BY_KIT[kitKey]),
    hatOpen: pick(rng, OPEN_HATS_BY_KIT[kitKey]),
    hatOpenLong: pick(rng, OPEN_HAT_LONGS_BY_KIT[kitKey]),
    cymbal: pick(rng, CYMBALS_BY_KIT[kitKey]),
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
