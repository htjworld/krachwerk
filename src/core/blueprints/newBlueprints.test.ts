// compute/metropolis 블루프린트 데이터 구조 검증(§11 단계 6). legacy 3종은
// arrangement.test.ts가 이미 덮는다 — 여기는 새 블루프린트 둘만 본다.
import { describe, expect, it } from "vitest";
import { buildArrangement } from "../arrangement";
import { compute } from "./compute";
import { metropolis } from "./metropolis";

describe.each([
  ["compute", compute],
  ["metropolis", metropolis],
] as const)("%s 블루프린트", (_name, blueprint) => {
  it("나중값 bars 합이 92다 (§6.3/§6.4 표)", () => {
    expect(blueprint.sections.reduce((sum, s) => sum + s.bars, 0)).toBe(92);
  });

  it("buildArrangement로 풀었을 때 섹션이 빈틈·겹침 없이 이어진다", () => {
    const arrangement = buildArrangement(blueprint, 120, 180);
    let expectedStart = 0;
    for (const section of arrangement.sections) {
      expect(section.startBar).toBe(expectedStart);
      expect(section.bars).toBeGreaterThanOrEqual(1);
      expectedStart += section.bars;
    }
    expect(arrangement.totalBars).toBe(expectedStart);
  });

  it("150~210초 목표 전 구간에서 실제 길이가 크게 벗어나지 않는다", () => {
    for (const targetSeconds of [150, 180, 210]) {
      const arrangement = buildArrangement(blueprint, 120, targetSeconds);
      expect(arrangement.totalSeconds).toBeGreaterThan(targetSeconds - 15);
      expect(arrangement.totalSeconds).toBeLessThan(targetSeconds + 15);
    }
  });

  it("sigSlots(시그니처 사운드, §15.2)가 최소 하나 있고 전부 그 섹션 마디 수 안에 있다", () => {
    const sections = blueprint.sections.filter((s) => s.sigSlots && s.sigSlots.length > 0);
    expect(sections.length).toBeGreaterThan(0);
    for (const section of sections) {
      for (const bar of section.sigSlots!) {
        expect(bar).toBeGreaterThanOrEqual(0);
        expect(bar).toBeLessThan(section.bars);
      }
    }
  });
});
