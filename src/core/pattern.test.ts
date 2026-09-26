import { describe, expect, it } from "vitest";
import { generatePattern } from "./pattern";
import { findSeedForTraits, traitsMatch } from "./traits";
import { canonicalize, isCanonical } from "./seedCode";
import { genomeFromCode } from "./genome";

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

  // §11 단계 5부터는 드럼이 시드와 무관하게 항상 같지 않다 — fourFloor 필수 스텝
  // (0·4·8·12)은 모든 시드가 같지만, 게놈 drumVariant의 스텝 14 비트만 시드마다 다르다.
  it("킥의 필수 스텝(0·4·8·12)은 모든 시드가 같고, 스텝 14는 게놈에 따라 갈린다", () => {
    const REQUIRED = [0, 4, 8, 12];
    const kicks = new Set<boolean>();
    for (let i = 0; i < 40; i++) {
      const { drum } = generatePattern("drum-variant-seed-" + i);
      for (const step of REQUIRED) expect(drum.kick[step]).toBe(true);
      kicks.add(drum.kick[14]);
    }
    expect(kicks.size).toBe(2); // 표본 40개면 스텝 14가 true/false 둘 다 나온다(우연히 다 같을 확률은 무시할 만큼 작다)
  });

  it("keeps tempo within the 104-132 BPM range", () => {
    for (const seed of ["a", "b", "c", "krachwerk", "0"]) {
      const { tempo } = generatePattern(seed);
      expect(tempo).toBeGreaterThanOrEqual(104);
      expect(tempo).toBeLessThanOrEqual(132);
    }
  });

  // §11 단계 4: 게놈 연결.
  describe("게놈 연결 (§11 단계 4)", () => {
    it("seedInput은 항상 정규 코드다 (자유 텍스트는 canonicalize된다)", () => {
      for (const seed of ["krachwerk", "133r53252rwersa", "hello world", "00000000"]) {
        const pattern = generatePattern(seed);
        expect(isCanonical(pattern.seedInput)).toBe(true);
        expect(pattern.seedInput).toBe(canonicalize(seed));
      }
    });

    it("이미 정규 코드인 입력은 그대로 seedInput이 된다", () => {
      const code = "3k9x0a2b";
      expect(isCanonical(code)).toBe(true);
      expect(generatePattern(code).seedInput).toBe(code);
    });

    it("genome/blueprintId가 genomeFromCode와 같은 값이다", () => {
      const pattern = generatePattern("krachwerk");
      const { genome, n } = genomeFromCode("krachwerk");
      expect(pattern.genome).toEqual(genome);
      expect(pattern.seedHash).toBe(n % 2 ** 32);
      expect(["compute", "metropolis", "classicBuild", "slowBurn", "doubleDrop"]).toContain(pattern.blueprintId);
    });
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
