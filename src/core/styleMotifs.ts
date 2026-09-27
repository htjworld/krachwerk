// 260927 §13.4: 새 블루프린트(d/p/f) 전용 모티프. §6.1 드럼 경로 원칙 — 블루프린트는
// rateSteps[].density만 적고, 실제 중요도·세기표는 여기서 곡마다 만들어 rig.styleMaps로
// audioEngine.ts에 넘긴다. d(§7.3/§7.5/§7.6)·p(§7.3/§7.4/§7.5/§7.6/§7.7)를 채웠다 — f는
// 단계 10에서 채운다.
import type { BlueprintId, LayerId } from "./blueprint";
import type { StyleGenome } from "./genome";
import type { StepCell } from "./pattern";
import { makeScale, type Scale } from "./scales";
import { mulberry32 } from "./prng";

/** 마디 하나치 중요도·세기표. 길이 = 그 블루프린트의 stepsPerBar. */
export interface DrumMap {
  priority: readonly number[];
  velocity: readonly number[];
}

// §4.1 D12: 화성은 한 코드(또는 반음 옆 두 음)뿐이라 진행표가 필요 없다 — 곡 내내 스케일
// 하나만 고정한다. 특정 모드를 못박은 실측 표가 없어서(요약표는 곡별 근음만 준다) 로파이
// 하우스/테크노에 흔한 어두운 모드 4개를 게놈 mode(기수 4)에 배정했다.
const D_MODES: readonly { name: string; intervals: number[] }[] = [
  { name: "Aeolian", intervals: [0, 2, 3, 5, 7, 8, 10] },
  { name: "Dorian", intervals: [0, 2, 3, 5, 7, 9, 10] },
  { name: "Phrygian", intervals: [0, 1, 3, 5, 7, 8, 10] },
  { name: "Harmonic Minor", intervals: [0, 2, 3, 5, 7, 8, 11] },
];

export function dScale(g: StyleGenome): Scale {
  const mode = D_MODES[(g.mode ?? 0) % D_MODES.length];
  return makeScale(g.key ?? 0, mode.intervals, mode.name);
}

function uniformVelocity(v: number, n: number): number[] {
  return Array(n).fill(v);
}

// §7.3 범례: 게놈 비트로 켜는 선택 스텝은 8분 자리(짝수 스텝) 230, 16분 자리(홀수 스텝) 200.
function stepPriority16(step: number): number {
  return step % 2 === 0 ? 230 : 200;
}

// shuffle12는 박이 0·3·6·9라 그 자리가 "8분 자리"에 해당한다(§6.2).
function stepPriority12(step: number): number {
  return step % 3 === 0 ? 230 : 200;
}

function setSteps(priority: number[], steps: readonly number[], value: (step: number) => number): void {
  for (const s of steps) priority[s] = value(s);
}

// ---------------------------------------------------------------- d: 드럼 중요도 맵 (§7.3)

const TAPE_KICK_GROUPS = [
  [5, 6, 7],
  [6, 7, 8, 9],
  [5, 7, 9],
  [8, 9],
];
const TAPE_CLAP_GROUPS = [[2, 10], [1, 9], [6, 14], [2, 6, 10]];
const TAPE_PERC_GROUPS = [[1, 2, 4], [10, 12, 13], [13, 14, 15], [1, 2, 10]];
const TAPE_HAT_VELOCITY = [1.0, 1.0, 0.82, 1.0, 0.57, 0.87, 0.56, 0.71, 0.77, 0.95, 0.97, 1.0, 0.6, 1.0, 1.0, 1.0];

function tapeJamMaps(dv: number): Partial<Record<LayerId, DrumMap>> {
  const kick = Array(16).fill(0);
  setSteps(kick, TAPE_KICK_GROUPS[dv & 0b11], stepPriority16);
  if ((dv >> 2) & 1) kick[3] = stepPriority16(3);
  if ((dv >> 3) & 1) kick[11] = stepPriority16(11);

  const clap = Array(16).fill(0);
  clap[12] = 255;
  setSteps(clap, TAPE_CLAP_GROUPS[(dv >> 4) & 0b11], stepPriority16);

  const perc = Array(16).fill(0);
  setSteps(perc, TAPE_PERC_GROUPS[(dv >> 6) & 0b11], stepPriority16);

  return {
    kick: { priority: kick, velocity: uniformVelocity(1.0, 16) },
    clap: { priority: clap, velocity: uniformVelocity(0.85, 16) },
    hat: { priority: Array(16).fill(255), velocity: TAPE_HAT_VELOCITY },
    perc: { priority: perc, velocity: uniformVelocity(0.6, 16) },
  };
}

const FOURFLOOR_HAT_GROUPS = [[], [1, 9], [7, 15], [2, 10]];
const FOURFLOOR_PERC_GROUPS = [[6, 14], [10], [2, 14], []];

