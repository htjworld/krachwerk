// §11 단계 5: styleMaps 드럼 경로(scheduleStyleBar)의 이벤트 테스트. 실제 d/p/f 블루프린트는
// 단계 8~10에 나오므로, 여기서는 손으로 만든 블루프린트/게놈으로 메커니즘 자체만 본다
// (§6.1 "소리 변화 없음" — generatePattern으로는 아직 d/p/f를 만들 수 없다).
import { describe, expect, it } from "vitest";
import { generatePattern, type Pattern } from "./pattern";
import {
  barJitterSeconds,
  barStartSeconds,
  scheduleBar,
  secondsPerStep,
  tapeJitterMs,
  tapeLowpassHz,
  type DrumRole,
  type Rig,
} from "./audioEngine";
import { rateStepActive, type Blueprint, type BlueprintSection, type LayerCue } from "./blueprint";
import type { Section } from "./arrangement";
import type { DrumMap } from "./styleMotifs";
import { fakeMix, fakeRecordingGain } from "./eventLog";
import { mulberry32 } from "./prng";

interface FakeHit {
  role: DrumRole;
  sample: unknown;
  time: number;
  level: number;
  rate: number;
}

// eventLog.ts의 LoggedEvent는 role/시간/세기만 남기고 샘플 정체성을 버린다. kitSwap
// 테스트는 "어느 킷 객체가 왔는지"를 봐야 해서 여기선 직접 만든 가벼운 기록기를 쓴다.
function fakeDrums(): { drums: Rig["drums"]; log: FakeHit[] } {
  const log: FakeHit[] = [];
  const drums: Rig["drums"] = {
    hit(role, sample, time, level, rate = 1) {
      log.push({ role, sample, time, level, rate });
    },
    hitSlice(role, sample, _offset, _dur, time, level, rate = 1) {
      log.push({ role, sample, time, level, rate });
    },
    connect() {},
    kickHighpass: {
      frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, value: 20 },
    } as unknown as Rig["drums"]["kickHighpass"],
  };
  return { drums, log };
}

function basePattern(overrides: Partial<Pattern> = {}): Pattern {
  const base = generatePattern("00000000"); // open 아무 시드나 — 값 자체는 안 본다
  return {
    ...base,
    style: "d",
    styleGenome: { style: "d" },
    seedInput: "d000000000000000",
    blueprintId: "tapeJam",
    stepsPerBar: 16,
    tempoScale: 1,
    seedHash: 777,
    ...overrides,
  };
}

function baseBlueprint(overrides: Partial<Blueprint> = {}): Blueprint {
  return { id: "tapeJam", style: "d", tempoRange: [104, 119], swing: 0, sections: [], ...overrides };
}

function baseSection(overrides: Partial<BlueprintSection> & { cues: LayerCue[] }): Section {
  return {
    id: "test",
    startBar: 0,
    bars: 4,
    intensity: 0.5,
    drumFamily: "none",
    fill: [],
    filter: { from: 1000, to: 1000 },
    ...overrides,
  };
}

