// 테크노 장르(open) 회귀 스냅샷. 고정 코드 20개로 실제 scheduleBar를 오디오 컨텍스트 없이
// 돌려서 이벤트 목록의 개수 + FNV-1a64 다이제스트를 낸 뒤 __fixtures__/open-code-snapshot.json과
// 비교한다(eventLog.ts 재사용). 이 테스트가 깨지면 같은 공유 링크가 다른 곡을 낸다는 뜻이니
// 의도한 변경이 아니면 원인을 찾는다.
import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/open-code-snapshot.json";
import { generatePattern, type Pattern } from "./pattern";
import { arrangementFor, scheduleBar, secondsPerStep, type Rig } from "./audioEngine";
import { createEventLog, fakeMix, fakeSampleBank, type LoggedEvent } from "./eventLog";
import { mulberry32 } from "./prng";
import { deriveTrack } from "./track";
import { resolveLayers } from "./patternOverride";
import { computeBass, computeRiff, computeScale, metropolisBass, metropolisScale, metropolisSeq } from "./motifs";
import { encodeSeed, familySpace } from "./seedCode";
import { blueprintFor } from "./blueprints";

// 결정론적 표본 — 항상 유효한 테크노(open) 장르 코드.
function sampleCodes(count: number): string[] {
  const out: string[] = [];
  const space = familySpace("open");
  let a = 0x9e3779b9;
  for (let i = 0; i < count; i++) {
    a = (Math.imul(a, 1103515245) + 12345) >>> 0;
    out.push(encodeSeed("open", (BigInt(a) * 0x9e3779b97n) % space));
  }
  return out;
}

export const SNAPSHOT_CODES: readonly string[] = ["t000000000", "zzzzzzzzzz", ...sampleCodes(18)];

function buildFakeRig(pattern: Pattern): { rig: Rig; events: LoggedEvent[] } {
  const track = deriveTrack(pattern);
  const layers = resolveLayers(pattern, null);
  const log = createEventLog();
  const motifScale =
    pattern.blueprintId === "compute"
      ? computeScale(pattern.genome)
      : pattern.blueprintId === "metropolis"
        ? metropolisScale(pattern.genome)
        : pattern.scale;
  const motifRiff =
    pattern.blueprintId === "compute"
      ? computeRiff(pattern.genome)
      : pattern.blueprintId === "metropolis"
        ? metropolisSeq(pattern.genome)
        : null;
  const motifBass =
    pattern.blueprintId === "compute"
      ? { cells: computeBass(pattern.genome), gateBeats: null }
      : pattern.blueprintId === "metropolis"
        ? (() => {
            const b = metropolisBass(pattern.genome);
            return { cells: b.cells, gateBeats: b.gateBeats };
          })()
        : null;
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
    stepDur: secondsPerStep(pattern.tempo),
    motifScale,
    motifRiff,
    motifBass,
    voiceBank: null,
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
    chordRootAt: null,
  };
  return { rig, events: log.events };
}

/** 실제 renderArrangement의 섹션·마디 루프를 오디오 컨텍스트 없이 그대로 재현한다. */
export function collectOpenCodeEvents(code: string): LoggedEvent[] {
  const pattern = generatePattern(code);
  const arrangement = arrangementFor(pattern, pattern.tempo);
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

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK64 = (1n << 64n) - 1n;

function fnv1a64(input: string): bigint {
  let hash = FNV_OFFSET;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * FNV_PRIME) & MASK64;
  }
  return hash;
}

export function digestEvents(events: LoggedEvent[]): string {
  const parts = events.map(
    (e) => `${e.kind}|${e.layer}|${e.time}|${e.level}|${e.freq ?? ""}|${e.duration ?? ""}|${e.rate ?? ""}`
  );
  return fnv1a64(parts.join("\n")).toString(16);
}

interface SnapshotEntry {
  code: string;
  count: number;
  digest: string;
}

describe("테크노 장르 회귀 스냅샷", () => {
  const entries = fixture as SnapshotEntry[];

  it("고정된 코드 20개와 정확히 같다", () => {
    expect(entries.map((e) => e.code)).toEqual([...SNAPSHOT_CODES]);
  });

  it.each(entries)("$code: 이벤트 개수·다이제스트가 스냅샷과 같다", ({ code, count, digest }) => {
    const events = collectOpenCodeEvents(code);
    expect(events.length).toBe(count);
    expect(digestEvents(events)).toBe(digest);
  });
});