function fourFloorJamMaps(dv: number): Partial<Record<LayerId, DrumMap>> {
  const kickVel = Array(16).fill(1.0);
  const kick = Array(16).fill(0);
  setSteps(kick, [0, 4, 8, 12], () => 255);
  if ((dv >> 6) & 1) {
    kick[14] = stepPriority16(14);
    kickVel[14] = 0.35; // 고스트
  }

  const clapVel = Array(16).fill(0.9);
  const clap = Array(16).fill(0);
  setSteps(clap, [4, 12], () => 255);
  if ((dv >> 7) & 1) {
    clap[7] = stepPriority16(7);
    clapVel[7] = 0.2; // 고스트
  }

  const hat = Array(16).fill(0);
  setSteps(hat, [5, 13], () => 230);
  setSteps(hat, FOURFLOOR_HAT_GROUPS[dv & 0b11], stepPriority16);

  const openHat = Array(16).fill(0);
  setSteps(openHat, [3, 11], () => 240);
  if ((dv >> 2) & 1) openHat[15] = stepPriority16(15);
  if ((dv >> 3) & 1) openHat[7] = stepPriority16(7);

  const perc = Array(16).fill(0);
  setSteps(perc, FOURFLOOR_PERC_GROUPS[(dv >> 4) & 0b11], stepPriority16);

  return {
    kick: { priority: kick, velocity: kickVel },
    clap: { priority: clap, velocity: clapVel },
    hat: { priority: hat, velocity: uniformVelocity(0.75, 16) },
    openHat: { priority: openHat, velocity: uniformVelocity(0.7, 16) },
    perc: { priority: perc, velocity: uniformVelocity(0.5, 16) },
  };
}

const BEACH_KICK_GROUPS = [[4], [4, 12], [12], [6, 12]];
const BEACH_CLAP_GHOST = [[10], [14], [6], []];
const BEACH_HAT_ACCENT = [
  [1, 0.6, 0.8, 0.6],
  [0.8, 0.8, 0.8, 0.8],
  [1, 0.5, 1, 0.5],
  [0.6, 1, 0.6, 1],
];
const BEACH_HAT_EXTRA = [[7], [15], [3, 11], []];
const BEACH_EVEN_STEPS = [0, 2, 4, 6, 8, 10, 12, 14];

function beachDemoMaps(dv: number): Partial<Record<LayerId, DrumMap>> {
  const kick = Array(16).fill(0);
  setSteps(kick, [0, 8], () => 255);
  setSteps(kick, BEACH_KICK_GROUPS[dv & 0b11], stepPriority16);

  const clapVel = Array(16).fill(0.8);
  const clap = Array(16).fill(0);
  setSteps(clap, [4, 12], () => 255);
  for (const s of BEACH_CLAP_GHOST[(dv >> 6) & 0b11]) {
    clap[s] = stepPriority16(s);
    clapVel[s] = 0.4;
  }

  const hat = Array(16).fill(0);
  const hatVel = Array(16).fill(0);
  const accent = BEACH_HAT_ACCENT[(dv >> 2) & 0b11];
  BEACH_EVEN_STEPS.forEach((s, i) => {
    hat[s] = 255;
    hatVel[s] = accent[i % 4];
  });
  for (const s of BEACH_HAT_EXTRA[(dv >> 4) & 0b11]) {
    hat[s] = stepPriority16(s);
    hatVel[s] = 0.7;
  }

  return {
    kick: { priority: kick, velocity: uniformVelocity(1.0, 16) },
    clap: { priority: clap, velocity: clapVel },
    hat: { priority: hat, velocity: hatVel },
  };
}

const SHUFFLE_KICK_GROUPS = [[3], [5], [3, 9], [9, 11]];
const SHUFFLE_PERC_GROUPS = [[2, 8], [5, 11], [1, 7], []];
const SHUFFLE_HAT_VELOCITY = [1, 0.5, 0.8, 1, 0.5, 0.8, 1, 0.5, 0.8, 1, 0.5, 0.8];
// ponytail: 원본표는 "밀도가 낮아지면 빠지는 칸 8종"이라고만 적혀 있고 정확한 8가지 조합은
// 안 나와 있다. 박(0·3·6·9)은 항상 남기고, 그 사이 8분 자리 8칸 중 어디를 먼저 접을지만
// 8가지로 골랐다 — thin 섹션(density 120)에서만 차이가 난다.
const SHUFFLE_THIN_DROP = [
  [1, 4, 7, 10],
  [2, 5, 8, 11],
  [1, 2, 4, 5],
  [7, 8, 10, 11],
  [1, 4, 8, 11],
  [2, 4, 7, 11],
  [1, 5, 7, 10],
  [2, 5, 8, 10],
];