function buildRig(
  pattern: Pattern,
  opts: {
    styleMaps?: Partial<Record<string, DrumMap>>;
    blueprint?: Blueprint;
    styleKit?: Partial<Record<DrumRole, AudioBuffer>>;
    sub808Kit?: Partial<Record<DrumRole, AudioBuffer>>;
    bassSidechain?: GainNode | null;
    mixOverride?: Partial<Rig["mix"]>;
  } = {}
): { rig: Rig; log: FakeHit[] } {
  const { drums, log } = fakeDrums();
  const rig: Rig = {
    ctx: undefined as unknown as Rig["ctx"],
    mix: { ...fakeMix(), ...opts.mixOverride },
    drums,
    voices: undefined as unknown as Rig["voices"],
    stabVoices: [],
    strips: undefined as unknown as Rig["strips"],
    bank: undefined as unknown as Rig["bank"],
    pattern,
    track: undefined as unknown as Rig["track"],
    layers: undefined as unknown as Rig["layers"],
    noise: undefined as unknown as Rig["noise"],
    stepDur: secondsPerStep(120, pattern.stepsPerBar),
    motifScale: pattern.scale,
    motifRiff: null,
    motifBass: null,
    voiceBank: null,
    sigBuffer: null,
    synthKit: null,
    userKitBuffers: null,
    tonalBuffer: null,
    blueprint: opts.blueprint ?? baseBlueprint(),
    styleMaps: (opts.styleMaps as Rig["styleMaps"]) ?? {},
    styleKit: opts.styleKit ?? { kick: {} as AudioBuffer, clap: {} as AudioBuffer, hat: {} as AudioBuffer },
    sub808Kit: opts.sub808Kit ?? {},
    bassSidechain: opts.bassSidechain ?? null,
    hookPlan: null,
    chopPlan: null,
    chopPool: [],
  };
  return { rig, log };
}

const noRng = () => 0;
const allOn16: DrumMap = { priority: Array(16).fill(200), velocity: Array(16).fill(0.8) };
const kickCueAllOn: LayerCue = {
  layer: "kick",
  enterBar: 0,
  exitBarsBeforeEnd: 0,
  rateSteps: [{ atBar: 0, rate: 16, density: 255 }],
};

function stepOf(rig: Rig, time: number): number {
  return Math.round(time / rig.stepDur);
}

