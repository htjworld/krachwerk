// 기존(v1) 편곡 템플릿 3종을 블루프린트 스키마(§6.2)로 옮긴 것. arrangement.ts의
// SectionSpec/TEMPLATES를 그대로 대체한다. 소리는 바뀌지 않아야 한다(§11 단계 2) —
// 옛 SectionSpec의 weight/intensity/filterFrom·To/layers 값을 숫자 하나 안 바꾸고 옮겼다.
//
// weight → bars: 옛 buildArrangement가 weight를 "185초를 채우는 비례 배분"으로 썼는데,
// 세 템플릿 모두 weight 합이 이미 92였다(§6.2가 요구하는 "92마디 기준"과 우연히 일치).
// 그래서 숫자를 다시 계산하지 않고 그대로 bars로 옮겼다 — buildArrangement의 배분 공식 자체도
// 안 바꿨으니(§16 arrangement.ts 참고) 결과 마디 수는 기존과 완전히 같다.
//
// layers → cues: "이 레이어가 섹션 내내 켜져 있다"는 옛 뜻 그대로 enterBar:0,
// exitBarsBeforeEnd:0으로 옮겼다. hat/bass/arp만 옛 hatOn()/베이스/아르페지오의 intensity
// 문턱값을 rateSteps로 옮겼고(hat은 밴드 두 개가 rate 격자로 안 떨어져서 mask를 썼다,
// blueprint.ts 주석 참고), 나머지 레이어(kick/backbeat/perc/metal/openHat/lead/stab)는 그
// 자리 선택 로직이 원래 세트/트랙 데이터·고정 스텝 조건이라 rateSteps가 필요 없다(더미로
// {atBar:0, rate:16} 하나만 둔다). 필(fill)도 옛 코드가 섹션과 무관하게 "isLastBar ||
// sectionBar%8===7"에서 rng()로 4종 중 하나를 고르는 방식이라 새 fill[]/endFill 배열로
// 옮기지 않았다 — audioEngine.ts가 blueprint.id로 legacy를 알아보고 그 로직을 그대로 쓴다.

import type { Blueprint, BlueprintSection, LayerCue, LayerId, Rate } from "../blueprint";
import { compute } from "./compute";
import { metropolis } from "./metropolis";

// 옛 hatOn(intensity, step)을 그대로 16스텝 마스크로 편다. 섹션의 intensity가 고정값이라
// 블루프린트 정의 시점에 한 번만 계산하면 된다.
function legacyHatMask(intensity: number): boolean[] {
  return Array.from({ length: 16 }, (_, step) => {
    if (intensity < 0.3) return step % 4 === 2;
    if (intensity < 0.55) return step % 2 === 0;
    if (intensity < 0.8) return step % 2 === 0 || step % 4 === 3;
    return true;
  });
}

// 옛 `active("bass") && layers.bass[step].on && (intensity >= 0.5 || step % 2 === 0)`의
// 뒤쪽 게이트. rate 격자(8=짝수 스텝, 16=전부)로 정확히 떨어진다.
function legacyBassRate(intensity: number): Rate {
  return intensity >= 0.5 ? 16 : 8;
}

// 옛 `active("arp") && (intensity > 0.65 || step % 2 === 0)`의 게이트. 경계가 `>`라서
// intensity===0.65면 false(8분)다.
function legacyArpRate(intensity: number): Rate {
  return intensity > 0.65 ? 16 : 8;
}

export function legacyCue(layer: LayerId, intensity: number): LayerCue {
  const base = { enterBar: 0, exitBarsBeforeEnd: 0 };
  if (layer === "hat") return { ...base, layer, rateSteps: [{ atBar: 0, rate: 16, mask: legacyHatMask(intensity) }] };
  if (layer === "bass") return { ...base, layer, rateSteps: [{ atBar: 0, rate: legacyBassRate(intensity) }] };
  if (layer === "arp") return { ...base, layer, rateSteps: [{ atBar: 0, rate: legacyArpRate(intensity) }] };
  // 나머지 레이어는 rate를 안 본다. 있어야 하니 더미를 채운다.
  return { ...base, layer, rateSteps: [{ atBar: 0, rate: 16 }] };
}