function shuffle12Maps(dv: number): Partial<Record<LayerId, DrumMap>> {
  const kick = Array(12).fill(0);
  setSteps(kick, [0, 6], () => 255);
  setSteps(kick, SHUFFLE_KICK_GROUPS[dv & 0b11], stepPriority12);

  const clap = Array(12).fill(0);
  clap[9] = 255;
  if ((dv >> 2) & 1) clap[3] = stepPriority12(3);

  const perc = Array(12).fill(0);
  setSteps(perc, SHUFFLE_PERC_GROUPS[(dv >> 3) & 0b11], stepPriority12);

  const hat = Array(12).fill(255);
  for (const s of SHUFFLE_THIN_DROP[(dv >> 5) & 0b111]) hat[s] = 100;

  return {
    hat: { priority: hat, velocity: SHUFFLE_HAT_VELOCITY },
    kick: { priority: kick, velocity: uniformVelocity(1.0, 12) },
    clap: { priority: clap, velocity: uniformVelocity(0.8, 12) },
    perc: { priority: perc, velocity: uniformVelocity(0.5, 12) },
  };
}

// ---------------------------------------------------------------- p: 드럼 중요도 맵 (§7.3)

const CLUBHOUSE_OPENHAT_ROLL = [14, 15];
const CLUBHOUSE_HAT_BLANK = [[3, 7, 11], [5, 13], [3, 11], []];
// Nanana 실측(§3.7).
const CLUBHOUSE_HAT_VELOCITY = [1.0, 0.56, 1.0, 0.3, 0.98, 0.31, 1.0, 0.38, 1.0, 0.49, 1.0, 0.34, 0.94, 0.32, 1.0, 0.52];
const CLUBHOUSE_PERC_GROUPS = [[0, 3, 7, 10], [2, 5, 9, 12], [1, 4, 6, 11, 14], [3, 6, 11]];

function clubHouseMaps(dv: number): Partial<Record<LayerId, DrumMap>> {
  const kick = Array(16).fill(0);
  setSteps(kick, [0, 4, 8, 12], () => 255);
  // ponytail: b7("4마디마다 스텝15 픽업")은 styleDrumMaps가 마디 하나치만 만들어서(주기적
  // 픽업은 barIndex가 필요하다) 아직 안 쓴다 — 게놈 엔트로피에는 그대로 남아 있다.

  const clap = Array(16).fill(0);
  setSteps(clap, [4, 12], () => 255);

  const openHat = Array(16).fill(0);
  setSteps(openHat, [2, 6, 10, 14], () => 255);
  if (dv & 1) openHat[15] = stepPriority16(15);
  if ((dv >> 1) & 1) for (const s of CLUBHOUSE_OPENHAT_ROLL) openHat[s] = stepPriority16(s);

  const hat: number[] = Array.from({ length: 16 }, (_, s) => (s % 2 === 0 ? 240 : 150));
  for (const s of CLUBHOUSE_HAT_BLANK[(dv >> 2) & 0b11]) hat[s] = 0;

  const perc = Array(16).fill(0);
  setSteps(perc, CLUBHOUSE_PERC_GROUPS[(dv >> 4) & 0b11], stepPriority16);
  if ((dv >> 6) & 1) setSteps(perc, [7, 15], stepPriority16);

  return {
    kick: { priority: kick, velocity: uniformVelocity(1.0, 16) },
    clap: { priority: clap, velocity: uniformVelocity(0.9, 16) },
    openHat: { priority: openHat, velocity: uniformVelocity(0.8, 16) },
    hat: { priority: hat, velocity: CLUBHOUSE_HAT_VELOCITY },
    perc: { priority: perc, velocity: uniformVelocity(0.55, 16) },
  };
}

const SLOWJAM_KICK_GROUPS = [[2, 3, 9, 10], [2, 10], [3, 10, 11], [2, 3, 9]];
const SLOWJAM_HAT_BLANK = [[], [6, 14], [7], [12]];
// Believe In Love Again 실측(§3.8), 홀수 강.
const SLOWJAM_HAT_VELOCITY = [0.63, 1.0, 0.84, 1.0, 0.68, 1.0, 0.6, 0.79, 0.76, 1.0, 0.53, 1.0, 0.41, 1.0, 0.48, 1.0];
const SLOWJAM_PERC_GROUPS = [[2], [10], [2, 10], []];

function slowJamMaps(dv: number): Partial<Record<LayerId, DrumMap>> {
  const kick = Array(16).fill(0);
  setSteps(kick, [0, 8], () => 255);
  setSteps(kick, SLOWJAM_KICK_GROUPS[dv & 0b11], stepPriority16);
  if ((dv >> 7) & 1) kick[15] = stepPriority16(15);

  const clap = Array(16).fill(0);
  clap[13] = 255;
  const extraStep = (dv >> 2) & 1 ? 5 : 4;
  clap[extraStep] = stepPriority16(extraStep);

  const hat = Array(16).fill(255);
  for (const s of SLOWJAM_HAT_BLANK[(dv >> 3) & 0b11]) hat[s] = 0;

  const perc = Array(16).fill(0);
  setSteps(perc, SLOWJAM_PERC_GROUPS[(dv >> 5) & 0b11], stepPriority16);

  return {
    kick: { priority: kick, velocity: uniformVelocity(1.0, 16) },
    clap: { priority: clap, velocity: uniformVelocity(0.9, 16) },
    hat: { priority: hat, velocity: SLOWJAM_HAT_VELOCITY },
    perc: { priority: perc, velocity: uniformVelocity(0.5, 16) },
  };
}

