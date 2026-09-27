// 260927 §6.3 d-1~d-4: 델로이(d) 블루프린트 4종. §4.1 규칙(D1~D16) 요약:
// 드럼은 곡 전체에서 한 가지 1마디 루프로 고정(styleDrumMaps가 게놈으로 그 루프를 정한다),
// 섹션은 순전히 "레이어 뮤트 스크립트"(경계마다 1~2개만 바뀐다), 끝은 항상 cut.
//
// 창의성 감사(2026-09-27) 후: form%3(인트로 변형 3종, §6.3 "form 필드 해석")을 실제로
// 적용한다 — ⌊form/3⌋가 블루프린트 4종을 고르는 건 그대로고, 나머지 form%3이 인트로를
// 대사/드럼/베이스 셋 중 하나로 바꾼다(applyDIntroVariant). 그전엔 이 나머지 3가지 값이
// 무슨 시드를 넣어도 아무 효과가 없었다 — 같은 블루프린트끼리는 다 똑같은 인트로였다는
// 뜻이라, 게놈 공간의 상당 부분이 죽어 있었다.
//
// dialogue 큐는 실제 대사 샘플이 오기 전까지(§8.1) rig.styleKit에 그 슬롯이 없어서 조용히
// 아무 소리도 안 낸다(scheduleStyleBar의 "샘플 없으면 스킵" 경로) — 파일이 오면 이 블루프린트
// 데이터를 안 건드리고 바로 소리가 붙는다.
import type { Blueprint, BlueprintSection, LayerCue, LayerId } from "../blueprint";

function cue(layer: LayerId, extra: Partial<LayerCue> = {}): LayerCue {
  return { layer, enterBar: 0, exitBarsBeforeEnd: 0, rateSteps: [{ atBar: 0, rate: 16, density: 255 }], ...extra };
}

export const tapeJam: Blueprint = {
  id: "tapeJam",
  style: "d",
  tempoRange: [104, 119],
  swing: 0,
  roundTo: 2,
  kitFamily: "tape",
  lofi: true,
  sections: [
    {
      id: "intro",
      bars: 6,
      intensity: 0.25,
      drumFamily: "none",
      fill: [],
      filter: { from: 6000, to: 6000 },
      cues: [cue("chord"), cue("dialogue")],
    },
    {
      id: "loopIn",
      bars: 16,
      intensity: 0.7,
      drumFamily: "none",
      fill: [],
      filter: { from: 6000, to: 6000 },
      cues: [
        cue("kick"),
        cue("clap"),
        cue("hat"),
        cue("perc"),
        cue("bass"),
        cue("seqRiff", { barGate: 0.3 }),
        cue("dialogue", { barGate: 0.15 }),
      ],
    },
    {
      id: "main",
      bars: 22,
      intensity: 0.8,
      drumFamily: "none",
      fill: [],
      filter: { from: 6000, to: 6000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("perc"), cue("bass"), cue("seqRiff"), cue("dialogue", { barGate: 0.15 })],
    },
    {
      id: "bassSkip",
      bars: 4,
      intensity: 0.75,
      drumFamily: "none",
      fill: [],
      filter: { from: 6000, to: 6000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("perc"), cue("bass", { skipBars: [0, 2] }), cue("seqRiff")],
    },
    {
      id: "main2",
      bars: 20,
      intensity: 0.85,
      drumFamily: "none",
      fill: [],
      filter: { from: 6000, to: 6000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("perc"), cue("bass"), cue("seqRiff")],
    },
    {
      id: "end",
      bars: 2,
      intensity: 0.2,
      drumFamily: "none",
      fill: [],
      endFill: "cut",
      filter: { from: 6000, to: 6000 },
      cues: [],
    },
  ],
};

