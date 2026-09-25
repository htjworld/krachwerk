// 3분짜리 곡의 구조(어레인지먼트).
//
// 실제 일렉트로닉 트랙은 16/32마디 단위 블록으로 짜이고, 블록 경계마다 레이어를 하나씩
// 더하거나 뺀다. 계단처럼 올라갔다가 중간에 한 번 확 비우고(reduction/breakdown),
// 다시 쌓아 올려 피크를 찍고, 마지막에 인트로의 골격만 남기고 빠진다.
// 블록 안에서는 요소를 바꾸지 않고 처리(필터, 하이햇 밀도, 리버브)만 움직인다.
//
// 여기서는 3분 기준이라 블록 단위를 8/16마디로 줄였다.

export type LayerId =
  | "kick"
  | "hat"
  | "openHat"
  | "backbeat"
  | "perc"
  | "metal"
  | "bass"
  | "lead"
  | "arp"
  | "stab"
  | "pad"
  | "riser";

export interface SectionSpec {
  id: string;
  /** 섹션 길이의 상대 비중. 실제 마디 수는 템포에 맞춰 buildArrangement가 계산한다. */
  weight: number;
  /** 0~1. 하이햇 밀도, 벨로시티, 변주 확률을 한꺼번에 움직이는 값. */
  intensity: number;
  /** 섹션 시작/끝의 마스터 로우패스 컷오프(Hz). 그 사이는 선형으로 훑는다. */
  filterFrom: number;
  filterTo: number;
  layers: LayerId[];
}

export interface Section extends SectionSpec {
  startBar: number;
  bars: number;
}

export interface Arrangement {
  tempo: number;
  barSeconds: number;
  totalBars: number;
  totalSeconds: number;
  sections: Section[];
}

const OPEN = 18000;