// ---------------------------------------------------------------- f: 드럼 중요도 맵 (§7.3)

const GARAGE_HAT_GROUPS = [[3, 11], [7, 15], [3, 7], [11, 15]];
// Delilah 실측(§3.9).
const GARAGE_HAT_VELOCITY = [0.95, 0.37, 1.0, 0.51, 0.6, 0.59, 1.0, 0.49, 0.86, 0.5, 1.0, 0.52, 0.5, 0.52, 1.0, 0.41];
const GARAGE_PERC_GROUPS = [[7], [15], [3, 11], []];
const GARAGE_CLAPLAYER_GROUPS = [[0, 8], [0], [8], [0, 6, 8]];

function garageShuffleMaps(dv: number): Partial<Record<LayerId, DrumMap>> {
  const kick = Array(16).fill(0);
  setSteps(kick, [0, 4, 8, 12], () => 255);

  const clap = Array(16).fill(0);
  setSteps(clap, [4, 12], () => 255);

  const openHat = Array(16).fill(0);
  setSteps(openHat, [2, 6, 10, 14], () => 255);

  const hat = Array(16).fill(0);
  setSteps(hat, [0, 2, 8, 10], () => 200);
  setSteps(hat, GARAGE_HAT_GROUPS[dv & 0b11], stepPriority16);

  const perc = Array(16).fill(0);
  setSteps(perc, GARAGE_PERC_GROUPS[(dv >> 2) & 0b11], stepPriority16);

  const clapLayer = Array(16).fill(0);
  setSteps(clapLayer, GARAGE_CLAPLAYER_GROUPS[(dv >> 4) & 0b11], () => 255);

  return {
    kick: { priority: kick, velocity: uniformVelocity(1.0, 16) },
    clap: { priority: clap, velocity: uniformVelocity(0.9, 16) },
    openHat: { priority: openHat, velocity: uniformVelocity(0.85, 16) },
    hat: { priority: hat, velocity: GARAGE_HAT_VELOCITY },
    perc: { priority: perc, velocity: uniformVelocity(0.5, 16) },
    clapLayer: { priority: clapLayer, velocity: uniformVelocity(0.8, 16) },
  };
}

const HALFSTEP_KICK_GROUPS = [[3, 7, 11, 14], [3, 8, 11], [3, 7, 10, 14], [6, 11, 14]];
const HALFSTEP_CLAP_GROUPS = [[4, 12], [5, 9], [8], [4, 13]];
const HALFSTEP_HAT_BLANK = [[], [3, 11], [15], [6, 14]];
// places to be 실측(§3.10), 홀수 강.
const HALFSTEP_HAT_VELOCITY = [0.82, 1.0, 0.84, 1.0, 0.84, 1.0, 0.89, 1.0, 0.8, 1.0, 0.88, 1.0, 0.83, 1.0, 0.83, 1.0];
const HALFSTEP_PERC_GROUPS = [[2, 10], [6], [13, 14], []];

function halfStepMaps(dv: number): Partial<Record<LayerId, DrumMap>> {
  const kick = Array(16).fill(0);
  kick[0] = 255;
  setSteps(kick, HALFSTEP_KICK_GROUPS[dv & 0b11], stepPriority16);

  const clap = Array(16).fill(0);
  setSteps(clap, HALFSTEP_CLAP_GROUPS[(dv >> 2) & 0b11], stepPriority16);

  const hat = Array(16).fill(255);
  for (const s of HALFSTEP_HAT_BLANK[(dv >> 4) & 0b11]) hat[s] = 0;

  const perc = Array(16).fill(0);
  setSteps(perc, HALFSTEP_PERC_GROUPS[(dv >> 6) & 0b11], stepPriority16);

  return {
    kick: { priority: kick, velocity: uniformVelocity(1.0, 16) },
    clap: { priority: clap, velocity: uniformVelocity(0.9, 16) },
    hat: { priority: hat, velocity: HALFSTEP_HAT_VELOCITY },
    perc: { priority: perc, velocity: uniformVelocity(0.5, 16) },
  };
}

const SWITCHUP_OPENHAT_GHOST = [[5, 7], [13, 15], [5], []];
// ten 실측(§3.11).
const SWITCHUP_OPENHAT_VELOCITY = [0.57, 0.24, 1.0, 0.22, 0.66, 0.35, 1.0, 0.3, 0.52, 0.25, 1.0, 0.2, 0.71, 0.23, 1.0, 0.22];
const SWITCHUP_CLAP_EXTRA = [[], [7], [15], [11]];
const SWITCHUP_PERC_GROUPS = [[3], [9], [3, 11], []];

