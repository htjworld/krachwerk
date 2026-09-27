// §11 단계 10: f(프레드 어게인..) 스타일 코드가 실제로 렌더 가능한 이벤트를 내는지(크래시
// 없음, 드럼·베이스·목소리 조각이 다 나오는지, 블루프린트 3종이 전부 나오는지, 길이가
// 150~210초 안인지, switchUp의 sub808 킷 전환이 실제로 다른 샘플을 쓰는지).
import { describe, expect, it } from "vitest";
import { generatePattern, type Pattern } from "./pattern";
import { arrangementFor, scheduleBar, secondsPerStep, type Rig } from "./audioEngine";
import { targetSecondsForStyle } from "./genome";
import { createEventLog, fakeMix, fakeSampleBank } from "./eventLog";
import { mulberry32 } from "./prng";
import { deriveTrack } from "./track";
import { resolveLayers } from "./patternOverride";
import { blueprintFor } from "./blueprints";
import { chopPlan, styleBass, styleDrumMaps } from "./styleMotifs";
import { randomStyleCode } from "./seedCode";

function detRand(seed: number): (bytes: Uint8Array) => void {
  const rng = mulberry32(seed);
  return (bytes) => {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(rng() * 256);
  };
}

function buildFakeRig(pattern: Pattern) {
  const track = deriveTrack(pattern);
  const layers = resolveLayers(pattern, null);
  const log = createEventLog();
  const g = pattern.styleGenome!;
  const styleMaps = styleDrumMaps(pattern.blueprintId, g);
  const b = styleBass(pattern.blueprintId, g, pattern.scale);
  const sub808 = {} as AudioBuffer;
  const chopBuffer1 = {} as AudioBuffer;
  Object.defineProperty(chopBuffer1, "duration", { value: 1 });
  const chopBuffer2 = {} as AudioBuffer;
  Object.defineProperty(chopBuffer2, "duration", { value: 1 });
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
    stepDur: secondsPerStep(pattern.tempo * pattern.tempoScale, pattern.stepsPerBar),
    motifScale: pattern.scale,
    motifRiff: null,
    motifBass: { cells: b.cells[0], gateBeats: b.gate },
    voiceBank: null,
    sigBuffer: null,
    synthKit: null,
    userKitBuffers: null,
    tonalBuffer: null,
    blueprint: blueprintFor(pattern.blueprintId),
    styleMaps,
    styleKit: { kick: {} as AudioBuffer, clap: {} as AudioBuffer, openHat: {} as AudioBuffer, perc: {} as AudioBuffer },
    sub808Kit: { kick: sub808 },
    bassSidechain: null,
    hookPlan: null,
    chopPlan: chopPlan(g),
    chopPool: [chopBuffer1, chopBuffer2],
  };
  return { rig, events: log.events, sub808 };
}

function collectEvents(pattern: Pattern) {
  const arrangement = arrangementFor(pattern, pattern.tempo * pattern.tempoScale);
  const { rig, events, sub808 } = buildFakeRig(pattern);
  for (const section of arrangement.sections) {
    for (let sectionBar = 0; sectionBar < section.bars; sectionBar++) {
      const barIndex = section.startBar + sectionBar;
      const rng = mulberry32((pattern.seedHash ^ ((barIndex + 1) * 0x9e3779b9)) >>> 0);
      scheduleBar(rig, section, barIndex, sectionBar, barIndex * arrangement.barSeconds, rng, arrangement.swing);
    }
  }
  return { events, arrangement, sub808 };
}

const SAMPLE_CODES = Array.from({ length: 40 }, (_, i) => randomStyleCode("f", detRand(i + 1)));

describe("f 스타일 코드 (§11 단계 10)", () => {
  it("블루프린트 3종이 표본 안에서 전부 나온다", () => {
    const ids = new Set(SAMPLE_CODES.map((code) => generatePattern(code).blueprintId));
    expect(ids).toEqual(new Set(["garageShuffle", "halfStep", "switchUp"]));
  });

  it.each(SAMPLE_CODES)("%s: 크래시 없이 드럼·베이스·목소리 조각 이벤트를 낸다", (code) => {
    const pattern = generatePattern(code);
    expect(pattern.style).toBe("f");
    expect(["garageShuffle", "halfStep", "switchUp"]).toContain(pattern.blueprintId);
    expect(pattern.stepsPerBar).toBe(16);

    const { events, arrangement } = collectEvents(pattern);
    expect(events.length).toBeGreaterThan(0);
    expect(events.some((e) => e.layer === "kick")).toBe(true);
    expect(events.some((e) => e.layer === "chop")).toBe(true);

    const target = targetSecondsForStyle(pattern.styleGenome!);
    expect(target).toBeGreaterThanOrEqual(150);
    expect(target).toBeLessThanOrEqual(210);
    expect(arrangement.totalSeconds).toBeGreaterThan(140);
    expect(arrangement.totalSeconds).toBeLessThan(220);
  });

  it("switchUp: kitSwap 섹션에서는 sub808 버퍼로, 아닌 섹션에서는 원래 킷으로 킥이 난다", () => {
    const switchUpCode = SAMPLE_CODES.find((code) => generatePattern(code).blueprintId === "switchUp");
    expect(switchUpCode).toBeDefined();
    const pattern = generatePattern(switchUpCode!);
    const blueprint = blueprintFor(pattern.blueprintId);
    const swapSection = blueprint.sections.find((s) => s.kitSwap === "sub808" && s.cues.some((c) => c.layer === "kick"));
    const plainSection = blueprint.sections.find((s) => !s.kitSwap && s.cues.some((c) => c.layer === "kick"));
    expect(swapSection).toBeDefined();
    expect(plainSection).toBeDefined();

    const arrangement = arrangementFor(pattern, pattern.tempo * pattern.tempoScale);
    const { rig, sub808 } = buildFakeRig(pattern);
    const hits: { role: string; sample: unknown }[] = [];
    const originalHit = rig.drums.hit.bind(rig.drums);
    rig.drums.hit = (role, sample, time, level, rate) => {
      hits.push({ role, sample });
      originalHit(role, sample, time, level, rate);
    };

    const withStartBar = { ...swapSection!, startBar: 0 };
    scheduleBar(rig, withStartBar, 0, 0, 0, mulberry32(1), arrangement.swing);
    const swapKicks = hits.filter((h) => h.role === "kick");
    hits.length = 0;
    const plainWithStartBar = { ...plainSection!, startBar: 0 };
    scheduleBar(rig, plainWithStartBar, 0, 0, 0, mulberry32(1), arrangement.swing);
    const plainKicks = hits.filter((h) => h.role === "kick");

    expect(swapKicks.length).toBeGreaterThan(0);
    expect(plainKicks.length).toBeGreaterThan(0);
    expect(swapKicks.every((h) => h.sample === sub808)).toBe(true);
    expect(plainKicks.every((h) => h.sample !== sub808)).toBe(true);
  });

  it("garageShuffle·switchUp은 stop으로 끝난다(§6.3 f 표) — halfStep은 표에 그런 마디가 없어서 voiceEnd로 서서히 빠진다", () => {
    for (const code of SAMPLE_CODES) {
      const pattern = generatePattern(code);
      if (pattern.blueprintId === "halfStep") continue;
      const blueprint = blueprintFor(pattern.blueprintId);
      const last = blueprint.sections[blueprint.sections.length - 1];
      expect(last.endFill).toBe("stop");
    }
  });
});
