// compute 블루프린트: "It's More Fun to Compute / Home Computer"(3-D 라이브판) 분석을
// 3분(92마디 @122BPM) 기준으로 옮긴 것. §6.3 표, §4장 분석이 원본이다.
//
// 드럼(kick/lowDrum/tick)의 실제 on/off는 여기 cues의 rateSteps가 아니라
// motifs.ts의 familyDrumHit(section.drumFamily, genome, barIndex)이 정한다 — cues는
// "이 레이어가 이 마디에 켜져 있는가"(enterBar/window 등)만 결정한다. 신스 레이어
// (bass/lead/seqRiff/seqRun/stab/drone/calls)는 실제로 §11 단계 6에서 게놈 기반으로
// 새로 만든다(motifs.ts의 computeRiff/computeBass 등) — Pattern.bass/lead 자체는
// legacy 방식(rng)으로 채워져 있지만 audioEngine.ts가 blueprintId==="compute"일 때
// 이 파일이 만든 리프/베이스로 바꿔 쓴다.
import type { Blueprint, BlueprintSection, LayerCue, LayerId, RateStep } from "../blueprint";

// §14.2 A. 뒷박 8분(2·6·10·14)=250, 나머지 짝수·홀수 고스트=180, 스텝1=120, 5·9·13=0.
const HAT_PRIORITY = [180, 120, 250, 180, 180, 0, 250, 180, 180, 0, 250, 180, 180, 0, 250, 180];
const HAT_DENSITY_OFFBEAT8 = 130;
const HAT_DENSITY_HOLES16 = 255;

function cue(layer: LayerId, overrides: Partial<LayerCue> = {}): LayerCue {
  return { layer, enterBar: 0, exitBarsBeforeEnd: 0, rateSteps: [{ atBar: 0, rate: 16 }], ...overrides };
}

function hatCue(steps: { atBar: number; density: number }[], overrides: Partial<LayerCue> = {}): LayerCue {
  const rateSteps: RateStep[] = steps.map((s) => ({ atBar: s.atBar, rate: 16, priority: HAT_PRIORITY, density: s.density }));
  return { layer: "hat", enterBar: 0, exitBarsBeforeEnd: 0, rateSteps, ...overrides };
}

function section(
  spec: Omit<BlueprintSection, "intensity" | "fill" | "filter"> & Partial<Pick<BlueprintSection, "intensity" | "fill" | "filter">>
): BlueprintSection {
  return { intensity: 0.7, fill: [], filter: { from: 4000, to: 12000 }, ...spec };
}

const OPEN = 18000;

