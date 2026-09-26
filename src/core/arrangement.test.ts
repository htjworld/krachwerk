import { describe, expect, it } from "vitest";
import { buildArrangement, sectionAtSecond } from "./arrangement";
import { LEGACY_BLUEPRINTS } from "./blueprints/legacy";
import { TARGET_LENGTHS_SECONDS } from "./genome";

const TEMPOS = [104, 118, 132];

describe("buildArrangement", () => {
  it("모든 블루프린트·템포·목표 길이(g9)에서 실제 길이가 150~210초 안팎이다 (§8.2)", () => {
    // 마디 반올림(4의 배수, compute는 2)이 §8.2가 지시하는 "가장 긴 섹션에서 4마디씩" 보정
    // 뒤에도 최대 roundTo/2마디(느린 템포에서 최대 몇 초)만큼 남을 수 있다. §8.2도 옛
    // TARGET_SECONDS 방식처럼 "정확히 그 초"가 아니라 근사치를 약속한다.
    for (const blueprint of LEGACY_BLUEPRINTS) {
      for (const tempo of TEMPOS) {
        for (const targetSeconds of TARGET_LENGTHS_SECONDS) {
          const arrangement = buildArrangement(blueprint, tempo, targetSeconds);
          expect(arrangement.totalSeconds).toBeGreaterThan(140);
          expect(arrangement.totalSeconds).toBeLessThan(215);
        }
      }
    }
  });

  it("섹션이 빈틈이나 겹침 없이 이어진다", () => {
    for (const blueprint of LEGACY_BLUEPRINTS) {
      const arrangement = buildArrangement(blueprint, 120, 185);
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
    for (const blueprint of LEGACY_BLUEPRINTS) {
      const intensities = buildArrangement(blueprint, 120, 185).sections.map((s) => s.intensity);
      const peak = Math.max(...intensities);
      const peakIndex = intensities.indexOf(peak);
      const dipBeforePeak = Math.min(...intensities.slice(1, peakIndex));
      expect(dipBeforePeak).toBeLessThan(peak * 0.6);
    }
  });

  it("sectionAtSecond가 경계에서 다음 섹션을 가리킨다", () => {
    const arrangement = buildArrangement(LEGACY_BLUEPRINTS[0], 120, 185);
    const second = arrangement.sections[1];
    const boundary = second.startBar * arrangement.barSeconds;
    expect(sectionAtSecond(arrangement, boundary - 0.01).id).toBe(arrangement.sections[0].id);
    expect(sectionAtSecond(arrangement, boundary).id).toBe(second.id);
    expect(sectionAtSecond(arrangement, arrangement.totalSeconds + 10).id).toBe(
      arrangement.sections[arrangement.sections.length - 1].id
    );
  });

  it("길이가 길수록(g9가 클수록) 실제 마디 수도 늘어난다", () => {
    for (const blueprint of LEGACY_BLUEPRINTS) {
      const short = buildArrangement(blueprint, 120, 150);
      const long = buildArrangement(blueprint, 120, 210);
      expect(long.totalBars).toBeGreaterThan(short.totalBars);
    }
  });

  it("swing을 블루프린트에서 그대로 옮긴다", () => {
    for (const blueprint of LEGACY_BLUEPRINTS) {
      expect(buildArrangement(blueprint, 120, 185).swing).toBe(blueprint.swing);
    }
  });
});
