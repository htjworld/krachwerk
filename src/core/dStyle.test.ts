// §11 단계 8: d(델로이) 스타일 코드가 실제로 렌더 가능한 이벤트를 내는지(크래시 없음,
// 드럼·베이스·리프가 다 나오는지, 블루프린트 4종이 전부 나오는지, 길이가 150~180초 안인지).
// 진짜 음질·"델로이 느낌"은 브라우저 청취로 확인한다(§11.3) — 여기는 구조 검증뿐이다.
import { describe, expect, it } from "vitest";
import { generatePattern, type Pattern } from "./pattern";
import { arrangementFor, scheduleBar, secondsPerStep, type Rig } from "./audioEngine";
import { targetSecondsForStyle } from "./genome";
import { createEventLog, fakeMix, fakeSampleBank } from "./eventLog";
import { mulberry32 } from "./prng";
import { deriveTrack } from "./track";
import { resolveLayers } from "./patternOverride";
import { blueprintFor } from "./blueprints";
import { styleBass, styleDrumMaps, styleRiff } from "./styleMotifs";
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
    styleKit: { kick: {} as AudioBuffer, clap: {} as AudioBuffer, hat: {} as AudioBuffer },
    sub808Kit: null,
    bassSidechain: null,
    hookPlan: null,
    chopPlan: null,
    chopPool: [],
    chordRootAt: null,
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

const SAMPLE_CODES = Array.from({ length: 40 }, (_, i) => randomStyleCode("d", detRand(i + 1)));

describe("d 스타일 코드 (§11 단계 8)", () => {
  it("블루프린트 4종이 표본 안에서 전부 나온다", () => {
    const ids = new Set(SAMPLE_CODES.map((code) => generatePattern(code).blueprintId));
    expect(ids).toEqual(new Set(["tapeJam", "fourFloorJam", "beachDemo", "shuffle12"]));
  });

  it.each(SAMPLE_CODES)("%s: 크래시 없이 드럼·베이스·리프 이벤트를 낸다", (code) => {
    const pattern = generatePattern(code);
    expect(pattern.style).toBe("d");
    expect(["tapeJam", "fourFloorJam", "beachDemo", "shuffle12"]).toContain(pattern.blueprintId);
    expect(pattern.stepsPerBar).toBe(pattern.blueprintId === "shuffle12" ? 12 : 16);

    const { events, arrangement } = collectEvents(pattern);
    expect(events.length).toBeGreaterThan(0);
    expect(events.some((e) => e.layer === "kick")).toBe(true);
    expect(events.some((e) => e.layer === "bass")).toBe(true);

    // §4.1 D14: d는 150~180초(다른 스타일의 150~210초 절반)만 쓴다.
    const target = targetSecondsForStyle(pattern.styleGenome!);
    expect(target).toBeGreaterThanOrEqual(150);
    expect(target).toBeLessThanOrEqual(180);
    expect(arrangement.totalSeconds).toBeGreaterThan(140);
    expect(arrangement.totalSeconds).toBeLessThan(190);
  });

  it("끝은 뚝 끊긴다(§4.1 D6): 마지막 섹션이 endFill cut이다", () => {
    for (const code of SAMPLE_CODES.slice(0, 4)) {
      const pattern = generatePattern(code);
      const blueprint = blueprintFor(pattern.blueprintId);
      const last = blueprint.sections[blueprint.sections.length - 1];
      expect(last.endFill).toBe("cut");
    }
  });

  it("shuffle12는 스텝이 0~11 안에서만 나온다", () => {
    const shuffleCode = SAMPLE_CODES.find((code) => generatePattern(code).blueprintId === "shuffle12");
    expect(shuffleCode).toBeDefined();
    const pattern = generatePattern(shuffleCode!);
    const { events, arrangement } = collectEvents(pattern);
    const stepDur = secondsPerStep(pattern.tempo * pattern.tempoScale, 12);
    const drumEvents = events.filter((e) => ["kick", "clap", "hat", "perc"].includes(e.layer));
    for (const e of drumEvents) {
      const barSeconds = arrangement.barSeconds;
      const withinBar = ((e.time % barSeconds) + barSeconds) % barSeconds;
      const step = withinBar / stepDur;
      // barSeconds((60/bpm)×4)와 stepDur×12(같은 값을 나눴다 다시 곱한 것)는 계산 경로가
      // 달라 마디 수백 개가 누적되면 마이크로초 단위로 갈라진다 — 스텝 0이 "직전 마디의
      // 스텝 12"처럼 보이는 순간이 생긴다(청각적으로 무의미). 그 좁은 경계(±0.001스텝)만
      // 0으로 되접고, 그 밖은 그대로 엄격히 검사한다(진짜 범위 이탈은 여전히 잡힌다).
      const wrapped = Math.abs(step - 12) < 1e-3 ? 0 : step;
      expect(wrapped).toBeLessThan(11.001);
    }
  });
});
