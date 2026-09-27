// 260927 §6.3 p-1/p-2: 페기 구(p) 블루프린트 2종. §4.2 규칙(P1~P16) 중 이번 단계에서 실제로
// 반영한 것: P1(두 얼굴 130/102), P2(DJ 인트로), P4(브레이크→halfBeat→build→drop),
// P6(스윙), P9(베이스 2마디 루프), P12(찬트 후크), P13(신스 폭).
//
// 창의성 감사(2026-09-27) 후: form 안의 구조 변형(두 번째 브레이크 유무·인트로 순서·아웃트로
// 종류, clubHouse form&0b111 / slowJam (form-8)&0b11)을 applyPFormVariant로 실제로 적용한다
// — 그전엔 이 비트들이 죽어 있어서 같은 블루프린트는 항상 같은 순서로만 나왔다.
import type { Blueprint, BlueprintSection, LayerCue, LayerId } from "../blueprint";

function cue(layer: LayerId, extra: Partial<LayerCue> = {}): LayerCue {
  return { layer, enterBar: 0, exitBarsBeforeEnd: 0, rateSteps: [{ atBar: 0, rate: 16, density: 255 }], ...extra };
}

export const clubHouse: Blueprint = {
  id: "clubHouse",
  style: "p",
  tempoRange: [117, 132],
  swing: 0.19,
  roundTo: 4,
  kitFamily: "house",
  sidechain: { synthDb: -3, bassDb: -3, releaseBeats: 0.4 },
  synthWidth: 0.8,
  sections: [
    {
      id: "djIntro",
      bars: 4,
      intensity: 0.7,
      drumFamily: "none",
      fill: [],
      filter: { from: 8000, to: 8000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("openHat"), cue("bass")],
    },
    {
      id: "synthIn",
      bars: 12,
      intensity: 0.8,
      drumFamily: "none",
      fill: [],
      filter: { from: 8000, to: 8000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("openHat"), cue("perc"), cue("bass"), cue("seqRiff")],
    },
    {
      id: "chant1",
      bars: 8,
      intensity: 0.8,
      drumFamily: "none",
      fill: [],
      filter: { from: 8000, to: 8000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("openHat"), cue("perc"), cue("bass"), cue("chop")],
    },
    {
      id: "full1",
      bars: 18,
      intensity: 0.85,
      drumFamily: "none",
      fill: [],
      filter: { from: 8000, to: 8000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("openHat"), cue("perc"), cue("bass"), cue("chop"), cue("seqRiff")],
    },
    {
      id: "inst1",
      bars: 10,
      intensity: 0.8,
      drumFamily: "none",
      fill: [],
      filter: { from: 8000, to: 8000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("openHat"), cue("perc"), cue("bass"), cue("seqRiff")],
    },
    {
      id: "break",
      bars: 4,
      intensity: 0.45,
      drumFamily: "none",
      fill: [],
      chordBreak: true,
      filter: { from: 6000, to: 6000 },
      cues: [cue("seqRiff"), cue("chord")],
    },
    {
      id: "halfBeat",
      bars: 6,
      intensity: 0.55,
      drumFamily: "none",
      fill: [],
      drumGainDb: -20,
      chordBreak: true,
      filter: { from: 6000, to: 6000 },
      cues: [
        cue("kick", { rateSteps: [{ atBar: 0, rate: 4 }] }),
        cue("clap", { rateSteps: [{ atBar: 0, rate: 4 }] }),
        cue("chord"),
        cue("chop"),
        cue("seqRiff"),
      ],
      drumOverride: { kick: [4, 12], clap: [4, 12] },
    },
    {
      id: "drumsBack",
      bars: 1,
      intensity: 0.75,
      drumFamily: "none",
      fill: [],
      filter: { from: 8000, to: 8000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("openHat"), cue("perc")],
    },
    {
      id: "drop",
      bars: 8,
      intensity: 0.9,
      drumFamily: "none",
      fill: [],
      filter: { from: 8000, to: 8000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("openHat"), cue("perc"), cue("bass"), cue("chop")],
    },
    {
      id: "inst2",
      bars: 6,
      intensity: 0.8,
      drumFamily: "none",
      fill: [],
      filter: { from: 8000, to: 8000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("openHat"), cue("perc"), cue("bass")],
    },
    {
      id: "chant2",
      bars: 8,
      intensity: 0.85,
      drumFamily: "none",
      fill: [],
      filter: { from: 8000, to: 8000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("openHat"), cue("perc"), cue("bass"), cue("chop")],
    },
    {
      id: "break2",
      bars: 4,
      intensity: 0.45,
      drumFamily: "none",
      fill: [],
      filter: { from: 6000, to: 6000 },
      cues: [cue("seqRiff"), cue("chop")],
    },
    {
      id: "build",
      bars: 4,
      intensity: 0.9,
      drumFamily: "none",
      fill: [],
      endFill: "snareRoll16",
      filter: { from: 8000, to: 8000 },
      cues: [
        cue("kick"),
        cue("clap"),
        cue("hat"),
        cue("openHat"),
        cue("perc"),
        cue("bass"),
        cue("seqRiff"),
        cue("chop"),
        cue("riser"),
      ],
    },
    {
      id: "main",
      bars: 8,
      intensity: 0.9,
      drumFamily: "none",
      fill: [],
      filter: { from: 8000, to: 8000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("openHat"), cue("perc"), cue("bass"), cue("seqRiff")],
    },
    {
      id: "outro",
      bars: 4,
      intensity: 0.6,
      drumFamily: "none",
      fill: [],
      filter: { from: 8000, to: 8000 },
      cues: [
        cue("kick"),
        cue("clap"),
        cue("hat", { rateSteps: [{ atBar: 0, rate: 16, density: 255 }] }),
        cue("openHat"),
        cue("perc"),
      ],
    },
    {
      id: "end",
      bars: 1,
      intensity: 0.15,
      drumFamily: "none",
      fill: [],
      endFill: "stop",
      filter: { from: 8000, to: 8000 },
      cues: [],
    },
  ],
};