export const compute: Blueprint = {
  id: "compute",
  tempoRange: [114, 129],
  swing: 0,
  sections: [
    // 1. callIntro (0–3): 드럼 없음, calls만.
    section({
      id: "callIntro",
      bars: 4,
      intensity: 0.15,
      drumFamily: "none",
      cues: [cue("calls")],
      filter: { from: 1200, to: 2000 },
    }),

    // 2. aGroove (4–19): lowSeq16 즉시 진입, 햇은 4번째 마디 뒤(섹션 5번째 마디)부터 offbeat8.
    section({
      id: "aGroove",
      bars: 8,
      intensity: 0.5,
      drumFamily: "lowSeq16",
      cues: [cue("lowDrum"), hatCue([{ atBar: 4, density: HAT_DENSITY_OFFBEAT8 }])],
      filter: { from: 2000, to: 5000 },
    }),

    // 3. aLift (20–31): 햇이 holes16으로 쪼개진다. seqRun은 마지막 4마디에만.
    section({
      id: "aLift",
      bars: 8,
      intensity: 0.65,
      drumFamily: "lowSeq16",
      cues: [
        cue("lowDrum"),
        hatCue([{ atBar: 0, density: HAT_DENSITY_HOLES16 }]),
        cue("seqRun", { enterBar: 4 }),
      ],
      filter: { from: 5000, to: 9000 },
    }),

    // 4. bridge (32–39): 새 재료(seqRiff) 진입 자리라 fourFloor로 덜 쪼갠다. 필은 마지막
    //    마디에 stepFill.
    section({
      id: "bridge",
      bars: 4,
      intensity: 0.45,
      drumFamily: "fourFloor",
      cues: [cue("kick"), hatCue([{ atBar: 0, density: HAT_DENSITY_OFFBEAT8 }]), cue("seqRiff")],
      endFill: "stepFill",
      filter: { from: 3000, to: 6000 },
    }),

    // 5. bGroove (40–51): 베이스·seqRiff 진입, 햇 holes16. 2마디마다 pickup15 필.
    section({
      id: "bGroove",
      bars: 8,
      intensity: 0.7,
      drumFamily: "fourFloor",
      cues: [cue("kick"), cue("backbeat"), hatCue([{ atBar: 0, density: HAT_DENSITY_HOLES16 }]), cue("bass"), cue("seqRiff")],
      fill: [{ everyBars: 2, kind: "pickup15", atBarInCycle: 1 }],
      filter: { from: 6000, to: 11000 },
    }),

    // 6. burst (52–55): +1반음, 전 타악 16분, 베이스 한 음 지속(스텝0만 켠다).
    section({
      id: "burst",
      bars: 4,
      intensity: 1,
      transpose: 1,
      gainDb: 4,
      drumFamily: "burst16",
      cues: [cue("kick"), cue("backbeat"), hatCue([{ atBar: 0, density: HAT_DENSITY_HOLES16 }]), cue("bass", { window: [0, 0] })],
      filter: { from: OPEN, to: OPEN },
    }),

    // 7. stop (56): 첫 박만.
    section({
      id: "stop",
      bars: 1,
      intensity: 0.2,
      drumFamily: "none",
      cues: [],
      endFill: "stop",
      filter: { from: 2000, to: 2000 },
    }),

    // 8. roll (57): 16분 연타 → 스텝13에서 끊김. 하강 콜.
    section({
      id: "roll",
      bars: 1,
      intensity: 0.9,
      drumFamily: "none",
      cues: [cue("calls")],
      endFill: "roll13",
      filter: { from: OPEN, to: OPEN },
    }),

    // 9. bGroove2 (58–69): bGroove와 같다.
    section({
      id: "bGroove2",
      bars: 8,
      intensity: 0.7,
      drumFamily: "fourFloor",
      cues: [cue("kick"), cue("backbeat"), hatCue([{ atBar: 0, density: HAT_DENSITY_HOLES16 }]), cue("bass"), cue("seqRiff")],
      fill: [{ everyBars: 2, kind: "pickup15", atBarInCycle: 1 }],
      filter: { from: 6000, to: 11000 },
    }),

    // 10. burst2 (70–73): burst와 같다.
    section({
      id: "burst2",
      bars: 4,
      intensity: 1,
      transpose: 1,
      gainDb: 4,
      drumFamily: "burst16",
      cues: [cue("kick"), cue("backbeat"), hatCue([{ atBar: 0, density: HAT_DENSITY_HOLES16 }]), cue("bass", { window: [0, 0] })],
      filter: { from: OPEN, to: OPEN },
    }),
    section({ id: "stop2", bars: 1, intensity: 0.2, drumFamily: "none", cues: [], endFill: "stop", filter: { from: 2000, to: 2000 } }),
    section({
      id: "roll2",
      bars: 1,
      intensity: 0.9,
      drumFamily: "none",
      cues: [cue("calls")],
      endFill: "roll13",
      filter: { from: OPEN, to: OPEN },
    }),

    // 11. arpRun (76–95): 드럼이 스텝 0~10만(window), 베이스 빠짐, seqRun 매 마디.
    section({
      id: "arpRun",
      bars: 8,
      intensity: 0.6,
      drumFamily: "fourFloorCut",
      cues: [cue("kick", { window: [0, 10] }), hatCue([{ atBar: 0, density: HAT_DENSITY_HOLES16 }]), cue("seqRun")],
      filter: { from: 5000, to: 8000 },
    }),

    // 12. gap (96–99): 드럼 없음, lead 솔로.
    section({
      id: "gap",
      bars: 2,
      intensity: 0.3,
      drumFamily: "none",
      cues: [cue("lead")],
      filter: { from: 2000, to: 3000 },
    }),

    // 13. aReprise (100–138): −2반음. 처음부터 holes16. stab, 마지막 4마디 seqRun.
    section({
      id: "aReprise",
      bars: 8,
      intensity: 0.65,
      transpose: -2,
      drumFamily: "lowSeq16",
      cues: [
        cue("lowDrum"),
        hatCue([{ atBar: 0, density: HAT_DENSITY_HOLES16 }]),
        cue("stab"),
        cue("seqRun", { enterBar: 4 }),
      ],
      filter: { from: 4000, to: 7000 },
    }),

    // 14. ambient (140–162): 드럼 없음. seqRiff, drone.
    section({
      id: "ambient",
      bars: 8,
      intensity: 0.35,
      drumFamily: "none",
      cues: [cue("seqRiff"), cue("drone")],
      filter: { from: 1500, to: 2500 },
    }),

    // 15. reEntry (163–179): fourFloor, offbeat8(덜 쪼갬). 베이스는 둘째 마디부터.
    section({
      id: "reEntry",
      bars: 8,
      intensity: 0.6,
      drumFamily: "fourFloor",
      cues: [
        cue("kick"),
        cue("backbeat"),
        hatCue([{ atBar: 0, density: HAT_DENSITY_OFFBEAT8 }]),
        cue("bass", { enterBar: 1 }),
      ],
      filter: { from: 4000, to: 8000 },
    }),

    // 16. finalBurst (180–183): +1반음, burst16.
    section({
      id: "finalBurst",
      bars: 4,
      intensity: 1,
      transpose: 1,
      gainDb: 4,
      drumFamily: "burst16",
      cues: [cue("kick"), cue("backbeat"), hatCue([{ atBar: 0, density: HAT_DENSITY_HOLES16 }]), cue("bass", { window: [0, 0] })],
      filter: { from: OPEN, to: OPEN },
    }),

    // 17. end (184–188): 정지 + 꼬리.
    section({ id: "end", bars: 2, intensity: 0.15, drumFamily: "none", cues: [], endFill: "stop", filter: { from: 2000, to: 800 } }),
  ],
};
