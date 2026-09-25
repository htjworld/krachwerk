import { describe, expect, it } from "vitest";
import { generatePattern } from "./pattern";
import { findSeedForTraits, traitsMatch } from "./traits";

describe("generatePattern", () => {
  it("is fully deterministic for the same seed", () => {
    const a = generatePattern("133r53252rwersa");
    const b = generatePattern("133r53252rwersa");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("produces different tracks for different seeds", () => {
    const a = generatePattern("seed-one");
    const b = generatePattern("seed-two");
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it("keeps the drum layer identical across every seed", () => {
    const a = generatePattern("alpha");
    const b = generatePattern("totally-different-seed-string");
    expect(a.drum).toEqual(b.drum);
  });

  it("keeps tempo within the 104-132 BPM range", () => {
    for (const seed of ["a", "b", "c", "krachwerk", "0"]) {
      const { tempo } = generatePattern(seed);
      expect(tempo).toBeGreaterThanOrEqual(104);
      expect(tempo).toBeLessThanOrEqual(132);
    }
  });
});

describe("findSeedForTraits", () => {
  it("returns a seed whose generated pattern matches the requested traits", () => {
    const seed = findSeedForTraits({ bassEmphasis: true, unusualTimbre: false, melodyStyle: "minimal" });
    const pattern = generatePattern(seed);
    expect(
      traitsMatch(pattern, { bassEmphasis: true, unusualTimbre: false, melodyStyle: "minimal" })
    ).toBe(true);
  });
});