// ponytail: kitSwap: "sub808" 섹션(switchIn/sub808/halfFeel)은 "kick" 레이어를 그대로 두고
// 킷만 바꿔서 808 톤을 낸다 — §7.3의 별도 "sub" 행(스텝 {0,4,8,12}, kick과 거의 같다)을 위해
// LayerId "sub"용 맵을 따로 안 만든다. halfFeel의 "스텝8만" 스네어는 블루프린트의
// drumOverride로 덮어쓴다(§13.3).
function switchUpMaps(dv: number): Partial<Record<LayerId, DrumMap>> {
  const kick = Array(16).fill(0);
  setSteps(kick, [0, 4, 8, 12], () => 255);

  const clap = Array(16).fill(0);
  clap[12] = 255;
  clap[4] = 230;
  setSteps(clap, SWITCHUP_CLAP_EXTRA[(dv >> 2) & 0b11], stepPriority16);

  const openHat = Array(16).fill(0);
  const openHatVel = [...SWITCHUP_OPENHAT_VELOCITY];
  setSteps(openHat, [2, 6, 10, 14], () => 255);
  for (const s of SWITCHUP_OPENHAT_GHOST[dv & 0b11]) {
    openHat[s] = stepPriority16(s);
    openHatVel[s] = 0.3; // 고스트 — 실측표 값 대신 낮은 세기로 덮는다
  }

  const perc = Array(16).fill(0);
  setSteps(perc, SWITCHUP_PERC_GROUPS[(dv >> 4) & 0b11], stepPriority16);

  // 표에 "hat"(닫힌 햇) 행 자체가 없다 — switchUp의 "풀"은 kick·clap·openHat·perc까지다.
  return {
    kick: { priority: kick, velocity: uniformVelocity(1.0, 16) },
    clap: { priority: clap, velocity: uniformVelocity(0.85, 16) },
    openHat: { priority: openHat, velocity: openHatVel },
    perc: { priority: perc, velocity: uniformVelocity(0.45, 16) },
  };
}

export function styleDrumMaps(id: BlueprintId, g: StyleGenome): Partial<Record<LayerId, DrumMap>> {
  const dv = g.drumVariant ?? 0;
  switch (id) {
    case "tapeJam":
      return tapeJamMaps(dv);
    case "fourFloorJam":
      return fourFloorJamMaps(dv);
    case "beachDemo":
      return beachDemoMaps(dv);
    case "garageShuffle":
      return garageShuffleMaps(dv);
    case "halfStep":
      return halfStepMaps(dv);
    case "switchUp":
      return switchUpMaps(dv);
    case "shuffle12":
      return shuffle12Maps(dv);
    case "clubHouse":
      return clubHouseMaps(dv);
    case "slowJam":
      return slowJamMaps(dv);
    default:
      return {};
  }
}

// ---------------------------------------------------------------- d: 베이스 음형 (§7.5)

const D16_BASS_RHYTHM = [[0, 8], [0, 6, 8, 14], [0, 3, 8, 11], [0]];
const D16_BASS_OCTAVE = [[], [14], [7], [7, 15]];
const D12_BASS_RHYTHM = [[0, 6], [0, 3, 6, 9], [0, 5, 6, 11], [0]];
const D12_BASS_OCTAVE = [[], [11], [5], [5, 11]];

// ponytail: "근음+반음 위/온음 위/아래 ♭7"은 반음 단위인데 StepCell.degree는 스케일 디그리
// 단위라(§9.2) 정확한 반음을 못 담는다. 인접 스케일 디그리로 근사한다 — 리듬·옥타브 점프가
// 훨씬 크게 들리는 요소라 코드까지 다시 설계하지 않는다. 패턴의 마지막 히트에서만 근음을
// 벗어난다(Wild Animal처럼 마디 끝에 이웃음 하나로 다음 마디를 당겨오는 모양).
const D_BASS_PITCH_OFFSET = [0, 1, 1, -1];

function styleBassFor(
  rhythms: readonly number[][],
  octaves: readonly number[][],
  stepsPerBar: number,
  g: StyleGenome,
  octaveLen: number
): { cells: StepCell[][]; gate: number } {
  const shape = g.bassShape ?? 0;
  const rhythm = rhythms[shape & 0b11];
  const pitchOffset = D_BASS_PITCH_OFFSET[(shape >> 2) & 0b11];
  const octaveSteps = octaves[(shape >> 4) & 0b11];
  const lastStep = rhythm[rhythm.length - 1];

  const cells: StepCell[] = Array.from({ length: stepsPerBar }, () => ({ on: false, degree: 0 }));
  for (const step of rhythm) {
    const degree = (step === lastStep ? pitchOffset : 0) + (octaveSteps.includes(step) ? octaveLen : 0);
    cells[step] = { on: true, degree };
  }
  // 한 마디 드론(rhythm이 [0]뿐)은 마디 전체를 붙잡고, 나머지는 짧게 끊어 친다.
  const gate = rhythm.length === 1 ? stepsPerBar : 2;
  return { cells: [cells], gate };
}

