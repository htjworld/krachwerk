// 260927 §6.3 f-1~f-3: 프레드 어게인..(f) 블루프린트 3종. §4.3 규칙 중 이번 단계에서 실제로
// 반영한 것: 목소리 조각(chop)이 곡의 중심(거의 모든 섹션에 있다), 사이드체인이 크다,
// 드롭아웃·전환이 잦다, switchUp의 sub808 킷 전환.
//
// 창의성 감사(2026-09-27) 후: form 안 구조 변형(voiceStop 유무 등)을 applyFFormVariant로
// 적용한다 — switchUp은 스펙대로 이 비트와 무관하다("비트1과 무관하게 전환이 항상 있다").
//
// ponytail(단순화, 여전히 남아 있음):
// - chord 레이어는 실제 진행(§7.4)을 stabVoices로 재생한다(styleMotifs.ts fChordRootAt) —
//   pad 재사용은 아니다(창의성 감사에서 고쳤다, k 음색이 섞이던 문제).
// - switchUp의 "sub" 전용 레이어는 따로 안 만든다 — kitSwap: "sub808"이 kick 큐의 킷 자체를
//   바꿔서 같은 효과를 낸다(styleMotifs.ts switchUpMaps 위 comment).
import type { Blueprint, BlueprintSection, LayerCue, LayerId } from "../blueprint";

function cue(layer: LayerId, extra: Partial<LayerCue> = {}): LayerCue {
  return { layer, enterBar: 0, exitBarsBeforeEnd: 0, rateSteps: [{ atBar: 0, rate: 16, density: 255 }], ...extra };
}

export const garageShuffle: Blueprint = {
  id: "garageShuffle",
  style: "f",
  tempoRange: [117, 132],
  tempoScale: 1.05,
  swing: 0.26,
  roundTo: 4,
  kitFamily: "garage",
  sidechain: { synthDb: -10, bassDb: -18, releaseBeats: 0.7 },
  synthWidth: 1.0,
  sections: [
    { id: "voiceAlone", bars: 4, intensity: 0.3, drumFamily: "none", fill: [], filter: { from: 6000, to: 6000 }, cues: [cue("chop")] },
    {
      id: "chordsIn",
      bars: 4,
      intensity: 0.4,
      drumFamily: "none",
      fill: [],
      filter: { from: 6000, to: 6000 },
      cues: [cue("chord"), cue("chop"), cue("clapLayer")],
    },
    {
      id: "build",
      bars: 8,
      intensity: 0.5,
      drumFamily: "none",
      fill: [],
      filter: { from: 6000, to: 6000 },
      cues: [cue("chord"), cue("chop"), cue("clapLayer"), cue("openHat")],
    },
    {
      id: "drop1",
      bars: 10,
      intensity: 0.75,
      drumFamily: "none",
      fill: [],
      filter: { from: 8000, to: 8000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("openHat"), cue("perc"), cue("bass"), cue("chord"), cue("chop", { barGate: 0.4 })],
    },
    {
      id: "bassOut1",
      bars: 6,
      intensity: 0.65,
      drumFamily: "none",
      fill: [],
      filter: { from: 8000, to: 8000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("openHat"), cue("perc"), cue("chord"), cue("chop")],
    },
    {
      id: "main1",
      bars: 8,
      intensity: 0.85,
      drumFamily: "none",
      fill: [],
      filter: { from: 8000, to: 8000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("openHat"), cue("perc"), cue("bass"), cue("chord"), cue("chop")],
    },
    {
      id: "bassOut2",
      bars: 2,
      intensity: 0.65,
      drumFamily: "none",
      fill: [],
      filter: { from: 8000, to: 8000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("openHat"), cue("perc"), cue("chord"), cue("chop")],
    },
    {
      id: "main2",
      bars: 6,
      intensity: 0.85,
      drumFamily: "none",
      fill: [],
      filter: { from: 8000, to: 8000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("openHat"), cue("perc"), cue("bass"), cue("chord"), cue("chop")],
    },
    {
      id: "bassOut3",
      bars: 2,
      intensity: 0.65,
      drumFamily: "none",
      fill: [],
      filter: { from: 8000, to: 8000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("openHat"), cue("perc"), cue("chord"), cue("chop")],
    },
    {
      id: "breakdown",
      bars: 14,
      intensity: 0.4,
      drumFamily: "none",
      fill: [],
      chordBreak: true,
      filter: { from: 5000, to: 5000 },
      cues: [cue("chord"), cue("chop")],
    },
    {
      id: "drumsBack",
      bars: 8,
      intensity: 0.7,
      drumFamily: "none",
      fill: [],
      drumGainDb: -6,
      filter: { from: 7000, to: 7000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("openHat"), cue("perc"), cue("bass"), cue("chord"), cue("chop")],
    },
    { id: "voiceStop", bars: 4, intensity: 0.3, drumFamily: "none", fill: [], filter: { from: 6000, to: 6000 }, cues: [cue("chop")] },
    {
      id: "drop2",
      bars: 14,
      intensity: 0.9,
      drumFamily: "none",
      fill: [],
      filter: { from: 8500, to: 8500 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("openHat"), cue("perc"), cue("bass"), cue("chord"), cue("chop")],
    },
    {
      id: "switch",
      bars: 4,
      intensity: 0.9,
      drumFamily: "none",
      fill: [],
      beatShift: 1,
      filter: { from: 8500, to: 8500 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("openHat"), cue("perc"), cue("bass"), cue("chord"), cue("chop")],
    },
    {
      id: "outro",
      bars: 6,
      intensity: 0.6,
      drumFamily: "none",
      fill: [],
      beatShift: 1,
      drumGainDb: -6,
      filter: { from: 6000, to: 6000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("openHat"), cue("perc"), cue("chord"), cue("chop")],
    },
    { id: "end", bars: 1, intensity: 0.1, drumFamily: "none", fill: [], endFill: "stop", filter: { from: 6000, to: 6000 }, cues: [] },
  ],
};

