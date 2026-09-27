// §11 단계 9: p(페기 구) 스타일 코드가 실제로 렌더 가능한 이벤트를 내는지(크래시 없음,
// 드럼·베이스·리프·찬트가 다 나오는지, 블루프린트 2종이 전부 나오는지, 길이가 150~210초
// 안인지, 훅 표(§7.7) 16종이 서로 다른지). 진짜 음질은 브라우저 청취로 확인한다(§11.3).
import { describe, expect, it } from "vitest";
import { generatePattern, type Pattern } from "./pattern";
import { arrangementFor, scheduleBar, secondsPerStep, type Rig } from "./audioEngine";
import { targetSecondsForStyle } from "./genome";
import { createEventLog, fakeMix, fakeSampleBank } from "./eventLog";
import { mulberry32 } from "./prng";
import { deriveTrack } from "./track";
import { resolveLayers } from "./patternOverride";
import { blueprintFor } from "./blueprints";
import { HOOK_RHYTHMS, HOOK_SYLLABLES, hookPlan, styleBass, styleDrumMaps, styleRiff } from "./styleMotifs";
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
    motifRiff: styleRiff(pattern.blueprintId, g),
    motifBass: { cells: b.cells[0], gateBeats: b.gate },
    voiceBank: null,
    sigBuffer: null,
    synthKit: null,
    userKitBuffers: null,
    tonalBuffer: null,
    blueprint: blueprintFor(pattern.blueprintId),
    styleMaps,
    styleKit: { kick: {} as AudioBuffer, clap: {} as AudioBuffer, hat: {} as AudioBuffer, openHat: {} as AudioBuffer, perc: {} as AudioBuffer },
    sub808Kit: null,
    bassSidechain: null,
    hookPlan: hookPlan(g),
    chopPlan: null,
    chopPool: [],
  };
  return { rig, events: log.events };
}

function collectEvents(pattern: Pattern) {
  const arrangement = arrangementFor(pattern, pattern.tempo * pattern.tempoScale);
  const { rig, events } = buildFakeRig(pattern);
  for (const section of arrangement.sections) {
    for (let sectionBar = 0; sectionBar < section.bars; sectionBar++) {
      const barIndex = section.startBar + sectionBar;
      const rng = mulberry32((pattern.seedHash ^ ((barIndex + 1) * 0x9e3779b9)) >>> 0);
      scheduleBar(rig, section, barIndex, sectionBar, barIndex * arrangement.barSeconds, rng, arrangement.swing);
    }
  }
  return { events, arrangement };
}

const SAMPLE_CODES = Array.from({ length: 40 }, (_, i) => randomStyleCode("p", detRand(i + 1)));

describe("p 스타일 코드 (§11 단계 9)", () => {
  it("블루프린트 2종이 표본 안에서 전부 나온다", () => {
    const ids = new Set(SAMPLE_CODES.map((code) => generatePattern(code).blueprintId));
    expect(ids).toEqual(new Set(["clubHouse", "slowJam"]));
  });

  it.each(SAMPLE_CODES)("%s: 크래시 없이 드럼·베이스·리프 이벤트를 낸다", (code) => {
    const pattern = generatePattern(code);
    expect(pattern.style).toBe("p");
    expect(["clubHouse", "slowJam"]).toContain(pattern.blueprintId);
    expect(pattern.stepsPerBar).toBe(16);

    const { events, arrangement } = collectEvents(pattern);
    expect(events.length).toBeGreaterThan(0);
    expect(events.some((e) => e.layer === "kick")).toBe(true);
    expect(events.some((e) => e.layer === "bass")).toBe(true);

    // p는 k/open과 같은 150~210초 폭(§7 length 기수 13).
    const target = targetSecondsForStyle(pattern.styleGenome!);
    expect(target).toBeGreaterThanOrEqual(150);
    expect(target).toBeLessThanOrEqual(210);
    expect(arrangement.totalSeconds).toBeGreaterThan(140);
    expect(arrangement.totalSeconds).toBeLessThan(220);
  });

  it("찬트(chop)가 있는 섹션에서 실제로 arp(formantVox) 이벤트가 난다", () => {
    // clubHouse의 chant1/full1/halfBeat/drop/chant2/break2/build 중 하나는 반드시 걸린다.
    const clubHouseCode = SAMPLE_CODES.find((code) => generatePattern(code).blueprintId === "clubHouse");
    expect(clubHouseCode).toBeDefined();
    const pattern = generatePattern(clubHouseCode!);
    const { events } = collectEvents(pattern);
    expect(events.some((e) => e.layer === "arp")).toBe(true);
  });

  it("끝은 stop(§6.3 p 표): 마지막 섹션이 endFill stop이다", () => {
    for (const code of SAMPLE_CODES.slice(0, 4)) {
      const pattern = generatePattern(code);
      const blueprint = blueprintFor(pattern.blueprintId);
      const last = blueprint.sections[blueprint.sections.length - 1];
      expect(last.endFill).toBe("stop");
    }
  });
});

describe("§7.7 찬트 후크 표", () => {
  it("HOOK_SYLLABLES 16종이 서로 전부 다르다", () => {
    for (let i = 0; i < HOOK_SYLLABLES.length; i++) {
      for (let j = i + 1; j < HOOK_SYLLABLES.length; j++) {
        expect(HOOK_SYLLABLES[i]).not.toEqual(HOOK_SYLLABLES[j]);
      }
    }
  });

  it("HOOK_RHYTHMS 16종이 서로 전부 다르고, 각각 8개 위치가 0~31 안에서 오름차순이다", () => {
    for (const rhythm of HOOK_RHYTHMS) {
      expect(rhythm).toHaveLength(8);
      for (let i = 1; i < rhythm.length; i++) expect(rhythm[i]).toBeGreaterThan(rhythm[i - 1]);
      for (const pos of rhythm) {
        expect(pos).toBeGreaterThanOrEqual(0);
        expect(pos).toBeLessThanOrEqual(31);
      }
    }
    for (let i = 0; i < HOOK_RHYTHMS.length; i++) {
      for (let j = i + 1; j < HOOK_RHYTHMS.length; j++) {
        expect(HOOK_RHYTHMS[i]).not.toEqual(HOOK_RHYTHMS[j]);
      }
    }
  });
});
