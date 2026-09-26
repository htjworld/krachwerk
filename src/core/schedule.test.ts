// §11 단계 3의 이벤트 테스트 전부: 쪼개기(hatShape 전환), window, transpose, roll13/stop,
// enterStep, harmony, swing. 실제 scheduleBar를 오디오 컨텍스트 없이 돌려서(eventLog.ts) 그
// 결과 이벤트 목록으로 확인한다. + §14.2 A의 중요도 맵 부분집합 성질.
//
// 필드별 영향 테스트(§9.5)는 여기 없다 — 5개 블루프린트가 다 있어야(compute/metropolis는
// §11 단계 6) 의미가 생기는 테스트라 그때 추가한다.
import { describe, expect, it } from "vitest";
import type { BlueprintSection, LayerCue } from "./blueprint";
import { rateStepActive } from "./blueprint";
import { scheduleBar, type Rig } from "./audioEngine";
import { createEventLog, fakeMix, fakeSampleBank, type LoggedEvent } from "./eventLog";
import { mulberry32 } from "./prng";
import { generatePattern } from "./pattern";
import { resolveLayers } from "./patternOverride";
import { deriveTrack } from "./track";

// 모든 테스트가 공유하는 시드 기반 배경(스케일·보이스·베이스/리드 시퀀스·트랙 편성).
// 이 값 자체를 검증하는 게 아니라 scheduleBar가 큐 해석을 어떻게 하는지만 보는 거라
// 아무 시드나 고정해서 쓴다.
const pattern = generatePattern("schedule-test-fixture");
const track = deriveTrack(pattern);
const layers = resolveLayers(pattern, null);

function baseSection(overrides: Partial<BlueprintSection> & { cues: LayerCue[] }): BlueprintSection {
  return {
    id: "test",
    bars: overrides.bars ?? 16,
    intensity: 0.5,
    drumFamily: "none",
    fill: [],
    filter: { from: 1000, to: 1000 },
    ...overrides,
  };
}

/** section을 (barIndex=sectionBar로 두고) 한 마디만 스케줄해서 이벤트를 뽑는다. */
function scheduleOneBar(
  section: BlueprintSection,
  sectionBar: number,
  opts: { swing?: number; rngSeed?: number } = {}
): LoggedEvent[] {
  const resolved = { ...section, startBar: 0 };
  const log = createEventLog();
  const rig: Rig = {
    ctx: undefined as unknown as Rig["ctx"],
    mix: fakeMix(),
    drums: log.drums,
    voices: {
      bass: log.voice("bass"),
      lead: log.voice("lead"),
      arp: log.voice("arp"),
      seqRiff: log.voice("seqRiff"),
      seqRun: log.voice("seqRun"),
    },
    stabVoices: [log.voice("stab"), log.voice("stab"), log.voice("stab")],
    strips: undefined as unknown as Rig["strips"],
    bank: fakeSampleBank(),
    pattern,
    track,
    layers,
    noise: undefined as unknown as Rig["noise"],
    stepDur: 0.125, // 값 자체는 안 중요하다. 스텝 사이 시간 간격만 봐도 충분하다.
    motifScale: pattern.scale,
    motifRiff: null,
    motifBass: null,
    voiceBank: null,
    sigBuffer: null,
    synthKit: null,
    userKitBuffers: null,
  };
  const rng = mulberry32(opts.rngSeed ?? 1);
  scheduleBar(rig, resolved, sectionBar, sectionBar, sectionBar * 16 * rig.stepDur, rng, opts.swing ?? 0);
  return log.events;
}

function stepsOf(events: LoggedEvent[], layer: string, stepDur: number, barStart: number): number[] {
  return events
    .filter((e) => e.layer === layer)
    .map((e) => Math.round((e.time - barStart) / stepDur))
    .sort((a, b) => a - b);
}

describe("hatShape 전환 (rateSteps, §11 단계 3)", () => {
  const section = baseSection({
    bars: 16,
    cues: [
      {
        layer: "hat",
        enterBar: 0,
        exitBarsBeforeEnd: 0,
        rateSteps: [
          { atBar: 0, rate: 16, hatShape: "offbeat8" },
          { atBar: 8, rate: 16, hatShape: "holes16" },
        ],
      },
    ],
  });

  it("0~7마디는 offbeat8: 스텝 2·3·6·7·10·11·14·15만 친다", () => {
    const events = scheduleOneBar(section, 0);
    expect(stepsOf(events, "hat", 0.125, 0)).toEqual([2, 3, 6, 7, 10, 11, 14, 15]);
  });

  it("8마디부터 holes16: 5·9·13을 뺀 16분을 친다", () => {
    const events = scheduleOneBar(section, 8);
    const barStart = 8 * 16 * 0.125;
    expect(stepsOf(events, "hat", 0.125, barStart)).toEqual([0, 1, 2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15]);
  });
});

describe("window (§11 단계 3, L10)", () => {
  it("window [0,10]이면 스텝 11~15에 드럼 이벤트가 없다", () => {
    const section = baseSection({
      cues: [{ layer: "hat", enterBar: 0, exitBarsBeforeEnd: 0, window: [0, 10], rateSteps: [{ atBar: 0, rate: 16 }] }],
    });
    const events = scheduleOneBar(section, 0);
    const steps = stepsOf(events, "hat", 0.125, 0);
    expect(steps.every((s) => s <= 10)).toBe(true);
    expect(steps).toContain(0);
    expect(steps).toContain(10);
  });
});