export const halfStep: Blueprint = {
  id: "halfStep",
  style: "f",
  tempoRange: [106, 121],
  tempoScale: 0.75,
  swing: 0,
  roundTo: 2,
  kitFamily: "garage",
  sidechain: { synthDb: -1, bassDb: -2, releaseBeats: 0.4 },
  synthWidth: 1.0,
  sections: [
    {
      id: "intro",
      bars: 1,
      intensity: 0.4,
      drumFamily: "none",
      fill: [],
      filter: { from: 6000, to: 6000 },
      cues: [
        cue("kick", { window: [0, 10] }),
        cue("clap", { window: [0, 10] }),
        cue("hat", { window: [0, 10] }),
        cue("chop"),
      ],
    },
    {
      id: "dbv",
      bars: 3,
      intensity: 0.6,
      drumFamily: "none",
      fill: [],
      filter: { from: 6500, to: 6500 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("bass"), cue("chop")],
    },
    {
      id: "full1",
      bars: 4,
      intensity: 0.7,
      drumFamily: "none",
      fill: [],
      filter: { from: 7000, to: 7000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("bass"), cue("chop"), cue("chord")],
    },
    {
      id: "dropOut1",
      bars: 6,
      intensity: 0.5,
      drumFamily: "none",
      fill: [],
      filter: { from: 6000, to: 6000 },
      cues: [cue("hat"), cue("clap"), cue("chord"), cue("chop")],
    },
    {
      id: "full2",
      bars: 16,
      intensity: 0.8,
      drumFamily: "none",
      fill: [],
      filter: { from: 7500, to: 7500 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("bass", { skipBars: [7, 11] }), cue("chord"), cue("chop")],
    },
    { id: "dropOut2", bars: 6, intensity: 0.4, drumFamily: "none", fill: [], filter: { from: 5500, to: 5500 }, cues: [] },
    {
      id: "full3",
      bars: 7,
      intensity: 0.8,
      drumFamily: "none",
      fill: [],
      filter: { from: 7500, to: 7500 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("bass"), cue("chord"), cue("chop")],
    },
    { id: "fullStop", bars: 2, intensity: 0.35, drumFamily: "none", fill: [], filter: { from: 6000, to: 6000 }, cues: [cue("chord"), cue("chop")] },
    { id: "dropOut3", bars: 4, intensity: 0.4, drumFamily: "none", fill: [], filter: { from: 5500, to: 5500 }, cues: [] },
    {
      id: "full4",
      bars: 10,
      intensity: 0.85,
      drumFamily: "none",
      fill: [],
      filter: { from: 8000, to: 8000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("bass"), cue("chord"), cue("chop")],
    },
    {
      id: "bassOut",
      bars: 2,
      intensity: 0.7,
      drumFamily: "none",
      fill: [],
      filter: { from: 7000, to: 7000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("chord"), cue("chop")],
    },
    {
      id: "strip",
      bars: 2,
      intensity: 0.55,
      drumFamily: "none",
      fill: [],
      filter: { from: 6000, to: 6000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("chop")],
    },
    { id: "voiceEnd", bars: 3, intensity: 0.25, drumFamily: "none", fill: [], filter: { from: 5000, to: 5000 }, cues: [cue("chop")] },
  ],
};

