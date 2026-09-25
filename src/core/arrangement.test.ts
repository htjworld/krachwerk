import { describe, expect, it } from "vitest";
import { TEMPLATE_COUNT, buildArrangement, sectionAtSecond } from "./arrangement";

const TEMPOS = [104, 118, 132];

describe("buildArrangement", () => {
  it("모든 템플릿과 템포에서 3분 안팎으로 나온다", () => {
    for (let template = 0; template < TEMPLATE_COUNT; template++) {
      for (const tempo of TEMPOS) {
        const arrangement = buildArrangement(template, tempo);
        expect(arrangement.totalSeconds).toBeGreaterThan(150);
        expect(arrangement.totalSeconds).toBeLessThan(220);
      }
    }
  });

  it("섹션이 빈틈이나 겹침 없이 이어진다", () => {
    for (let template = 0; template < TEMPLATE_COUNT; template++) {
      const arrangement = buildArrangement(template, 120);
      let expectedStart = 0;
      for (const section of arrangement.sections) {
        expect(section.startBar).toBe(expectedStart);
        expect(section.bars).toBeGreaterThanOrEqual(4);
        expect(section.bars % 4).toBe(0);
        expectedStart += section.bars;
      }
      expect(arrangement.totalBars).toBe(expectedStart);
    }
  });

  it("모든 트랙이 한 번은 조용해졌다가 다시 올라간다", () => {
    for (let template = 0; template < TEMPLATE_COUNT; template++) {
      const intensities = buildArrangement(template, 120).sections.map((s) => s.intensity);
      const peak = Math.max(...intensities);
      const peakIndex = intensities.indexOf(peak);
      const dipBeforePeak = Math.min(...intensities.slice(1, peakIndex));
      expect(dipBeforePeak).toBeLessThan(peak * 0.6);
    }
  });

  it("sectionAtSecond가 경계에서 다음 섹션을 가리킨다", () => {
    const arrangement = buildArrangement(0, 120);
    const second = arrangement.sections[1];
    const boundary = second.startBar * arrangement.barSeconds;
    expect(sectionAtSecond(arrangement, boundary - 0.01).id).toBe(arrangement.sections[0].id);
    expect(sectionAtSecond(arrangement, boundary).id).toBe(second.id);
    expect(sectionAtSecond(arrangement, arrangement.totalSeconds + 10).id).toBe(
      arrangement.sections[arrangement.sections.length - 1].id
    );
  });
});