export const fourFloorJam: Blueprint = {
  id: "fourFloorJam",
  style: "d",
  tempoRange: [116, 131],
  swing: 0,
  roundTo: 2,
  kitFamily: "tape",
  lofi: true,
  sidechain: { synthDb: -11, bassDb: 0, releaseBeats: 0.5 },
  sections: [
    {
      id: "intro",
      bars: 2,
      intensity: 0.25,
      drumFamily: "none",
      fill: [],
      filter: { from: 6000, to: 6000 },
      cues: [cue("seqRiff"), cue("dialogue")],
    },
    {
      id: "drumsIn",
      bars: 1,
      intensity: 0.6,
      drumFamily: "none",
      fill: [],
      filter: { from: 6000, to: 6000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("openHat"), cue("perc")],
    },
    {
      id: "bassIn",
      bars: 9,
      intensity: 0.75,
      drumFamily: "none",
      fill: [],
      filter: { from: 6000, to: 6000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("openHat"), cue("perc"), cue("bass"), cue("seqRiff", { barGate: 0.45 })],
    },
    {
      id: "groove",
      bars: 28,
      intensity: 0.85,
      drumFamily: "none",
      fill: [],
      filter: { from: 6000, to: 6000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("openHat"), cue("perc"), cue("bass"), cue("seqRiff")],
    },
    {
      id: "grooveShout",
      bars: 2,
      intensity: 0.85,
      drumFamily: "none",
      fill: [],
      filter: { from: 6000, to: 6000 },
      cues: [
        cue("kick"),
        cue("clap"),
        cue("hat"),
        cue("openHat"),
        cue("perc"),
        cue("bass"),
        cue("seqRiff"),
        cue("dialogue", { barGate: 0.4 }),
      ],
    },
    {
      id: "groove2",
      bars: 28,
      intensity: 0.85,
      drumFamily: "none",
      fill: [],
      filter: { from: 6000, to: 6000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("openHat"), cue("perc"), cue("bass"), cue("seqRiff")],
    },
    {
      id: "bassOut",
      bars: 2,
      intensity: 0.7,
      drumFamily: "none",
      fill: [],
      filter: { from: 6000, to: 6000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("openHat"), cue("perc"), cue("seqRiff"), cue("dialogue", { barGate: 0.4 })],
    },
    {
      id: "bassBack",
      bars: 2,
      intensity: 0.8,
      drumFamily: "none",
      fill: [],
      filter: { from: 6000, to: 6000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("openHat"), cue("perc"), cue("bass"), cue("seqRiff")],
    },
    {
      id: "end",
      bars: 1,
      intensity: 0.2,
      drumFamily: "none",
      fill: [],
      endFill: "cut",
      filter: { from: 6000, to: 6000 },
      cues: [],
    },
  ],
};

export const beachDemo: Blueprint = {
  id: "beachDemo",
  style: "d",
  tempoRange: [104, 119],
  tempoScale: 0.75,
  swing: 0,
  roundTo: 2,
  kitFamily: "tape",
  lofi: true,
  sections: [
    { id: "bassIn", bars: 2, intensity: 0.35, drumFamily: "none", fill: [], filter: { from: 5000, to: 5000 }, cues: [cue("bass")] },
    {
      id: "main",
      bars: 16,
      intensity: 0.75,
      drumFamily: "none",
      fill: [],
      filter: { from: 5000, to: 5000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("bass"), cue("seqRiff")],
    },
    {
      id: "noSynth",
      bars: 6,
      intensity: 0.65,
      drumFamily: "none",
      fill: [],
      filter: { from: 5000, to: 5000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("bass")],
    },
    {
      id: "main2",
      bars: 8,
      intensity: 0.75,
      drumFamily: "none",
      fill: [],
      filter: { from: 5000, to: 5000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("bass"), cue("seqRiff")],
    },
    {
      id: "noSynth2",
      bars: 8,
      intensity: 0.65,
      drumFamily: "none",
      fill: [],
      filter: { from: 5000, to: 5000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("bass")],
    },
    {
      id: "main3",
      bars: 12,
      intensity: 0.75,
      drumFamily: "none",
      fill: [],
      filter: { from: 5000, to: 5000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("bass"), cue("seqRiff")],
    },
    {
      id: "noSynth3",
      bars: 4,
      intensity: 0.65,
      drumFamily: "none",
      fill: [],
      filter: { from: 5000, to: 5000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("bass")],
    },
    {
      id: "end",
      bars: 2,
      intensity: 0.2,
      drumFamily: "none",
      fill: [],
      endFill: "cut",
      filter: { from: 5000, to: 5000 },
      cues: [],
    },
  ],
};