describe("scheduleStyleBar (§11 단계 5)", () => {
  it("stepsPerBar 12: 이벤트 스텝이 0~11 안에서만 나온다", () => {
    const pattern = basePattern({ stepsPerBar: 12 });
    const map12: DrumMap = { priority: Array(12).fill(200), velocity: Array(12).fill(0.8) };
    const section = baseSection({ cues: [kickCueAllOn] });
    const { rig, log } = buildRig(pattern, { styleMaps: { kick: map12 } });
    scheduleBar(rig, section, 0, 0, 0, noRng, 0);
    expect(log.length).toBe(12);
    expect(Math.max(...log.map((e) => stepOf(rig, e.time)))).toBeLessThanOrEqual(11);
  });

  it("16칸 전용 FillKind(roll13)는 12칸 블루프린트에서 0~11로 잘린다", () => {
    const pattern = basePattern({ stepsPerBar: 12 });
    const section = baseSection({ cues: [], bars: 1, endFill: "roll13" });
    const { rig, log } = buildRig(pattern, {});
    scheduleBar(rig, section, 0, 0, 0, noRng, 0);
    expect(log.length).toBe(12); // roll13 = 0..13, 12칸에선 0..11만 남는다
    expect(log.every((e) => stepOf(rig, e.time) <= 11)).toBe(true);
  });

  it("drumOverride가 있으면 중요도 맵 대신 그 스텝만 친다", () => {
    const pattern = basePattern();
    const silentMap: DrumMap = { priority: Array(16).fill(0), velocity: Array(16).fill(0.8) };
    const cue: LayerCue = { ...kickCueAllOn, rateSteps: [{ atBar: 0, rate: 16, density: 0 }] };
    const section = baseSection({ cues: [cue], drumOverride: { kick: [0, 8] } });
    const { rig, log } = buildRig(pattern, { styleMaps: { kick: silentMap } });
    scheduleBar(rig, section, 0, 0, 0, noRng, 0);
    expect(log.map((e) => stepOf(rig, e.time)).sort((a, b) => a - b)).toEqual([0, 8]);
  });

  it("barGate 0이면 여러 마디에 걸쳐 항상 꺼져 있다", () => {
    const pattern = basePattern({ seedHash: 42 });
    const cue: LayerCue = { ...kickCueAllOn, barGate: 0 };
    const section = baseSection({ cues: [cue], bars: 30 });
    const { rig, log } = buildRig(pattern, { styleMaps: { kick: allOn16 } });
    for (let bar = 0; bar < 30; bar++) scheduleBar(rig, section, bar, bar, bar * 16 * rig.stepDur, noRng, 0);
    expect(log.length).toBe(0);
  });

  it("barGate 1이면 항상 켜져 있다", () => {
    const pattern = basePattern({ seedHash: 99 });
    const cue: LayerCue = { ...kickCueAllOn, barGate: 1 };
    const section = baseSection({ cues: [cue], bars: 10 });
    const { rig, log } = buildRig(pattern, { styleMaps: { kick: allOn16 } });
    for (let bar = 0; bar < 10; bar++) scheduleBar(rig, section, bar, bar, bar * 16 * rig.stepDur, noRng, 0);
    expect(log.length).toBe(10 * 16);
  });

  it("skipBars에 있는 마디는 꺼지고, 없는 마디는 켜진다", () => {
    const pattern = basePattern();
    const cue: LayerCue = { ...kickCueAllOn, skipBars: [1] };
    const section = baseSection({ cues: [cue], bars: 4 });
    const { rig, log: log0 } = buildRig(pattern, { styleMaps: { kick: allOn16 } });
    scheduleBar(rig, section, 0, 0, 0, noRng, 0);
    expect(log0.length).toBe(16);
    const { rig: rig1, log: log1 } = buildRig(pattern, { styleMaps: { kick: allOn16 } });
    scheduleBar(rig1, section, 1, 1, 16 * rig1.stepDur, noRng, 0);
    expect(log1.length).toBe(0);
  });

  it("beatShift만큼 드럼 전체가 뒤로 밀린다", () => {
    const pattern = basePattern();
    const oneStepMap: DrumMap = { priority: [255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], velocity: allOn16.velocity };
    const cue: LayerCue = { ...kickCueAllOn, rateSteps: [{ atBar: 0, rate: 16, density: 1 }] };
    const section = baseSection({ cues: [cue], beatShift: 1 });
    const { rig, log } = buildRig(pattern, { styleMaps: { kick: oneStepMap } });
    scheduleBar(rig, section, 0, 0, 0, noRng, 0);
    expect(log.length).toBe(1);
    expect(log[0].time).toBeCloseTo(rig.stepDur, 9);
  });

  it("kitSwap: sub808 섹션은 sub808Kit에서 샘플을 가져온다", () => {
    const pattern = basePattern();
    const mainKick = {} as AudioBuffer;
    const subKick = {} as AudioBuffer;
    const section = baseSection({ cues: [kickCueAllOn], bars: 1, kitSwap: "sub808" });
    const { rig, log } = buildRig(pattern, {
      styleMaps: { kick: allOn16 },
      styleKit: { kick: mainKick },
      sub808Kit: { kick: subKick },
    });
    scheduleBar(rig, section, 0, 0, 0, noRng, 0);
    expect(log.length).toBeGreaterThan(0);
    expect(log.every((e) => e.sample === subKick)).toBe(true);
  });

  it("drumGainDb는 마디마다 드럼 버스 게인에 오토메이션으로 찍힌다", () => {
    const pattern = basePattern();
    const drumGain = fakeRecordingGain();
    const section = baseSection({ cues: [], drumGainDb: -6 });
    const { rig } = buildRig(pattern, { mixOverride: { drum: drumGain.node } });
    scheduleBar(rig, section, 0, 0, 0, noRng, 0);
    expect(drumGain.calls[0]?.method).toBe("setValueAtTime");
    expect(drumGain.calls[0]?.value).toBeCloseTo(10 ** (-6 / 20), 6);
  });

  it("blueprint.sidechain이 있으면 킥마다 신스·베이스 사이드체인에 오토메이션을 남긴다", () => {
    const pattern = basePattern();
    const synthSidechain = fakeRecordingGain();
    const bassSidechain = fakeRecordingGain();
    const blueprint = baseBlueprint({ sidechain: { synthDb: -10, bassDb: -18, releaseBeats: 0.6 } });
    const section = baseSection({ cues: [kickCueAllOn] });
    const { rig, log } = buildRig(pattern, {
      styleMaps: { kick: allOn16 },
      blueprint,
      mixOverride: { sidechain: synthSidechain.node },
      bassSidechain: bassSidechain.node,
    });
    scheduleBar(rig, section, 0, 0, 0, noRng, 0);
    expect(log.length).toBe(16);
    expect(synthSidechain.calls[0]?.value).toBeCloseTo(10 ** (-10 / 20), 6);
    expect(bassSidechain.calls[0]?.value).toBeCloseTo(10 ** (-18 / 20), 6);
  });

  it("blueprint.sidechain이 없으면 bassSidechain에는 아무것도 안 찍는다", () => {
    const pattern = basePattern();
    const bassSidechain = fakeRecordingGain();
    const section = baseSection({ cues: [kickCueAllOn] });
    const { rig } = buildRig(pattern, { styleMaps: { kick: allOn16 }, bassSidechain: bassSidechain.node });
    scheduleBar(rig, section, 0, 0, 0, noRng, 0);
    expect(bassSidechain.calls.length).toBe(0);
  });

  it("세기표(velocity)가 스텝마다 그대로 레벨에 쓰인다", () => {
    const pattern = basePattern();
    const velocity = Array.from({ length: 16 }, (_, i) => i / 16);
    const map: DrumMap = { priority: Array(16).fill(255), velocity };
    const section = baseSection({ cues: [kickCueAllOn] });
    const { rig, log } = buildRig(pattern, { styleMaps: { kick: map } });
    scheduleBar(rig, section, 0, 0, 0, noRng, 0);
    for (const e of log) expect(e.level).toBeCloseTo(velocity[stepOf(rig, e.time)], 9);
  });

  it("RateStep.velocity가 있으면 세기표보다 우선한다", () => {
    const pattern = basePattern();
    const cue: LayerCue = {
      ...kickCueAllOn,
      rateSteps: [{ atBar: 0, rate: 16, density: 255, velocity: Array(16).fill(0.99) }],
    };
    const section = baseSection({ cues: [cue] });
    const { rig, log } = buildRig(pattern, { styleMaps: { kick: allOn16 } });
    scheduleBar(rig, section, 0, 0, 0, noRng, 0);
    expect(log.every((e) => Math.abs(e.level - 0.99) < 1e-9)).toBe(true);
  });

  it("snareRoll16은 clap을 16분 전부, 세기 0.4→1.0으로 친다", () => {
    const pattern = basePattern();
    const section = baseSection({ cues: [], bars: 1, endFill: "snareRoll16" });
    const { rig, log } = buildRig(pattern, {});
    scheduleBar(rig, section, 0, 0, 0, noRng, 0);
    expect(log.length).toBe(16);
    expect(log.every((e) => e.role === "clap")).toBe(true);
    expect(log[0].level).toBeCloseTo(0.4, 9);
    expect(log[15].level).toBeCloseTo(1.0, 9);
  });

  it("cut은 stop과 같은 스텝(0)에 킥 한 번만 친다", () => {
    const pattern = basePattern();
    const section = baseSection({ cues: [], bars: 2, endFill: "cut" });
    const { rig, log } = buildRig(pattern, {});
    scheduleBar(rig, section, 1, 1, 0, noRng, 0);
    expect(log).toEqual([expect.objectContaining({ role: "kick" })]);
    expect(stepOf(rig, log[0].time)).toBe(0);
  });

  it("stepsPerBar 12에서는 swing을 무시한다", () => {
    const pattern = basePattern({ stepsPerBar: 12 });
    const map12: DrumMap = { priority: Array(12).fill(255), velocity: Array(12).fill(0.8) };
    const section = baseSection({ cues: [kickCueAllOn] });
    const { rig, log } = buildRig(pattern, { styleMaps: { kick: map12 } });
    scheduleBar(rig, section, 0, 0, 0, noRng, 0.3);
    const step1 = log.find((e) => Math.round(e.time / rig.stepDur) === 1 || Math.abs(e.time / rig.stepDur - 1) < 0.05);
    expect(step1?.time).toBeCloseTo(rig.stepDur, 9);
  });

  it("stepsPerBar 16에서는 홀수 스텝에 swing이 그대로 적용된다", () => {
    const pattern = basePattern({ stepsPerBar: 16 });
    const section = baseSection({ cues: [kickCueAllOn] });
    const { rig, log } = buildRig(pattern, { styleMaps: { kick: allOn16 } });
    scheduleBar(rig, section, 0, 0, 0, noRng, 0.3);
    const step1 = log.find((e) => Math.abs(e.time / rig.stepDur - 1.3) < 1e-6);
    expect(step1).toBeDefined();
  });
});