// ponytail: p §7.5 원래 표는 클럽하우스가 2마디(마디 A/B) 패턴 + 코드톤 집합 + 순서 규칙까지
// 있지만, d와 같은 "리듬 + 마지막 히트만 이웃음 + 옥타브 점프" 모델로 단순화했다 — 리듬(가장
// 잘 들리는 요소)은 표 그대로 옮기고, 정확한 음 집합·순회 규칙은 브라우저 청취 후 필요하면
// 더한다.
const P_CLUBHOUSE_BASS_RHYTHM = [[0, 3, 6, 8, 11, 14], [0, 3, 6, 10, 12], [0, 2, 6, 8, 10, 14], [0, 3, 6, 8, 11, 14]];
const P_SLOWJAM_BASS_RHYTHM = [[1, 3, 6, 9, 11, 14], [2, 6, 10, 14], [3, 7, 11, 15], [1, 6, 9, 14]];
const P_BASS_OCTAVE = [[], [], [], []];

// f(§7.5): 리듬 4종 그대로, 마지막 히트에 옥타브 점프(d의 인접 디그리 근사와 같은 절충).
const F_BASS_RHYTHM = [[0, 7, 8, 10, 11], [0, 3, 8, 11], [2, 6, 10, 14], [0]];
const F_BASS_OCTAVE = [[], [11], [14], [0]];

export function styleBass(id: BlueprintId, g: StyleGenome, scale: Scale): { cells: StepCell[][]; gate: number } {
  const octaveLen = scale.intervals.length;
  if (id === "shuffle12") return styleBassFor(D12_BASS_RHYTHM, D12_BASS_OCTAVE, 12, g, octaveLen);
  if (id === "clubHouse") return styleBassFor(P_CLUBHOUSE_BASS_RHYTHM, P_BASS_OCTAVE, 16, g, octaveLen);
  if (id === "slowJam") return styleBassFor(P_SLOWJAM_BASS_RHYTHM, P_BASS_OCTAVE, 16, g, octaveLen);
  if (id === "garageShuffle" || id === "halfStep" || id === "switchUp") {
    return styleBassFor(F_BASS_RHYTHM, F_BASS_OCTAVE, 16, g, octaveLen);
  }
  return styleBassFor(D16_BASS_RHYTHM, D16_BASS_OCTAVE, 16, g, octaveLen);
}

// ---------------------------------------------------------------- d: 리프 (§7.6)

const D_RIFF_CANDIDATES = [0, 1, 2, 4, 7];
const D_BEACH_RIFF_CANDIDATES = [0, 0, 1, 2, 4];

function decodeRiffRhythm(riffRhythm: number, stepsPerBar: number): boolean[] {
  const on = Array(stepsPerBar).fill(false);
  on[0] = true;
  const bitCount = stepsPerBar === 12 ? 11 : 12;
  for (let k = 0; k < bitCount; k++) {
    if ((riffRhythm >> k) & 1) on[k + 1] = true;
  }
  return on;
}

function decodeRiffPitch(riffPitch: number): number[] {
  const digits: number[] = [];
  let v = riffPitch;
  for (let i = 0; i < 8; i++) {
    digits.push(v % 5);
    v = Math.floor(v / 5);
  }
  return digits;
}

export function styleRiff(id: BlueprintId, g: StyleGenome): StepCell[] {
  const stepsPerBar = id === "shuffle12" ? 12 : 16;
  const on = decodeRiffRhythm(g.riffRhythm ?? 0, stepsPerBar);
  const digits = decodeRiffPitch(g.riffPitch ?? 0);
  // p(§7.6): "코드톤 우선"이라 d의 반음계 후보 대신 현재 화성의 코드톤(근음·3도·5도·7도·
  // 옥타브, 스케일 디그리 단위)에서 고른다. ponytail: 진행(prog)이 마디마다 바뀌어도
  // 곡 전체에서 첫 코드(bar 0) 기준 하나만 쓴다 — 실제로 코드를 재생하는 chord 레이어
  // 자체를 이번 단계에서 뺐다(§4.2 P16의 딜레이 효과가 더 크게 들리는 seqRiff 우선).
  const candidates =
    id === "beachDemo"
      ? D_BEACH_RIFF_CANDIDATES
      : id === "clubHouse" || id === "slowJam"
        ? pChordToneCandidates(pRootDegree(g))
        : D_RIFF_CANDIDATES;

  const cells: StepCell[] = Array.from({ length: stepsPerBar }, () => ({ on: false, degree: 0 }));
  let n = 0;
  for (let step = 0; step < stepsPerBar; step++) {
    if (!on[step]) continue;
    cells[step] = { on: true, degree: candidates[digits[n % digits.length]] };
    n++;
  }
  return cells;
}

