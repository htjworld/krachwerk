// 260927 §13.4: 새 블루프린트(d/p/f) 전용 모티프. §6.1 드럼 경로 원칙 — 블루프린트는
// rateSteps[].density만 적고, 실제 중요도·세기표는 여기서 곡마다 만들어 rig.styleMaps로
// audioEngine.ts에 넘긴다. d(§7.3/§7.5/§7.6)만 채웠다 — p/f는 단계 9~10에서 채운다.
import type { BlueprintId, LayerId } from "./blueprint";
import type { StyleGenome } from "./genome";
import type { StepCell } from "./pattern";
import { makeScale, type Scale } from "./scales";

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

export function styleDrumMaps(id: BlueprintId, g: StyleGenome): Partial<Record<LayerId, DrumMap>> {
  const dv = g.drumVariant ?? 0;
  switch (id) {
    case "tapeJam":
      return tapeJamMaps(dv);
    case "fourFloorJam":
      return fourFloorJamMaps(dv);
    case "beachDemo":
      return beachDemoMaps(dv);
    case "shuffle12":
      return shuffle12Maps(dv);
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

export function styleBass(id: BlueprintId, g: StyleGenome, scale: Scale): { cells: StepCell[][]; gate: number } {
  const octaveLen = scale.intervals.length;
  if (id === "shuffle12") return styleBassFor(D12_BASS_RHYTHM, D12_BASS_OCTAVE, 12, g, octaveLen);
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
  const candidates = id === "beachDemo" ? D_BEACH_RIFF_CANDIDATES : D_RIFF_CANDIDATES;

  const cells: StepCell[] = Array.from({ length: stepsPerBar }, () => ({ on: false, degree: 0 }));
  let n = 0;
  for (let step = 0; step < stepsPerBar; step++) {
    if (!on[step]) continue;
    cells[step] = { on: true, degree: candidates[digits[n % digits.length]] };
    n++;
  }
  return cells;
}