export const slowJam: Blueprint = {
  id: "slowJam",
  style: "p",
  tempoRange: [117, 132],
  tempoScale: 0.8,
  swing: 0,
  roundTo: 4,
  kitFamily: "house",
  sidechain: { synthDb: -2, bassDb: -13, releaseBeats: 0.6 },
  synthWidth: 0.9,
  sections: [
    {
      id: "intro",
      bars: 4,
      intensity: 0.3,
      drumFamily: "none",
      fill: [],
      filter: { from: 6000, to: 6000 },
      cues: [cue("bass"), cue("chord")],
    },
    {
      id: "drumsIn",
      bars: 4,
      intensity: 0.6,
      drumFamily: "none",
      fill: [],
      filter: { from: 6000, to: 6000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("bass"), cue("chord")],
    },
    {
      id: "verse1",
      bars: 8,
      intensity: 0.65,
      drumFamily: "none",
      fill: [],
      filter: { from: 6000, to: 6000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("bass"), cue("chord"), cue("lead")],
    },
    {
      id: "pre",
      bars: 4,
      intensity: 0.6,
      drumFamily: "none",
      fill: [],
      filter: { from: 6000, to: 6000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("bass"), cue("lead")],
    },
    {
      id: "chorus1",
      bars: 12,
      intensity: 0.8,
      drumFamily: "none",
      fill: [],
      filter: { from: 6000, to: 6000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("bass"), cue("lead"), cue("chord"), cue("chop")],
    },
    {
      id: "turn",
      bars: 2,
      intensity: 0.8,
      drumFamily: "none",
      fill: [],
      filter: { from: 6000, to: 6000 },
      cues: [
        cue("kick"),
        cue("clap"),
        cue("hat", { rateSteps: [{ atBar: 0, rate: 16, density: 150 }] }),
        cue("bass"),
        cue("lead"),
        cue("chord"),
        cue("chop"),
      ],
    },
    {
      id: "verse2",
      bars: 8,
      intensity: 0.75,
      drumFamily: "none",
      fill: [],
      filter: { from: 6000, to: 6000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("bass"), cue("lead")],
    },
    {
      id: "chorus2",
      bars: 24,
      intensity: 0.85,
      drumFamily: "none",
      fill: [],
      filter: { from: 6000, to: 6000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("bass"), cue("lead"), cue("chord"), cue("chop")],
    },
    {
      id: "outro",
      bars: 4,
      intensity: 0.55,
      drumFamily: "none",
      fill: [],
      filter: { from: 6000, to: 6000 },
      cues: [
        cue("kick"),
        cue("clap"),
        cue("hat", { rateSteps: [{ atBar: 0, rate: 16, density: 195 }] }),
        cue("bass"),
        cue("lead"),
        cue("chord"),
        cue("chop"),
      ],
    },
    {
      id: "end",
      bars: 2,
      intensity: 0.15,
      drumFamily: "none",
      fill: [],
      endFill: "stop",
      filter: { from: 6000, to: 6000 },
      cues: [],
    },
  ],
};

export const PEGGY_BLUEPRINTS: readonly Blueprint[] = [clubHouse, slowJam];

/** p 스타일 form(기수 12) → 블루프린트. v<8 clubHouse / v≥8 slowJam(§6.3 "form 필드 해석"). */
export function pBlueprintIdFor(form: number): "clubHouse" | "slowJam" {
  return form < 8 ? "clubHouse" : "slowJam";
}

function swapSections(sections: readonly BlueprintSection[], idA: string, idB: string): BlueprintSection[] {
  const ia = sections.findIndex((s) => s.id === idA);
  const ib = sections.findIndex((s) => s.id === idB);
  if (ia < 0 || ib < 0) return [...sections];
  const copy = [...sections];
  [copy[ia], copy[ib]] = [copy[ib], copy[ia]];
  return copy;
}

/**
 * form 안 구조 변형(§6.3): clubHouse는 v&0b111 그대로 — 비트0 두 번째 브레이크(break2+
 * build) 유무, 비트1 synthIn/chant1 순서(신스 먼저/찬트 먼저), 비트2 아웃트로(드럼만/드럼+
 * seqRiff). slowJam은 (v−8)&0b11 — 비트0 인트로 순서(오르간+건반 먼저/드럼 먼저), 비트1
 * turn 유무.
 */
export function applyPFormVariant(blueprint: Blueprint, form: number): Blueprint {
  if (blueprint.id === "clubHouse") {
    let sections: readonly BlueprintSection[] = blueprint.sections;
    if ((form & 1) === 0) sections = sections.filter((s) => s.id !== "break2" && s.id !== "build");
    if ((form >> 1) & 1) sections = swapSections(sections, "synthIn", "chant1");
    if ((form >> 2) & 1) {
      sections = sections.map((s) => (s.id === "outro" ? { ...s, cues: [...s.cues, cue("seqRiff")] } : s));
    }
    return { ...blueprint, sections: [...sections] };
  }
  if (blueprint.id === "slowJam") {
    const v = form - 8;
    let sections: readonly BlueprintSection[] = blueprint.sections;
    if (v & 1) sections = swapSections(sections, "intro", "drumsIn");
    if (((v >> 1) & 1) === 0) sections = sections.filter((s) => s.id !== "turn");
    return { ...blueprint, sections: [...sections] };
  }
  return blueprint;
}