export const shuffle12: Blueprint = {
  id: "shuffle12",
  style: "d",
  tempoRange: [115, 130],
  stepsPerBar: 12,
  swing: 0,
  roundTo: 2,
  kitFamily: "tape",
  lofi: true,
  sections: [
    {
      id: "drumsOnly",
      bars: 4,
      intensity: 0.6,
      drumFamily: "none",
      fill: [],
      filter: { from: 6000, to: 6000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("perc")],
    },
    {
      id: "synthIn",
      bars: 2,
      intensity: 0.65,
      drumFamily: "none",
      fill: [],
      filter: { from: 6000, to: 6000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("perc"), cue("seqRiff")],
    },
    {
      id: "leadIn",
      bars: 6,
      intensity: 0.7,
      drumFamily: "none",
      fill: [],
      filter: { from: 6000, to: 6000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("perc"), cue("seqRiff"), cue("lead")],
    },
    {
      id: "full",
      bars: 14,
      intensity: 0.85,
      drumFamily: "none",
      fill: [],
      filter: { from: 6000, to: 6000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("perc"), cue("seqRiff"), cue("lead"), cue("bass")],
    },
    {
      id: "thin",
      bars: 10,
      intensity: 0.6,
      drumFamily: "none",
      fill: [],
      filter: { from: 6000, to: 6000 },
      cues: [
        cue("kick"),
        cue("clap"),
        cue("hat", { rateSteps: [{ atBar: 0, rate: 16, density: 120 }] }),
        cue("perc"),
        cue("seqRiff"),
        cue("lead"),
        cue("bass"),
      ],
    },
    {
      id: "noLead",
      bars: 4,
      intensity: 0.8,
      drumFamily: "none",
      fill: [],
      filter: { from: 6000, to: 6000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("perc"), cue("seqRiff"), cue("bass")],
    },
    {
      id: "full2",
      bars: 12,
      intensity: 0.85,
      drumFamily: "none",
      fill: [],
      filter: { from: 6000, to: 6000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("perc"), cue("seqRiff"), cue("lead"), cue("bass")],
    },
    {
      id: "noSynth",
      bars: 6,
      intensity: 0.75,
      drumFamily: "none",
      fill: [],
      filter: { from: 6000, to: 6000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("perc"), cue("lead"), cue("bass")],
    },
    {
      id: "full3",
      bars: 6,
      intensity: 0.85,
      drumFamily: "none",
      fill: [],
      filter: { from: 6000, to: 6000 },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("perc"), cue("seqRiff"), cue("lead"), cue("bass")],
    },
    {
      id: "end",
      bars: 2,
      intensity: 0.2,
      drumFamily: "none",
      fill: [],
      endFill: "cut",
      filter: { from: 6000, to: 6000 },
      cues: [],
    },
  ],
};

export const DELROY_BLUEPRINTS: readonly Blueprint[] = [tapeJam, fourFloorJam, beachDemo, shuffle12];

/** d 스타일 form(기수 12) → 블루프린트. ⌊v/3⌋가 4종을 고른다(§6.3 "form 필드 해석"). */
export function dBlueprintIdFor(form: number): "tapeJam" | "fourFloorJam" | "beachDemo" | "shuffle12" {
  return (["tapeJam", "fourFloorJam", "beachDemo", "shuffle12"] as const)[Math.floor(form / 3) % 4];
}

function dIntroSection(variant: number, filterFrom: number): BlueprintSection {
  if (variant === 1) {
    // 드럼 먼저(4마디, D4 Bixby 모양).
    return {
      id: "intro",
      bars: 4,
      intensity: 0.6,
      drumFamily: "none",
      fill: [],
      filter: { from: filterFrom, to: filterFrom },
      cues: [cue("kick"), cue("clap"), cue("hat"), cue("perc")],
    };
  }
  if (variant === 2) {
    // 베이스 먼저(2마디, D4 Sloane 모양).
    return {
      id: "intro",
      bars: 2,
      intensity: 0.35,
      drumFamily: "none",
      fill: [],
      filter: { from: filterFrom, to: filterFrom },
      cues: [cue("bass")],
    };
  }
  // 대사 인트로(드럼 없이 신스+대사, tapeJam 기본형).
  return {
    id: "intro",
    bars: 4,
    intensity: 0.25,
    drumFamily: "none",
    fill: [],
    filter: { from: filterFrom, to: filterFrom },
    cues: [cue("chord"), cue("dialogue")],
  };
}

/** form%3(인트로 변형 3종, §6.3). tapeJam의 첫 섹션(대사+코드 인트로)만 드럼/베이스
 *  인트로로 바꿔 끼운다 — fourFloorJam/beachDemo/shuffle12는 이미 서로 다른 고유 인트로가
 *  있어서 그대로 둔다(안 그러면 이 함수가 그 인트로들을 조용히 지워버린다). */
export function applyDIntroVariant(blueprint: Blueprint, form: number): Blueprint {
  if (blueprint.id !== "tapeJam") return blueprint;
  const variant = form % 3;
  const filterFrom = blueprint.sections[0]?.filter.from ?? 6000;
  return { ...blueprint, sections: [dIntroSection(variant, filterFrom), ...blueprint.sections.slice(1)] };
}