describe("중요도 맵 부분집합 성질 (§11 단계 5)", () => {
  it("density가 커질수록 켜지는 스텝 집합이 항상 부분집합이다", () => {
    const rng = mulberry32(123);
    for (let trial = 0; trial < 200; trial++) {
      const priority = Array.from({ length: 16 }, () => Math.floor(rng() * 256));
      const a = Math.floor(rng() * 256);
      const b = Math.floor(rng() * 256);
      const [lo, hi] = a < b ? [a, b] : [b, a];
      const stepsAt = (density: number) =>
        new Set(Array.from({ length: 16 }, (_, s) => s).filter((s) => rateStepActive({ atBar: 0, rate: 16, density, priority }, s)));
      const stepsLo = stepsAt(lo);
      const stepsHi = stepsAt(hi);
      for (const s of stepsLo) expect(stepsHi.has(s)).toBe(true);
    }
  });
});

describe("마디 흔들림 barJitterSeconds (§6.5 item 3)", () => {
  it("open/k(tape 게놈 없음)는 항상 0이다", () => {
    const pattern = generatePattern("00000000");
    expect(barJitterSeconds(pattern, 5)).toBe(0);
  });

  it("d(tape 있음)는 항상 ±J 안이다", () => {
    for (let tape = 0; tape < 16; tape++) {
      const j = tapeJitterMs(tape) / 1000;
      for (let bar = 0; bar < 40; bar++) {
        const pattern = basePattern({ styleGenome: { style: "d", tape }, seedHash: (bar * 97 + tape * 31 + 1) >>> 0 });
        expect(Math.abs(barJitterSeconds(pattern, bar))).toBeLessThanOrEqual(j + 1e-9);
      }
    }
  });

  it("barStartSeconds는 마디 0에서도 절대 음수가 아니다 (실제로 브라우저에서 크래시난 버그: " +
    "지터가 음수일 때 마디 0의 절대 시각이 음수가 돼서 Web Audio API의 setValueAtTime/start가 던졌다)", () => {
    for (let tape = 0; tape < 16; tape++) {
      for (let seedHash = 0; seedHash < 200; seedHash++) {
        const pattern = basePattern({ styleGenome: { style: "d", tape }, seedHash });
        expect(barStartSeconds(pattern, 0, 2.0)).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("tape 게놈 분해 (§7.3, §6.5 item 2 — 흔들림 4단계 × 로파이 로우패스 4단계 = 16)", () => {
  it("tape 0~15가 (지터, 로우패스) 조합 16개를 정확히 한 번씩 덮는다", () => {
    const seen = new Set<string>();
    for (let tape = 0; tape < 16; tape++) {
      const j = tapeJitterMs(tape);
      const lp = tapeLowpassHz(tape);
      expect([4, 8, 14, 20]).toContain(j);
      expect([1500, 3000, 5000, 7500]).toContain(lp);
      seen.add(`${j}:${lp}`);
    }
    expect(seen.size).toBe(16);
  });
});