interface LegacySpec {
  id: string;
  bars: number;
  intensity: number;
  filterFrom: number;
  filterTo: number;
  layers: LayerId[];
}

function section(spec: LegacySpec): BlueprintSection {
  return {
    id: spec.id,
    bars: spec.bars,
    intensity: spec.intensity,
    cues: spec.layers.map((layer) => legacyCue(layer, spec.intensity)),
    // legacy의 킥은 §11 단계 5부터 fourFloor(0·4·8·12 필수 + 게놈 스텝14 비트)로 만든다
    // (pattern.ts의 legacyKickPattern). 이 필드 자체는 legacy 전체에서 한 계열뿐이라
    // scheduleBar가 아직 안 읽지만(§16.4 "매트릭스 에디터 킥 편집 적용 범위"는 여러
    // drumFamily가 한 블루프린트에 섞이는 §11 단계 6부터 의미가 생긴다), 메타데이터를
    // 정확히 적어 둔다.
    drumFamily: "fourFloor",
    fill: [], // legacy 필은 audioEngine.ts가 blueprint.id로 갈라서 옛 방식 그대로 처리한다.
    filter: { from: spec.filterFrom, to: spec.filterTo },
  };
}

const OPEN = 18000;

// 0. 전형적인 빌드업: 드럼 인트로 → 한 겹씩 추가 → 중간에 킥 빼기 → 빌드 → 피크 → 아웃트로
export const classicBuild: Blueprint = {
  id: "classicBuild",
  tempoRange: [112, 127], // §16.4 표. 아직 §11 단계 6 전까진 안 쓰인다(tempo는 여전히 시드 rng).
  swing: 0,
  sections: ([
    { id: "intro", bars: 8, intensity: 0.2, filterFrom: 700, filterTo: 2600, layers: ["kick", "hat"] },
    {
      id: "groove",
      bars: 16,
      intensity: 0.45,
      filterFrom: 2600,
      filterTo: 6500,
      layers: ["kick", "hat", "backbeat", "perc", "bass"],
    },
    {
      id: "lift",
      bars: 8,
      intensity: 0.62,
      filterFrom: 6500,
      filterTo: 11000,
      layers: ["kick", "hat", "openHat", "backbeat", "perc", "bass", "arp"],
    },
    {
      id: "main",
      bars: 16,
      intensity: 0.85,
      filterFrom: 14000,
      filterTo: OPEN,
      layers: ["kick", "hat", "openHat", "backbeat", "perc", "metal", "bass", "lead", "arp"],
    },
    {
      id: "reduction",
      bars: 8,
      intensity: 0.35,
      filterFrom: 9000,
      filterTo: 1100,
      layers: ["backbeat", "perc", "metal", "bass", "pad"],
    },
    {
      id: "build",
      bars: 8,
      intensity: 0.72,
      filterFrom: 1100,
      filterTo: OPEN,
      layers: ["kick", "hat", "perc", "bass", "arp", "riser"],
    },
    {
      id: "peak",
      bars: 16,
      intensity: 1,
      filterFrom: OPEN,
      filterTo: OPEN,
      layers: ["kick", "hat", "openHat", "backbeat", "perc", "metal", "bass", "lead", "arp", "stab"],
    },
    {
      id: "outro",
      bars: 12,
      intensity: 0.3,
      filterFrom: OPEN,
      filterTo: 800,
      layers: ["kick", "hat", "perc", "bass", "pad"],
    },
  ] satisfies LegacySpec[]).map(section),
};