// ---------------------------------------------------------------- p: 화성·리프 코드톤 (§7.4)

const P_MODES: Record<"aeolian" | "dorian" | "ionian", readonly number[]> = {
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  ionian: [0, 2, 4, 5, 7, 9, 11],
};

interface PProgDef {
  mode: keyof typeof P_MODES;
  main: readonly { degree: number; bars: number }[];
}

// §7.4 표. 브레이크 코드(halfBeat 등)는 아직 실제로 재생하는 곳이 없어서(위 ponytail 메모)
// 뺐다 — main 진행의 뿌리 자리만 남긴다.
const P_PROG: readonly PProgDef[] = [
  { mode: "aeolian", main: [{ degree: 0, bars: 1 }] },
  { mode: "aeolian", main: [{ degree: 0, bars: 1 }] },
  {
    mode: "aeolian",
    main: [
      { degree: 0, bars: 2 },
      { degree: 5, bars: 2 },
    ],
  },
  {
    mode: "aeolian",
    main: [
      { degree: 0, bars: 2 },
      { degree: 6, bars: 2 },
    ],
  },
  {
    mode: "aeolian",
    main: [
      { degree: 0, bars: 2 },
      { degree: 3, bars: 2 },
    ],
  },
  {
    mode: "aeolian",
    main: [
      { degree: 0, bars: 1 },
      { degree: 5, bars: 1 },
      { degree: 2, bars: 1 },
      { degree: 6, bars: 1 },
    ],
  },
  {
    mode: "dorian",
    main: [
      { degree: 0, bars: 2 },
      { degree: 3, bars: 2 },
    ],
  },
  {
    mode: "ionian",
    main: [
      { degree: 0, bars: 2 },
      { degree: 3, bars: 2 },
    ],
  },
];

function pProgDef(g: StyleGenome): PProgDef {
  return P_PROG[(g.prog ?? 0) % P_PROG.length];
}

export function pScale(g: StyleGenome): Scale {
  const def = pProgDef(g);
  return makeScale(g.key ?? 0, P_MODES[def.mode], def.mode);
}

/** 곡 전체가 기준으로 삼는 화성 뿌리(첫 코드, bar 0) — 스케일 디그리 단위. */
function pRootDegree(g: StyleGenome): number {
  return pProgDef(g).main[0].degree;
}

function pChordToneCandidates(rootDegree: number): number[] {
  // 근음·3도·5도·7도·옥타브(스케일 3도씩 쌓기 — 어떤 모드든 그 모드의 화성음이 나온다).
  return [rootDegree, rootDegree + 2, rootDegree + 4, rootDegree + 6, rootDegree + 7];
}

// ---------------------------------------------------------------- p: 찬트 후크 (§7.7)

// 8음절씩, 16종 전부 달라야 한다(테스트로 확인). "-"은 쉼.
export const HOOK_SYLLABLES: readonly (readonly string[])[] = [
  ["na", "na", "na", "na", "na", "na", "na", "na"],
  ["na", "na", "na", "-", "na", "na", "na", "-"],
  ["la", "la", "oh", "-", "la", "la", "oh", "-"],
  ["oh", "-", "oh", "-", "ah", "-", "ah", "-"],
  ["na", "-", "na", "-", "na", "-", "na", "-"],
  ["na", "la", "na", "la", "na", "la", "na", "la"],
  ["oh", "oh", "ah", "ah", "oh", "oh", "ah", "ah"],
  ["na", "na", "la", "la", "oh", "oh", "ah", "ah"],
  ["ah", "ah", "ah", "-", "ah", "ah", "ah", "-"],
  ["la", "-", "la", "-", "la", "-", "la", "-"],
  ["na", "oh", "na", "oh", "na", "oh", "na", "oh"],
  ["na", "na", "na", "na", "-", "-", "-", "-"],
  ["-", "na", "na", "-", "na", "na", "-", "na"],
  ["la", "la", "la", "la", "ah", "ah", "ah", "ah"],
  ["oh", "na", "la", "ah", "oh", "na", "la", "ah"],
  ["na", "ah", "na", "ah", "oh", "la", "oh", "la"],
];

// 8개 음 위치, 2마디(0~31, 16분 격자) 안. ponytail: 원곡 후크 리듬을 그대로 안 넣으려고(R2)
// 결정론적으로 뽑았다 — 8개씩 오름차순, 16개가 서로 다름은 테스트로 확인한다.
function genHookRhythm(seed: number): number[] {
  const rng = mulberry32(seed);
  const positions = new Set<number>();
  while (positions.size < 8) positions.add(Math.floor(rng() * 32));
  return [...positions].sort((a, b) => a - b);
}
export const HOOK_RHYTHMS: readonly (readonly number[])[] = Array.from({ length: 16 }, (_, i) =>
  genHookRhythm((0x9e3779b9 ^ Math.imul(i + 1, 0x1000193)) >>> 0)
);

