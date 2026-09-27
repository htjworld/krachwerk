import { describe, expect, it } from "vitest";
import { SEED_FAMILIES, encodeSeed, familyFeistelInverse, familySpace, type SeedFamily } from "./seedCode";
import {
  GENRE_SPECS,
  LENGTH_FIELD_RADIX,
  TARGET_LENGTHS_SECONDS,
  decodeGenomeFields,
  encodeGenomeFields,
  genomePrefix,
  kToV2Genome,
  seedToGenome,
  targetSecondsForStyle,
} from "./genome";

function sample(count: number, space: bigint, seed = 0x1234abcd): bigint[] {
  const out: bigint[] = [];
  let a = BigInt(seed);
  for (let i = 0; i < count; i++) {
    a = (a * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
    out.push(a % space);
  }
  return out;
}

describe.each(SEED_FAMILIES)("%s 장르 게놈", (family: SeedFamily) => {
  const space = familySpace(family);
  const spec = GENRE_SPECS[family];
  const { count, product } = genomePrefix(space, spec);
  const total = spec.reduce((acc, [, r]) => acc * BigInt(r), 1n);

  it("필드 전체의 곱이 장르 공간보다 커서, 서로 다른 코드가 같은 게놈이 될 수 없다", () => {
    expect(total >= space).toBe(true);
  });

  // 오프셋이 뒤쪽 필드의 모든 값을 훑으려면 앞쪽 필드 조합 수가 뒤쪽 기수 각각 이상이어야 한다.
  it("앞쪽 필드 조합 수가 뒤쪽 필드 기수보다 커서, 모든 필드의 모든 값이 나온다", () => {
    for (const [, radix] of spec.slice(count)) expect(product >= BigInt(radix)).toBe(true);
  });

  // 멜로디 세부(riffRhythm, riffPitch)를 뺀 핵심 필드 조합이 전부 공간에 들어간다.
  it("멜로디 세부 앞까지의 필드는 모든 조합이 다 나온다", () => {
    const riffAt = spec.findIndex(([field]) => field === "riffRhythm");
    expect(count).toBeGreaterThanOrEqual(riffAt);
  });

  it("0, 끝, 무작위 2만 개를 왕복하고 모든 필드가 기수 안에 있다", () => {
    for (const p of [0n, space - 1n, ...sample(20_000, space)]) {
      const values = decodeGenomeFields(p, space, spec);
      for (const [field, radix] of spec) {
        expect(values[field]).toBeGreaterThanOrEqual(0);
        expect(values[field]).toBeLessThan(radix);
      }
      expect(encodeGenomeFields(values, space, spec)).toBe(p);
    }
  });

  // 실제로 겪은 버그의 회귀 테스트: 옛 혼합 기수 분해에서는 공간을 넘는 뒤쪽 필드가 모든
  // 시드에서 항상 0이었다. 무작위 표본에서 뒤쪽 필드도 넓게 흩어져야 한다.
  it("뒤쪽 필드도 무작위 표본에서 넓게 흩어진다", () => {
    const samples = sample(4_000, space, 99).map((p) => decodeGenomeFields(p, space, spec));
    for (const [field, radix] of spec) {
      const distinct = new Set(samples.map((v) => v[field])).size;
      expect(distinct).toBeGreaterThan(Math.min(radix, 4_000) * 0.5);
    }
  });
});

describe("seedToGenome", () => {
  it("장르 안 번호를 Feistel로 섞은 값(P)을 게놈으로 푼다", () => {
    for (const family of SEED_FAMILIES) {
      const code = encodeSeed(family, 777n);
      const result = seedToGenome(code);
      expect(result.family).toBe(family);
      expect(result.code).toBe(code);
      expect(familyFeistelInverse(family, result.n)).toBe(777n);
      expect(result.seedHash).toBe(Number(result.n % 2n ** 32n));
    }
  });

  it("스타일 장르는 styleGenome에 장르 글자를 담는다", () => {
    const result = seedToGenome("d123456789");
    expect(result.family).toBe("d");
    if (result.family === "open") throw new Error("d는 스타일 장르다");
    expect(result.styleGenome.style).toBe("d");
  });

  it("같은 코드는 항상 같은 결과, 한 글자만 달라도 게놈이 달라진다", () => {
    expect(seedToGenome("k0a1b2c3d4")).toEqual(seedToGenome("k0a1b2c3d4"));
    expect(seedToGenome("k0a1b2c3d4")).not.toEqual(seedToGenome("k0a1b2c3d5"));
  });
});

describe("TARGET_LENGTHS_SECONDS (§8.2)", () => {
  it("150부터 5초 간격으로 13개, length 필드 기수와 일치한다", () => {
    expect(TARGET_LENGTHS_SECONDS).toHaveLength(LENGTH_FIELD_RADIX);
    expect(TARGET_LENGTHS_SECONDS[0]).toBe(150);
    expect(TARGET_LENGTHS_SECONDS[TARGET_LENGTHS_SECONDS.length - 1]).toBe(210);
  });
});

describe("targetSecondsForStyle (§5.4)", () => {
  it("150 + 5×length 공식이다", () => {
    expect(targetSecondsForStyle({ length: 0 })).toBe(150);
    expect(targetSecondsForStyle({ length: 6 })).toBe(180); // d 스타일 최대(기수 7)
    expect(targetSecondsForStyle({ length: 12 })).toBe(210); // 나머지 스타일 최대(기수 13)
  });
});

describe("kToV2Genome (§13.3)", () => {
  it("form이 blueprint로, 나머지 이름 같은 필드는 그대로 옮겨진다", () => {
    const result = seedToGenome("k123456789");
    if (result.family !== "k") throw new Error("k 장르여야 한다");
    const g = result.styleGenome;
    const v2 = kToV2Genome(g);
    expect(v2.blueprint).toBe(g.form);
    for (const field of ["length", "key", "mode", "tempo", "bassShape", "drumVariant", "riffRhythm", "riffPitch"] as const) {
      expect(v2[field]).toBe(g[field]);
    }
  });
});
