// 3분짜리 곡의 구조(어레인지먼트)를 블루프린트(§6.2, blueprint.ts)에서 실제 마디 수·시각으로
// 풀어내는 자리. 블루프린트 자체(섹션 순서, 레이어, 드럼 계열)는 더 이상 여기 있지 않다
// (src/core/blueprints/*.ts).
//
// 실제 일렉트로닉 트랙은 16/32마디 단위 블록으로 짜이고, 블록 경계마다 레이어를 하나씩
// 더하거나 뺀다. 계단처럼 올라갔다가 중간에 한 번 확 비우고(reduction/breakdown),
// 다시 쌓아 올려 피크를 찍고, 마지막에 인트로의 골격만 남기고 빠진다.
//
// 여기서는 3분 기준이라 블록 단위를 8/16마디로 줄였다.

import type { Blueprint, BlueprintSection } from "./blueprint";

export type { LayerId } from "./blueprint";

/** 블루프린트 섹션이 실제 마디 수·위치를 얻은 것. BlueprintSection.bars는 "92마디 기준"의
 *  나중값(nominal)이고, 여기 bars는 실제 렌더링에 쓰는 값이다(같은 필드 이름이 겹치는 건
 *  §16.5가 원래 그렇게 정의해서다 — extends로 덮어쓴다). */
export interface Section extends BlueprintSection {
  startBar: number;
  bars: number;
}

export interface Arrangement {
  tempo: number;
  barSeconds: number;
  totalBars: number;
  totalSeconds: number;
  sections: Section[];
  /** 블루프린트의 swing을 그대로 옮긴 것. scheduleBar가 홀수 16분 스텝을 늦추는 데 쓴다. */
  swing: number;
}

/**
 * §8.2: targetSeconds(게놈 길이 필드 g9가 고른 150~210초)에 맞춰 블루프린트의 나중값
 * bars(92마디 기준)를 비례 배분한다. 1마디 섹션(stop/roll/entry 등, 기능이 1마디라
 * 늘이거나 줄이면 안 되는 것)은 그대로 두고, 나머지는 roundTo(compute는 2, 그 외엔 4)의
 * 배수로 반올림한다. 반올림 오차는 가장 긴 섹션에서 흡수한다.
 */
export function buildArrangement(blueprint: Blueprint, tempo: number, targetSeconds: number): Arrangement {
  const specs = blueprint.sections;
  const barSeconds = (60 / tempo) * 4;
  const totalNominalBars = specs.reduce((sum, spec) => sum + spec.bars, 0);
  const scale = targetSeconds / barSeconds / totalNominalBars;
  const roundTo = blueprint.id === "compute" ? 2 : 4;

  let startBar = 0;
  const sections = specs.map((spec) => {
    const bars = spec.bars === 1 ? 1 : Math.max(roundTo, Math.round((spec.bars * scale) / roundTo) * roundTo);
    const section: Section = { ...spec, startBar, bars };
    startBar += bars;
    return section;
  });

  // 반올림 뒤 합이 목표 마디 수와 다르면, 가장 긴(1마디가 아닌) 섹션에서 그 차이를 흡수한다.
  const targetBars = Math.round(targetSeconds / barSeconds);
  const diff = targetBars - startBar;
  if (diff !== 0) {
    const adjustable = sections.filter((s) => s.bars > 1);
    if (adjustable.length > 0) {
      const longest = adjustable.reduce((a, b) => (b.bars > a.bars ? b : a));
      // "4마디씩" 조정한다(§8.2) — 그래야 보정 후에도 모든 섹션이 여전히 roundTo의 배수다.
      // diff가 roundTo의 절반보다 작으면(예: 65마디 목표인데 64마디가 나온 것처럼 1~2마디
      // 차이) Math.round(diff/roundTo)가 0이 되어 버려서 부족분을 계속 못 메운다.
      // diff !== 0인데 단위가 0으로 나오면 최소 한 단위(roundTo)는 그 부호대로 보정한다.
      const units = Math.round(diff / roundTo) || Math.sign(diff);
      longest.bars = Math.max(roundTo, longest.bars + units * roundTo);
      // 조정한 섹션 뒤의 startBar를 다시 이어 붙인다.
      let bar = 0;
      for (const s of sections) {
        s.startBar = bar;
        bar += s.bars;
      }
      startBar = bar;
    }
  }

  return { tempo, barSeconds, totalBars: startBar, totalSeconds: startBar * barSeconds, sections, swing: blueprint.swing };
}

export function sectionAtSecond(arrangement: Arrangement, seconds: number): Section {
  const bar = Math.floor(seconds / arrangement.barSeconds);
  const sections = arrangement.sections;
  for (let i = sections.length - 1; i >= 0; i--) {
    if (bar >= sections[i].startBar) return sections[i];
  }
  return sections[0];
}