export const switchUp: Blueprint = {
  id: "switchUp",
  style: "f",
  tempoRange: [117, 132],
  swing: 0.1,
  roundTo: 4,
  kitFamily: "garage",
  sidechain: { synthDb: -10, bassDb: -28, releaseBeats: 0.6 },
  synthWidth: 0.9,
  sections: [
    { id: "intro", bars: 6, intensity: 0.3, drumFamily: "none", fill: [], filter: { from: 6000, to: 6000 }, cues: [cue("chord"), cue("chop")] },
    {
      id: "full1",
      bars: 8,
      intensity: 0.85,
      drumFamily: "none",
      fill: [],
      filter: { from: 8000, to: 8000 },
      cues: [cue("kick"), cue("clap"), cue("openHat"), cue("perc"), cue("bass"), cue("chord"), cue("chop")],
    },
    {
      id: "bassOut",
      bars: 4,
      intensity: 0.7,
      drumFamily: "none",
      fill: [],
      filter: { from: 7000, to: 7000 },
      cues: [cue("kick"), cue("clap"), cue("openHat"), cue("perc"), cue("chop")],
    },
    {
      id: "full2",
      bars: 16,
      intensity: 0.85,
      drumFamily: "none",
      fill: [],
      filter: { from: 8000, to: 8000 },
      cues: [cue("kick"), cue("clap"), cue("openHat"), cue("perc"), cue("bass", { skipBars: [9] }), cue("chord"), cue("chop")],
    },
    { id: "stop1", bars: 1, intensity: 0.2, drumFamily: "none", fill: [], filter: { from: 6000, to: 6000 }, cues: [cue("chop")] },
    {
      id: "full3",
      bars: 7,
      intensity: 0.85,
      drumFamily: "none",
      fill: [],
      filter: { from: 8000, to: 8000 },
      cues: [cue("kick"), cue("clap"), cue("openHat"), cue("perc"), cue("bass"), cue("chord"), cue("chop")],
    },
    { id: "stop2", bars: 1, intensity: 0.2, drumFamily: "none", fill: [], filter: { from: 6000, to: 6000 }, cues: [cue("chord"), cue("chop")] },
    {
      id: "full4",
      bars: 16,
      intensity: 0.85,
      drumFamily: "none",
      fill: [],
      filter: { from: 8000, to: 8000 },
      cues: [cue("kick"), cue("clap"), cue("openHat"), cue("perc"), cue("bass", { skipBars: [9] }), cue("chord"), cue("chop")],
    },
    { id: "stop3", bars: 1, intensity: 0.2, drumFamily: "none", fill: [], filter: { from: 6000, to: 6000 }, cues: [cue("chop")] },
    {
      id: "switchIn",
      bars: 4,
      intensity: 0.9,
      drumFamily: "none",
      fill: [],
      kitSwap: "sub808",
      filter: { from: 8500, to: 8500 },
      cues: [cue("kick"), cue("clap"), cue("openHat"), cue("perc"), cue("bass"), cue("chord"), cue("chop")],
    },
    { id: "stop4", bars: 1, intensity: 0.2, drumFamily: "none", fill: [], filter: { from: 6000, to: 6000 }, cues: [cue("chop")] },
    {
      id: "sub808",
      bars: 10,
      intensity: 0.9,
      drumFamily: "none",
      fill: [],
      kitSwap: "sub808",
      filter: { from: 8500, to: 8500 },
      cues: [cue("kick"), cue("clap"), cue("openHat"), cue("perc"), cue("bass"), cue("chord"), cue("chop")],
    },
    {
      id: "halfFeel",
      bars: 8,
      intensity: 0.75,
      drumFamily: "none",
      fill: [],
      kitSwap: "sub808",
      filter: { from: 7000, to: 7000 },
      cues: [cue("kick"), cue("clap", { rateSteps: [{ atBar: 0, rate: 4 }] }), cue("openHat"), cue("bass"), cue("chord")],
      drumOverride: { clap: [8] },
    },
    { id: "outro", bars: 7, intensity: 0.35, drumFamily: "none", fill: [], filter: { from: 5500, to: 5500 }, cues: [cue("chord")] },
    { id: "end", bars: 2, intensity: 0.1, drumFamily: "none", fill: [], endFill: "stop", filter: { from: 6000, to: 6000 }, cues: [] },
  ],
};

