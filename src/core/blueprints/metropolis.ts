// metropolis 블루프린트: "Metropolis (2009 Remaster)" 분석을 3분(92마디 @122BPM) 기준으로
// 옮긴 것. §6.4 표, §5장 분석이 원본이다.
//
// compute.ts와 같은 규칙: kick/tick의 실제 on/off는 motifs.ts의 familyDrumHit이 정하고,
// cues는 "이 레이어가 이 마디에 켜져 있는가"만 결정한다.
//
// 화성(§5.10): 32마디 주기(G 16 → +3 8 → +5 8)를 16마디 주기(0 8 → +3 4 → +5 4)로 줄여서
// entry~mainA3, reEntry~outro 두 구간에 적용한다(harmony, atStep 8). 이동 폭은 게놈 mode가
// 고른다(motifs.ts의 metropolisHarmonyShifts) — 이 파일은 자리(atBar/atStep)만 정하고,
// audioEngine.ts가 실제 이동폭 숫자를 그 자리에 채워 넣는다(블루프린트 데이터 자체는
// 게놈을 모른다).
import type { Blueprint, BlueprintSection, LayerCue, LayerId, RateStep } from "../blueprint";

// §14.2 A. 4·12=250, 0·8=200, 2·6·10·14=170, 나머지 16분=140, 5·13=0.
const HAT_PRIORITY = [200, 140, 170, 140, 250, 0, 170, 140, 200, 140, 170, 140, 250, 0, 170, 140];
// §14.2 A 매핑: mainA1 60 / mainA2 첫4마디 130→이후 90 / mainA3 110 / mainB1 100 / mainB2 140 / outro 100→20.
const D = { mainA1: 60, spike: 130, mainA2: 90, mainA3: 110, mainB1: 100, mainB2: 140, outroStart: 100, outroEnd: 20 };

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
  return { intensity: 0.7, fill: [], filter: { from: 6000, to: 10000 }, ...spec };
}

// 16마디 주기 화성 이동 자리(§5.10 축소판). entry(마디번호 0 기준)부터 mainA3 끝까지,
// reEntry부터 outro 끝까지 두 번 돈다: 0~7 그대로, 8~11 +첫이동, 12~15 +둘째이동, 8마디씩
// 반복. atBar는 "그 섹션이 속한 16마디 사이클 안에서" 몇 번째 마디인지가 아니라, 이 표는
// 섹션별로 독립적으로 매기므로 각 섹션의 harmony는 자신의 로컬 atBar 기준이다.