export interface HookNote {
  /** 2마디(16분 격자 0~31) 안 위치. bar = Math.floor(at/16), step = at%16. */
  at: number;
  syllable: string;
  degree: number;
}

/** p `chop` 찬트(§7.7). formantVox로만 합성한다(소스 파일 없음) — 모음 자체는 지금은 항상
 *  "a"(§7.1 formantVox 제한)라 syllable은 리듬·타이밍에만 쓰인다. */
export function hookPlan(g: StyleGenome): readonly HookNote[] {
  const hook = g.hook ?? 0;
  const syllables = HOOK_SYLLABLES[hook & 0b1111];
  const rhythm = HOOK_RHYTHMS[(hook >> 4) & 0b1111];
  const digits = decodeRiffPitch(g.riffPitch ?? 0);
  const tones = pChordToneCandidates(pRootDegree(g)).slice(0, 3); // 근음·3도·5도만
  return rhythm.map((at, i) => ({ at, syllable: syllables[i], degree: tones[digits[i] % tones.length] }));
}

// ---------------------------------------------------------------- f: 화성 (§7.4)

const F_MODES: Record<"ionian" | "aeolian" | "mixolydian", readonly number[]> = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};

interface FProgDef {
  mode: keyof typeof F_MODES;
  main: readonly { degree: number; bars: number }[];
}

// §7.4 f 열. break 코드는 p와 같은 이유(§9절 ponytail)로 뺐다 — chord는 pad 재사용이라
// 브레이크 전용 코드를 따로 재생하는 곳이 없다.
const F_PROG: readonly FProgDef[] = [
  {
    mode: "ionian",
    main: [
      { degree: 0, bars: 2 },
      { degree: 2, bars: 2 },
    ],
  },
  {
    mode: "ionian",
    main: [
      { degree: 0, bars: 2 },
      { degree: 3, bars: 2 },
      { degree: 0, bars: 2 },
      { degree: 2, bars: 2 },
    ],
  },
  {
    mode: "ionian",
    main: [
      { degree: 5, bars: 2 },
      { degree: 3, bars: 2 },
      { degree: 0, bars: 2 },
      { degree: 4, bars: 2 },
    ],
  },
  {
    mode: "ionian",
    main: [
      { degree: 0, bars: 2 },
      { degree: 4, bars: 2 },
      { degree: 5, bars: 2 },
      { degree: 3, bars: 2 },
    ],
  },
  {
    mode: "aeolian",
    main: [
      { degree: 0, bars: 2 },
      { degree: 5, bars: 2 },
      { degree: 2, bars: 2 },
      { degree: 6, bars: 2 },
    ],
  },
  {
    mode: "ionian",
    main: [
      { degree: 3, bars: 2 },
      { degree: 0, bars: 2 },
    ],
  },
  {
    mode: "aeolian",
    main: [
      { degree: 0, bars: 2 },
      { degree: 3, bars: 2 },
    ],
  },
  { mode: "mixolydian", main: [{ degree: 0, bars: 1 }] },
];

function fProgDef(g: StyleGenome): FProgDef {
  return F_PROG[(g.prog ?? 0) % F_PROG.length];
}

export function fScale(g: StyleGenome): Scale {
  const def = fProgDef(g);
  return makeScale(g.key ?? 0, F_MODES[def.mode], def.mode);
}

// ---------------------------------------------------------------- f: 목소리 조각(chop) (§6.4.1/§7.7)

export interface ChopNote {
  /** 2마디(16분 격자 0~31) 안 위치. bar = Math.floor(at/16), step = at%16. */
  at: number;
  /** 재생 속도(슬로모션 포함). 1.0/0.8/0.66/0.5 중 하나. */
  rate: number;
  /** 조각 풀에서 몇 번째를 쓸지(풀 길이로 mod한다) — 사용자 목소리 1개뿐이면 그 버퍼
   *  안에서 4등분한 구간 중 하나를 고르는 데도 같은 값을 쓴다(audioEngine.ts). */
  sliceIndex: number;
}

const CHOP_RATES = [1.0, 0.8, 0.66, 0.5];

/** f `chop`(§6.4.1 소스 우선순위: 내 소리 voice 슬롯 > CC0 말소리 풀(§8.2, 아직 소싱 전) >
 *  로봇 목소리). 리듬은 §7.7 HOOK_RHYTHMS(찬트와 같은 표, 2마디 8개 위치)를 재사용한다 —
 *  후크·chop 둘 다 "2마디 안 8개 위치"라 표 하나로 충분하다. */
export function chopPlan(g: StyleGenome): readonly ChopNote[] {
  const chop = g.chop ?? 0;
  const rhythm = HOOK_RHYTHMS[(chop >> 4) & 0b1111];
  const rate = CHOP_RATES[chop & 0b11];
  const sliceBase = (chop >> 2) & 0b11;
  return rhythm.map((at, i) => ({ at, rate, sliceIndex: (sliceBase + i) % 4 }));
}