export const FRED_BLUEPRINTS: readonly Blueprint[] = [garageShuffle, halfStep, switchUp];

/** f 스타일 form(기수 12) → 블루프린트. ⌊v/4⌋가 3종을 고른다(§6.3 "form 필드 해석"). */
export function fBlueprintIdFor(form: number): "garageShuffle" | "halfStep" | "switchUp" {
  return (["garageShuffle", "halfStep", "switchUp"] as const)[Math.floor(form / 4) % 3];
}

/**
 * form 안 구조 변형(§6.3, v%4): garageShuffle — 비트0 voiceStop 유무, 비트1 끝(비트전환 뒤
 * 아웃트로/목소리만으로 끝). halfStep — 같은 비트 자리를 빌려 dropOut3·strip 섹션 유무로
 * 비슷한 "덜어내기" 변화를 준다(halfStep 표에는 garageShuffle만큼 명시적인 토글이 없다).
 * switchUp — 스펙대로 이 비트와 무관하다("비트1과 무관하게 전환이 항상 있다").
 */
export function applyFFormVariant(blueprint: Blueprint, form: number): Blueprint {
  const v = form % 4;
  if (blueprint.id === "garageShuffle") {
    let sections: BlueprintSection[] = [...blueprint.sections];
    if ((v & 1) === 0) sections = sections.filter((s) => s.id !== "voiceStop");
    if (((v >> 1) & 1) === 0) {
      const endIdx = sections.length - 1;
      const before = sections.filter((s) => s.id !== "switch" && s.id !== "outro" && s !== sections[endIdx]);
      const voiceOnly: BlueprintSection = {
        id: "voiceOnly",
        bars: 4,
        intensity: 0.3,
        drumFamily: "none",
        fill: [],
        filter: { from: 5000, to: 5000 },
        cues: [cue("chop")],
      };
      sections = [...before, voiceOnly, sections[endIdx]];
    }
    return { ...blueprint, sections };
  }
  if (blueprint.id === "halfStep") {
    let sections: BlueprintSection[] = [...blueprint.sections];
    if ((v & 1) === 0) sections = sections.filter((s) => s.id !== "dropOut3");
    if (((v >> 1) & 1) === 0) sections = sections.filter((s) => s.id !== "strip");
    return { ...blueprint, sections };
  }
  return blueprint;
}