describe("transpose (§11 단계 3, L9)", () => {
  it("transpose +1이면 같은 스텝의 bass 주파수가 2^(1/12)배다", () => {
    const cues: LayerCue[] = [{ layer: "bass", enterBar: 0, exitBarsBeforeEnd: 0, rateSteps: [{ atBar: 0, rate: 16 }] }];
    const flat = scheduleOneBar(baseSection({ cues, transpose: 0 }), 0);
    const shifted = scheduleOneBar(baseSection({ cues, transpose: 1 }), 0);
    const flatNote = flat.find((e) => e.layer === "bass" && e.kind === "note");
    const shiftedNote = shifted.find((e) => e.layer === "bass" && e.kind === "note");
    expect(flatNote?.freq).toBeDefined();
    expect(shiftedNote!.freq! / flatNote!.freq!).toBeCloseTo(2 ** (1 / 12), 6);
  });
});

describe("harmony (§11 단계 3)", () => {
  it("harmony [{atBar 2, atStep 8, semitones 3}]이면 마디 2의 스텝 8부터 2^(3/12)배다", () => {
    const cues: LayerCue[] = [{ layer: "bass", enterBar: 0, exitBarsBeforeEnd: 0, rateSteps: [{ atBar: 0, rate: 16 }] }];
    const section = baseSection({ bars: 4, cues, harmony: [{ atBar: 2, atStep: 8, semitones: 3 }] });
    const events = scheduleOneBar(section, 2);
    const barStart = 2 * 16 * 0.125;
    const before = events.find((e) => e.layer === "bass" && Math.round((e.time - barStart) / 0.125) === 0);
    const after = events.find((e) => e.layer === "bass" && Math.round((e.time - barStart) / 0.125) === 8);
    expect(before?.freq).toBeDefined();
    expect(after?.freq).toBeDefined();
    expect(after!.freq! / before!.freq!).toBeCloseTo(2 ** (3 / 12), 6);
  });
});

describe("enterStep (§11 단계 3, L5)", () => {
  const cues: LayerCue[] = [
    { layer: "hat", enterBar: 0, enterStep: 8, exitBarsBeforeEnd: 0, rateSteps: [{ atBar: 0, rate: 16 }] },
  ];
  // bars:3, sectionBar:1을 가운데 마디로 써서 isFill(legacy 필의 "마지막 마디" 판정)이
  // 하이햇을 잘라버리는 것과 안 겹치게 한다 — 여긴 enterStep만 보는 테스트다.
  const section = baseSection({ bars: 3, cues });

  it("진입 마디(sectionBar===enterBar)는 스텝 0~7에 이벤트가 없다", () => {
    const events = scheduleOneBar(section, 0);
    const steps = stepsOf(events, "hat", 0.125, 0);
    expect(steps.every((s) => s >= 8)).toBe(true);
    expect(steps).toContain(8);
  });

  it("다음 마디부터는 enterStep이 안 걸린다(16스텝 다 친다)", () => {
    const events = scheduleOneBar(section, 1);
    const barStart = 1 * 16 * 0.125;
    expect(stepsOf(events, "hat", 0.125, barStart)).toHaveLength(16);
  });
});

describe("fillSteps: roll13 / stop (§11 단계 3)", () => {
  it("roll13은 스텝 0~13에만 이벤트가 있다", () => {
    const section = baseSection({ bars: 1, cues: [], endFill: "roll13" });
    const events = scheduleOneBar(section, 0);
    const steps = stepsOf(events, "kick", 0.125, 0);
    expect(steps).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  });

  it("stop은 스텝 0에만 이벤트가 있다", () => {
    const section = baseSection({ bars: 1, cues: [], endFill: "stop" });
    const events = scheduleOneBar(section, 0);
    expect(stepsOf(events, "kick", 0.125, 0)).toEqual([0]);
  });
});

describe("swing (§11 단계 3)", () => {
  it("swing 0.04면 홀수 스텝만 0.04×stepDur 늦고 짝수 스텝은 그대로다", () => {
    const cues: LayerCue[] = [{ layer: "hat", enterBar: 0, exitBarsBeforeEnd: 0, rateSteps: [{ atBar: 0, rate: 16 }] }];
    const section = baseSection({ cues });
    const stepDur = 0.125;
    const timeByStep = (events: LoggedEvent[]) => {
      const out = new Map<number, number>();
      for (const e of events) if (e.layer === "hat") out.set(Math.round(e.time / stepDur), e.time);
      return out;
    };
    const flat = timeByStep(scheduleOneBar(section, 0, { swing: 0 }));
    const swung = timeByStep(scheduleOneBar(section, 0, { swing: 0.04 }));
    for (let step = 0; step < 16; step++) {
      const expectedDelta = step % 2 === 1 ? 0.04 * stepDur : 0;
      expect(swung.get(step)! - flat.get(step)!).toBeCloseTo(expectedDelta, 9);
    }
  });
});

describe("priority + density 부분집합 성질 (§14.2 A)", () => {
  it("density a < b이면 a에서 치는 스텝 집합이 b에서 치는 스텝 집합의 부분집합이다", () => {
    // 아무 우선순위 표나 상관없다 — 문턱값 공식 자체의 성질을 확인하는 거라서.
    const priority = [10, 250, 40, 200, 5, 255, 60, 190, 20, 230, 30, 210, 15, 180, 25, 220];
    const stepsAt = (density: number) =>
      priority
        .map((_, step) => step)
        .filter((step) => rateStepActive({ atBar: 0, rate: 16, priority, density }, step));
    for (let i = 0; i < 20; i++) {
      const a = i * 12;
      const b = a + 12;
      const setA = new Set(stepsAt(a));
      const setB = new Set(stepsAt(b));
      for (const step of setA) expect(setB.has(step)).toBe(true);
    }
  });
});