// 템플릿 3종. 시드가 이 중 하나를 고른다.
const TEMPLATES: SectionSpec[][] = [
  // 0. 전형적인 빌드업: 드럼 인트로 → 한 겹씩 추가 → 중간에 킥 빼기 → 빌드 → 피크 → 아웃트로
  [
    { id: "intro", weight: 8, intensity: 0.2, filterFrom: 700, filterTo: 2600, layers: ["kick", "hat"] },
    {
      id: "groove",
      weight: 16,
      intensity: 0.45,
      filterFrom: 2600,
      filterTo: 6500,
      layers: ["kick", "hat", "backbeat", "perc", "bass"],
    },
    {
      id: "lift",
      weight: 8,
      intensity: 0.62,
      filterFrom: 6500,
      filterTo: 11000,
      layers: ["kick", "hat", "openHat", "backbeat", "perc", "bass", "arp"],
    },
    {
      id: "main",
      weight: 16,
      intensity: 0.85,
      filterFrom: 14000,
      filterTo: OPEN,
      layers: ["kick", "hat", "openHat", "backbeat", "perc", "metal", "bass", "lead", "arp"],
    },
    {
      id: "reduction",
      weight: 8,
      intensity: 0.35,
      filterFrom: 9000,
      filterTo: 1100,
      layers: ["backbeat", "perc", "metal", "bass", "pad"],
    },
    {
      id: "build",
      weight: 8,
      intensity: 0.72,
      filterFrom: 1100,
      filterTo: OPEN,
      layers: ["kick", "hat", "perc", "bass", "arp", "riser"],
    },
    {
      id: "peak",
      weight: 16,
      intensity: 1,
      filterFrom: OPEN,
      filterTo: OPEN,
      layers: ["kick", "hat", "openHat", "backbeat", "perc", "metal", "bass", "lead", "arp", "stab"],
    },
    {
      id: "outro",
      weight: 12,
      intensity: 0.3,
      filterFrom: OPEN,
      filterTo: 800,
      layers: ["kick", "hat", "perc", "bass", "pad"],
    },
  ],

  // 1. 느리게 태우는 쪽: 인트로가 길고 브레이크다운이 멜로디 중심, 피크가 한 번 길게
  [
    { id: "intro", weight: 12, intensity: 0.18, filterFrom: 600, filterTo: 2200, layers: ["kick", "perc"] },
    {
      id: "pulse",
      weight: 12,
      intensity: 0.35,
      filterFrom: 2200,
      filterTo: 5000,
      layers: ["kick", "hat", "perc", "bass"],
    },
    {
      id: "motif",
      weight: 16,
      intensity: 0.55,
      filterFrom: 5000,
      filterTo: 9000,
      layers: ["kick", "hat", "backbeat", "perc", "bass", "lead"],
    },
    {
      id: "breakdown",
      weight: 8,
      intensity: 0.25,
      filterFrom: 9000,
      filterTo: 1400,
      layers: ["pad", "lead", "metal", "perc"],
    },
    {
      id: "build",
      weight: 8,
      intensity: 0.65,
      filterFrom: 1400,
      filterTo: 16000,
      layers: ["kick", "hat", "perc", "bass", "arp", "riser"],
    },
    {
      id: "peak",
      weight: 20,
      intensity: 0.95,
      filterFrom: OPEN,
      filterTo: OPEN,
      layers: ["kick", "hat", "openHat", "backbeat", "perc", "metal", "bass", "lead", "arp", "stab"],
    },
    {
      id: "outro",
      weight: 16,
      intensity: 0.3,
      filterFrom: OPEN,
      filterTo: 700,
      layers: ["kick", "hat", "perc", "pad", "metal"],
    },
  ],

  // 2. 초반부터 때리고 두 번 떨어뜨리는 쪽
  [
    { id: "intro", weight: 8, intensity: 0.22, filterFrom: 800, filterTo: 3000, layers: ["kick", "hat", "metal"] },
    {
      id: "drop",
      weight: 16,
      intensity: 0.8,
      filterFrom: 12000,
      filterTo: OPEN,
      layers: ["kick", "hat", "openHat", "backbeat", "perc", "bass", "lead"],
    },
    {
      id: "break",
      weight: 8,
      intensity: 0.3,
      filterFrom: 9000,
      filterTo: 1200,
      layers: ["perc", "pad", "metal", "bass"],
    },
    {
      id: "build",
      weight: 8,
      intensity: 0.7,
      filterFrom: 1200,
      filterTo: OPEN,
      layers: ["kick", "hat", "perc", "bass", "arp", "riser"],
    },
    {
      id: "drop2",
      weight: 16,
      intensity: 0.92,
      filterFrom: OPEN,
      filterTo: OPEN,
      layers: ["kick", "hat", "openHat", "backbeat", "perc", "metal", "bass", "lead", "arp"],
    },
    {
      id: "hold",
      weight: 8,
      intensity: 0.38,
      filterFrom: 6000,
      filterTo: 1500,
      layers: ["backbeat", "perc", "pad", "stab"],
    },
    {
      id: "peak",
      weight: 16,
      intensity: 1,
      filterFrom: OPEN,
      filterTo: OPEN,
      layers: ["kick", "hat", "openHat", "backbeat", "perc", "metal", "bass", "lead", "arp", "stab"],
    },
    {
      id: "outro",
      weight: 12,
      intensity: 0.28,
      filterFrom: OPEN,
      filterTo: 700,
      layers: ["kick", "perc", "pad"],
    },
  ],
];

export const TEMPLATE_COUNT = TEMPLATES.length;

/** 목표 길이. 템포에 따라 마디 수가 4의 배수로 반올림되므로 실제 길이는 ±15초 정도 움직인다. */
export const TARGET_SECONDS = 185;

export function buildArrangement(templateIndex: number, tempo: number): Arrangement {
  const specs = TEMPLATES[((templateIndex % TEMPLATE_COUNT) + TEMPLATE_COUNT) % TEMPLATE_COUNT];
  const barSeconds = (60 / tempo) * 4;
  const totalWeight = specs.reduce((sum, spec) => sum + spec.weight, 0);
  const barsPerWeight = TARGET_SECONDS / barSeconds / totalWeight;

  let startBar = 0;
  const sections = specs.map((spec) => {
    const bars = Math.max(4, Math.round((spec.weight * barsPerWeight) / 4) * 4);
    const section: Section = { ...spec, startBar, bars };
    startBar += bars;
    return section;
  });

  return { tempo, barSeconds, totalBars: startBar, totalSeconds: startBar * barSeconds, sections };
}

export function sectionAtSecond(arrangement: Arrangement, seconds: number): Section {
  const bar = Math.floor(seconds / arrangement.barSeconds);
  const sections = arrangement.sections;
  for (let i = sections.length - 1; i >= 0; i--) {
    if (bar >= sections[i].startBar) return sections[i];
  }
  return sections[0];
}
