// §11.1: k(얼굴 버튼) 코드가 기본 compute/metropolis와 실제로 다른 이벤트를 낸다는 증거.
// 유일성의 핵심은 codeRead 섹션(§6.3 kraftwerkK.ts) — 기본 코드에는 그 섹션 자체가 없다.
import { describe, expect, it } from "vitest";
import { generatePattern, type Pattern } from "./pattern";
import { arrangementFor, scheduleBar, secondsPerStep, type Rig } from "./audioEngine";
import { createEventLog, fakeMix, fakeSampleBank } from "./eventLog";
import { mulberry32 } from "./prng";
import { deriveTrack } from "./track";
import { resolveLayers } from "./patternOverride";
import { blueprintFamily } from "./blueprint";
import { blueprintFor } from "./blueprints";
import { computeBass, computeRiff, computeScale, metropolisBass, metropolisScale, metropolisSeq } from "./motifs";

function buildFakeRig(pattern: Pattern) {
  const family = blueprintFamily(pattern.blueprintId);
  const track = deriveTrack(pattern);
  const layers = resolveLayers(pattern, null);
  const log = createEventLog();
  const motifScale =
    family === "compute" ? computeScale(pattern.genome) : family === "metropolis" ? metropolisScale(pattern.genome) : pattern.scale;
  const motifRiff =
    family === "compute" ? computeRiff(pattern.genome) : family === "metropolis" ? metropolisSeq(pattern.genome) : null;
  const motifBass =
    family === "compute"
      ? { cells: computeBass(pattern.genome), gateBeats: null }
      : family === "metropolis"
        ? (() => {
            const b = metropolisBass(pattern.genome);
            return { cells: b.cells, gateBeats: b.gateBeats };
          })()
        : null;
  // 로봇 목소리(calls)가 실제로 울리는지 보려고 코드에 나오는 글자마다 더미 버퍼를 채운다.
  const voiceBank = new Map([...new Set(pattern.seedInput)].map((c) => [c, {} as AudioBuffer]));
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
    motifScale,
    motifRiff,
    motifBass,
    voiceBank,
    sigBuffer: null,
    synthKit: null,
    userKitBuffers: null,
    tonalBuffer: null,
    blueprint: blueprintFor(pattern.blueprintId),
    styleMaps: null,
    styleKit: null,
    sub808Kit: null,
    bassSidechain: null,
    hookPlan: null,
    chopPlan: null,
    chopPool: [],
  };
  return { rig, events: log.events };
}

function collectEvents(pattern: Pattern, arrangement: ReturnType<typeof arrangementFor>) {
  const { rig, events } = buildFakeRig(pattern);
  for (const section of arrangement.sections) {
    for (let sectionBar = 0; sectionBar < section.bars; sectionBar++) {
      const barIndex = section.startBar + sectionBar;
      const rng = mulberry32((pattern.seedHash ^ ((barIndex + 1) * 0x9e3779b9)) >>> 0);
      scheduleBar(rig, section, barIndex, sectionBar, barIndex * arrangement.barSeconds, rng, arrangement.swing);
    }
  }
  return events;
}

describe("k 스타일 코드 (§11.1 k vs 기본 코드 구별)", () => {
  it("codeRead 섹션이 있고 로봇 목소리(calls)가 실제로 울린다", () => {
    const pattern = generatePattern("k000000000000000");
    expect(pattern.style).toBe("k");
    expect(["computeK", "metropolisK"]).toContain(pattern.blueprintId);

    const arrangement = arrangementFor(pattern, pattern.tempo * pattern.tempoScale);
    expect(arrangement.sections.some((s) => s.id === "codeRead")).toBe(true);

    const events = collectEvents(pattern, arrangement);
    expect(events.some((e) => e.layer === "calls")).toBe(true);
  });

  it("기본 compute 코드(8자)에는 codeRead 섹션이 없다", () => {
    const openPattern = generatePattern("00000000");
    expect(openPattern.style).toBe("open");
    const arrangement = arrangementFor(openPattern, openPattern.tempo);
    expect(arrangement.sections.some((s) => s.id === "codeRead")).toBe(false);
  });
});
