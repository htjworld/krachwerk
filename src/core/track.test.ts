import { describe, expect, it } from "vitest";
import { deriveTrack } from "./track";
import { generatePattern, STEP_COUNT } from "./pattern";

describe("deriveTrack", () => {
  it("같은 시드는 항상 같은 편성이 나온다", () => {
    expect(deriveTrack(generatePattern("krachwerk"))).toEqual(deriveTrack(generatePattern("krachwerk")));
  });

  it("시드가 다르면 편성도 갈린다", () => {
    const seeds = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const kits = seeds.map((seed) => JSON.stringify(deriveTrack(generatePattern(seed))));
    expect(new Set(kits).size).toBeGreaterThan(1);
  });

  it("스텝 배열이 범위 안에 있다", () => {
    for (const seed of ["1", "2", "3", "4", "5", "zzz", "133r53252rwersa"]) {
      const track = deriveTrack(generatePattern(seed));
      expect(track.percSteps).toHaveLength(STEP_COUNT);
      expect(track.bassOctave).toHaveLength(STEP_COUNT);
      expect(track.accent).toHaveLength(STEP_COUNT);
      expect(track.leadB).toHaveLength(STEP_COUNT);
      expect(track.arp).toHaveLength(STEP_COUNT);
      expect(track.metalA).not.toBe(track.metalB);
      expect([4, 8]).toContain(track.fillPeriodBars);
      for (const step of track.metalSteps) {
        expect(step).toBeGreaterThanOrEqual(0);
        expect(step).toBeLessThan(STEP_COUNT);
      }
    }
  });

  // §11 단계 5: perc/metal/필주기가 이제 게놈(drumVariant)에서 나온다 — rng가 아니라.
  it("perc/metal/필 주기가 게놈 drumVariant에 따라 갈린다", () => {
    const percHitCounts = new Set<number>();
    const fillPeriods = new Set<number>();
    for (let i = 0; i < 40; i++) {
      const track = deriveTrack(generatePattern("track-variant-" + i));
      percHitCounts.add(track.percSteps.filter(Boolean).length);
      fillPeriods.add(track.fillPeriodBars);
    }
    expect(percHitCounts.size).toBeGreaterThan(1);
    expect(fillPeriods.size).toBe(2);
  });
});