export const metropolis: Blueprint = {
  id: "metropolis",
  tempoRange: [115, 130],
  swing: 0.04,
  sections: [
    // 1. freeIntro (0–11): 박 없음. pad(2마디마다), glide(2마디마다), bass 롱노트.
    section({
      id: "freeIntro",
      bars: 6,
      intensity: 0.2,
      freeTime: true,
      synthWidth: 1,
      drumFamily: "none",
      cues: [cue("pad"), cue("glide"), cue("bass", { window: [0, 0] })],
      filter: { from: 800, to: 1500 },
    }),

    // 2. pulseIntro (12–35): pulse2 틱, pad/glide/bass 이어짐.
    section({
      id: "pulseIntro",
      bars: 8,
      intensity: 0.25,
      synthWidth: 1,
      drumFamily: "pulse2",
      cues: [cue("tick"), cue("pad"), cue("glide"), cue("bass", { window: [0, 0] })],
      sigSlots: [4],
      filter: { from: 1200, to: 2000 },
    }),

    // 3. breath (36–39): 패드만, 펄스도 멈춘다.
    section({
      id: "breath",
      bars: 2,
      intensity: 0.15,
      synthWidth: 1,
      drumFamily: "none",
      cues: [cue("pad")],
      filter: { from: 1000, to: 1200 },
    }),

    // 4. preEntry (40–41): + 베이스 롱노트(스텝 5 진입).
    section({
      id: "preEntry",
      bars: 1,
      intensity: 0.2,
      drumFamily: "none",
      cues: [cue("pad"), cue("bass", { window: [5, 5] })],
      filter: { from: 1200, to: 1800 },
    }),

    // 5. entry (42): 반 마디 픽업 진입. seq는 스텝0부터.
    section({
      id: "entry",
      bars: 1,
      intensity: 0.5,
      drumFamily: "fourFloor",
      cues: [cue("kick", { enterStep: 8 }), cue("seqRiff"), cue("bass")],
      harmony: [{ atBar: 0, atStep: 8, semitones: 0 }],
      filter: { from: 2000, to: 3000 },
    }),

    // 6. mainA1 (43–47): 드럼 전부 진입, 햇은 아직 4분.
    section({
      id: "mainA1",
      bars: 4,
      intensity: 0.55,
      drumFamily: "fourFloor",
      cues: [cue("kick"), cue("backbeat"), hatCue([{ atBar: 0, density: D.mainA1 }]), cue("seqRiff"), cue("bass")],
      harmony: [{ atBar: 0, atStep: 0, semitones: 0 }],
      filter: { from: 3000, to: 4500 },
    }),

    // 7. mainA2 (48–91): 햇이 확 튀었다가(첫 4마디) 물러난다. halfBar8 필 4마디마다.
    section({
      id: "mainA2",
      bars: 16,
      intensity: 0.7,
      drumFamily: "fourFloor",
      cues: [
        cue("kick"),
        cue("backbeat"),
        hatCue([
          { atBar: 0, density: D.spike },
          { atBar: 4, density: D.mainA2 },
        ]),
        cue("seqRiff"),
        cue("bass"),
      ],
      fill: [{ everyBars: 4, kind: "halfBar8", atBarInCycle: 3 }],
      harmony: [
        { atBar: 4, atStep: 8, semitones: 1 }, // 실제 이동폭은 audioEngine.ts가 metropolisHarmonyShifts[0]으로 채운다(표시는 1로 "이동함" 마킹)
        { atBar: 6, atStep: 8, semitones: 2 }, // 마찬가지로 shifts[1]
        { atBar: 8, atStep: 8, semitones: 0 },
      ],
      sigSlots: [4, 12],
      filter: { from: 4500, to: 7000 },
    }),

    // 8. mainA3 (92–109): 햇이 조금 더 촘촘. 베이스 마지막 2마디 화성 이동.
    section({
      id: "mainA3",
      bars: 8,
      intensity: 0.75,
      drumFamily: "fourFloor",
      cues: [cue("kick"), cue("backbeat"), hatCue([{ atBar: 0, density: D.mainA3 }]), cue("seqRiff"), cue("bass")],
      harmony: [
        { atBar: 0, atStep: 0, semitones: 0 },
        { atBar: 6, atStep: 8, semitones: 1 },
      ],
      filter: { from: 5000, to: 7500 },
    }),

    // 9. transition (110): halfBar8 필 + 스텝14 킥.
    section({
      id: "transition",
      bars: 1,
      intensity: 0.5,
      drumFamily: "fourFloor",
      cues: [cue("kick")],
      endFill: "halfBar8",
      filter: { from: 4000, to: 5000 },
    }),

    // 10. breakdown (111–125): 하프타임. seqOctave +12, lead, pad. bass·스네어 없음.
    section({
      id: "breakdown",
      bars: 12,
      intensity: 0.45,
      gainDb: 2,
      synthWidth: 1,
      seqOctave: 12,
      drumFamily: "halfTime",
      cues: [cue("kick"), hatCue([{ atBar: 0, density: 20 }]), cue("seqRiff"), cue("lead"), cue("pad")],
      harmony: [{ atBar: 0, atStep: 0, semitones: 0 }],
      sigSlots: [6],
      filter: { from: 3000, to: 6000 },
    }),

    // 11. reEntry (126): 반쪽 그루브로 복귀 예고. 베이스 복귀.
    section({
      id: "reEntry",
      bars: 1,
      intensity: 0.5,
      drumFamily: "fourFloor",
      cues: [cue("kick"), cue("backbeat"), hatCue([{ atBar: 0, density: D.mainA2 }]), cue("seqRiff"), cue("bass")],
      harmony: [{ atBar: 0, atStep: 0, semitones: 0 }],
      filter: { from: 4000, to: 6000 },
    }),

    // 12. mainB1 (127–151): 메인 복귀.
    section({
      id: "mainB1",
      bars: 12,
      intensity: 0.7,
      drumFamily: "fourFloor",
      cues: [cue("kick"), cue("backbeat"), hatCue([{ atBar: 0, density: D.mainB1 }]), cue("seqRiff"), cue("bass")],
      fill: [{ everyBars: 4, kind: "halfBar8", atBarInCycle: 3 }],
      harmony: [
        { atBar: 0, atStep: 0, semitones: 0 },
        { atBar: 8, atStep: 8, semitones: 1 },
      ],
      filter: { from: 5000, to: 8000 },
    }),

    // 13. mainB2 (152–163): 최고점. 햇 dense16.
    section({
      id: "mainB2",
      bars: 8,
      intensity: 1,
      drumFamily: "fourFloor",
      cues: [cue("kick"), cue("backbeat"), hatCue([{ atBar: 0, density: D.mainB2 }]), cue("seqRiff"), cue("bass")],
      harmony: [{ atBar: 4, atStep: 8, semitones: 2 }],
      filter: { from: 8000, to: 14000 },
    }),

    // 14. outro (164–174): 킥 저역부터 뺀다(kickLowCut). 햇 줄어듦. 마지막 마디 halfBar8 뒤 정지.
    section({
      id: "outro",
      bars: 8,
      intensity: 0.4,
      kickLowCut: { from: 20, to: 400 },
      drumFamily: "fourFloor",
      cues: [
        cue("kick"),
        cue("backbeat"),
        hatCue([
          { atBar: 0, density: D.outroStart },
          { atBar: 4, density: D.outroEnd },
        ]),
        cue("seqRiff"),
        cue("bass"),
      ],
      endFill: "halfBar8",
      filter: { from: 6000, to: 1500 },
    }),

    // 15. tail (175–180): 패드만, 페이드.
    section({
      id: "tail",
      bars: 4,
      intensity: 0.15,
      synthWidth: 0.7,
      drumFamily: "none",
      cues: [cue("pad")],
      sigSlots: [0],
      filter: { from: 1200, to: 700 },
    }),
  ],
};