// 1. 느리게 태우는 쪽: 인트로가 길고 브레이크다운이 멜로디 중심, 피크가 한 번 길게
export const slowBurn: Blueprint = {
  id: "slowBurn",
  tempoRange: [104, 119],
  swing: 0,
  sections: ([
    { id: "intro", bars: 12, intensity: 0.18, filterFrom: 600, filterTo: 2200, layers: ["kick", "perc"] },
    {
      id: "pulse",
      bars: 12,
      intensity: 0.35,
      filterFrom: 2200,
      filterTo: 5000,
      layers: ["kick", "hat", "perc", "bass"],
    },
    {
      id: "motif",
      bars: 16,
      intensity: 0.55,
      filterFrom: 5000,
      filterTo: 9000,
      layers: ["kick", "hat", "backbeat", "perc", "bass", "lead"],
    },
    {
      id: "breakdown",
      bars: 8,
      intensity: 0.25,
      filterFrom: 9000,
      filterTo: 1400,
      layers: ["pad", "lead", "metal", "perc"],
    },
    {
      id: "build",
      bars: 8,
      intensity: 0.65,
      filterFrom: 1400,
      filterTo: 16000,
      layers: ["kick", "hat", "perc", "bass", "arp", "riser"],
    },
    {
      id: "peak",
      bars: 20,
      intensity: 0.95,
      filterFrom: OPEN,
      filterTo: OPEN,
      layers: ["kick", "hat", "openHat", "backbeat", "perc", "metal", "bass", "lead", "arp", "stab"],
    },
    {
      id: "outro",
      bars: 16,
      intensity: 0.3,
      filterFrom: OPEN,
      filterTo: 700,
      layers: ["kick", "hat", "perc", "pad", "metal"],
    },
  ] satisfies LegacySpec[]).map(section),
};

// 2. 초반부터 때리고 두 번 떨어뜨리는 쪽
export const doubleDrop: Blueprint = {
  id: "doubleDrop",
  tempoRange: [117, 132],
  swing: 0,
  sections: ([
    { id: "intro", bars: 8, intensity: 0.22, filterFrom: 800, filterTo: 3000, layers: ["kick", "hat", "metal"] },
    {
      id: "drop",
      bars: 16,
      intensity: 0.8,
      filterFrom: 12000,
      filterTo: OPEN,
      layers: ["kick", "hat", "openHat", "backbeat", "perc", "bass", "lead"],
    },
    {
      id: "break",
      bars: 8,
      intensity: 0.3,
      filterFrom: 9000,
      filterTo: 1200,
      layers: ["perc", "pad", "metal", "bass"],
    },
    {
      id: "build",
      bars: 8,
      intensity: 0.7,
      filterFrom: 1200,
      filterTo: OPEN,
      layers: ["kick", "hat", "perc", "bass", "arp", "riser"],
    },
    {
      id: "drop2",
      bars: 16,
      intensity: 0.92,
      filterFrom: OPEN,
      filterTo: OPEN,
      layers: ["kick", "hat", "openHat", "backbeat", "perc", "metal", "bass", "lead", "arp"],
    },
    {
      id: "hold",
      bars: 8,
      intensity: 0.38,
      filterFrom: 6000,
      filterTo: 1500,
      layers: ["backbeat", "perc", "pad", "stab"],
    },
    {
      id: "peak",
      bars: 16,
      intensity: 1,
      filterFrom: OPEN,
      filterTo: OPEN,
      layers: ["kick", "hat", "openHat", "backbeat", "perc", "metal", "bass", "lead", "arp", "stab"],
    },
    {
      id: "outro",
      bars: 12,
      intensity: 0.28,
      filterFrom: OPEN,
      filterTo: 700,
      layers: ["kick", "perc", "pad"],
    },
  ] satisfies LegacySpec[]).map(section),
};

// 순서(0,1,2)가 옛 template 인덱스와 같다. Track.template이 이 배열의 인덱스를 그대로
// 가리키므로 순서를 바꾸면 안 된다.
export const LEGACY_BLUEPRINTS: Blueprint[] = [classicBuild, slowBurn, doubleDrop];

/** blueprintId(motifs.ts의 blueprintIdFor가 돌려주는 값)로 실제 Blueprint를 찾는다. */
export function blueprintById(id: Blueprint["id"]): Blueprint {
  switch (id) {
    case "classicBuild":
      return classicBuild;
    case "slowBurn":
      return slowBurn;
    case "doubleDrop":
      return doubleDrop;
    case "compute":
      return compute;
    case "metropolis":
      return metropolis;
  }
}
