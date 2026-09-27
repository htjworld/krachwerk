import { describe, expect, it } from "vitest";
import { CODE_SPACE, STYLE_CODE_SPACE, STYLE_LETTERS, feistel } from "./seedCode";
import {
  LENGTH_FIELD_RADIX,
  RADICES,
  STYLE_GENOME_SPECS,
  STYLE_RADIX_PRODUCT,
  TARGET_LENGTHS_SECONDS,
  genomeFromCode,
  genomeToIndex,
  indexToGenome,
  kToV2Genome,
  seedToGenome,
  styleGenomeToIndex,
  styleIndexToGenome,
  targetSecondsForStyle,
} from "./genome";

// seedCode.test.ts와 같은 방식의 결정론적 표본.
function sampleIndices(count: number): number[] {
  const out: number[] = [];
  let a = 0x1234abcd;
  for (let i = 0; i < count; i++) {
    a = (Math.imul(a, 1103515245) + 12345) >>> 0;
    out.push(a % CODE_SPACE);
  }
  return out;
}

describe("RADICES", () => {
  it("곱이 CODE_SPACE보다 크다 (§9.2 유일성 조건)", () => {
    const product = RADICES.reduce((a, b) => a * b, 1);
    expect(product).toBeGreaterThanOrEqual(CODE_SPACE);
  });
});

describe("indexToGenome / genomeToIndex", () => {
  it("0, CODE_SPACE-1, 무작위 10만 개를 왕복한다", () => {
    const cases = [0, CODE_SPACE - 1, ...sampleIndices(100_000)];
    for (const p of cases) {
      expect(genomeToIndex(indexToGenome(p))).toBe(p);
    }
  });

  it("모든 필드가 자기 기수 안에 있다", () => {
    for (const p of [0, CODE_SPACE - 1, ...sampleIndices(1000)]) {
      const g = indexToGenome(p);
      expect(g.blueprint).toBeGreaterThanOrEqual(0);
      expect(g.blueprint).toBeLessThan(RADICES[0]);
      expect(g.length).toBeGreaterThanOrEqual(0);
      expect(g.length).toBeLessThan(LENGTH_FIELD_RADIX);
    }
  });

  it("서로 다른 인덱스는 반드시 서로 다른 게놈이다 (무작위 10만 개, 지문 중복 없음)", () => {
    const seen = new Set<string>();
    for (const p of sampleIndices(100_000)) {
      seen.add(JSON.stringify(indexToGenome(p)));
    }
    expect(seen.size).toBe(100_000);
  });

  // 실제로 겪은 버그의 회귀 테스트: §9.2가 처음 적어 둔 필드 순서([blueprint, key, mode,
  // tempo, riffRhythm, riffPitch, bassShape, drumVariant, length])로는 riffRhythm·riffPitch가
  // 이미 CODE_SPACE를 넘어버려서 bassShape·drumVariant·length가 모든 시드에서 항상 0이었다
  // (§11 단계 4 구현 중 실측). 필드 순서를 바꿔서 고쳤다 — 이 테스트가 다시 깨지면
  // 순서를 되돌린 것이다.
  it("blueprint·length·key·mode·tempo·bassShape·drumVariant는 무작위 표본에서 넓게 흩어진다", () => {
    const samples = sampleIndices(2000).map(indexToGenome);
    const spread = (values: number[]) => new Set(values).size;
    expect(spread(samples.map((g) => g.blueprint))).toBeGreaterThan(10); // 기수 15
    expect(spread(samples.map((g) => g.length))).toBeGreaterThan(10); // 기수 13 — 예전엔 항상 1(=0)
    expect(spread(samples.map((g) => g.key))).toBeGreaterThan(10); // 기수 12
    expect(spread(samples.map((g) => g.mode))).toBe(4); // 기수 4, 표본 2000개면 전부 나온다
    expect(spread(samples.map((g) => g.tempo))).toBeGreaterThan(14); // 기수 16
    expect(spread(samples.map((g) => g.bassShape))).toBeGreaterThan(50); // 기수 64 — 예전엔 항상 1(=0)
    expect(spread(samples.map((g) => g.drumVariant))).toBeGreaterThan(200); // 기수 256 — 예전엔 항상 1(=0)
  });
});

describe("TARGET_LENGTHS_SECONDS (§8.2)", () => {
  it("150부터 5초 간격으로 13개, length 필드 기수와 일치한다", () => {
    expect(TARGET_LENGTHS_SECONDS).toHaveLength(LENGTH_FIELD_RADIX);
    expect(TARGET_LENGTHS_SECONDS[0]).toBe(150);
    expect(TARGET_LENGTHS_SECONDS[TARGET_LENGTHS_SECONDS.length - 1]).toBe(210);
    for (let i = 1; i < TARGET_LENGTHS_SECONDS.length; i++) {
      expect(TARGET_LENGTHS_SECONDS[i] - TARGET_LENGTHS_SECONDS[i - 1]).toBe(5);
    }
  });
});

describe("genomeFromCode", () => {
  it("정규 코드가 아닌 입력을 canonicalize해서 쓴다", () => {
    const { code } = genomeFromCode("hello");
    expect(code).toMatch(/^[0-9a-z]{8}$/);
  });

  it("n은 decodeCode를 feistel로 섞은 값이다", () => {
    const { n } = genomeFromCode("00000000");
    expect(n).toBe(feistel(0));
  });

  it("같은 입력은 항상 같은 게놈을 낸다", () => {
    expect(genomeFromCode("krachwerk")).toEqual(genomeFromCode("krachwerk"));
  });
});

// 결정론적 BigInt 표본 (seedCode.test.ts와 같은 LCG).
function sampleBigInts(count: number, space: bigint): bigint[] {
  const out: bigint[] = [];
  let a = 0x1234abcd9e3779b9n;
  const M = 1n << 64n;
  for (let i = 0; i < count; i++) {
    a = (a * 6364136223846793005n + 1442695040888963407n) & (M - 1n);
    out.push(a % space);
  }
  return out;
}

describe("STYLE_RADIX_PRODUCT (§5.2 조건)", () => {
  it.each(STYLE_LETTERS)("%s: 곱이 STYLE_CODE_SPACE(36^15) 이상이다 (조건①: 유일성)", (style) => {
    expect(STYLE_RADIX_PRODUCT[style]).toBeGreaterThanOrEqual(STYLE_CODE_SPACE);
  });

  it.each(STYLE_LETTERS)("%s: 마지막 필드(riffPitch)를 뺀 곱은 STYLE_CODE_SPACE 이하다 (조건②: 앞 필드 전 범위)", (style) => {
    const spec = STYLE_GENOME_SPECS[style];
    const withoutLast = spec.slice(0, -1).reduce((acc, [, r]) => acc * BigInt(r), 1n);
    expect(withoutLast).toBeLessThanOrEqual(STYLE_CODE_SPACE);
  });
});

describe("styleIndexToGenome / styleGenomeToIndex (§13.3)", () => {
  it.each(STYLE_LETTERS)("%s: 0n, space-1, 무작위 10만 개를 왕복한다", (style) => {
    const space = STYLE_CODE_SPACE;
    const cases = [0n, space - 1n, ...sampleBigInts(100_000, space)];
    for (const p of cases) {
      expect(styleGenomeToIndex(styleIndexToGenome(style, p))).toBe(p);
    }
  });

  it.each(STYLE_LETTERS)("%s: 모든 필드가 자기 기수 안에 있다", (style) => {
    const spec = STYLE_GENOME_SPECS[style];
    for (const p of [0n, STYLE_CODE_SPACE - 1n, ...sampleBigInts(1000, STYLE_CODE_SPACE)]) {
      const g = styleIndexToGenome(style, p);
      for (const [field, radix] of spec) {
        expect(g[field]).toBeGreaterThanOrEqual(0);
        expect(g[field]).toBeLessThan(radix);
      }
    }
  });

  it.each(STYLE_LETTERS)("%s: 서로 다른 인덱스는 반드시 서로 다른 게놈이다 (무작위 5만 개, 지문 중복 없음)", (style) => {
    const seen = new Set<string>();
    for (const p of sampleBigInts(50_000, STYLE_CODE_SPACE)) {
      seen.add(JSON.stringify(styleIndexToGenome(style, p)));
    }
    expect(seen.size).toBe(50_000);
  });

  // v2 §16.3 버그(genome.test.ts 위쪽 참고)가 스타일 게놈에서 재발하지 않는지: riffPitch를
  // 뺀 모든 필드가 무작위 표본에서 넓게 흩어져야 한다.
  it.each(STYLE_LETTERS)("%s: riffPitch를 뺀 모든 필드가 무작위 표본에서 넓게 흩어진다", (style) => {
    const spec = STYLE_GENOME_SPECS[style];
    const samples = sampleBigInts(3000, STYLE_CODE_SPACE).map((p) => styleIndexToGenome(style, p));
    for (const [field, radix] of spec) {
      if (field === "riffPitch") continue;
      const spread = new Set(samples.map((g) => g[field])).size;
      // 기수가 작으면(예: mode=4) 표본 3000개에서 거의 다 나오고, 크면(예: kit=384) 다양성만 확인한다.
      const expectedMin = Math.min(radix, 30);
      expect(spread).toBeGreaterThan(expectedMin * 0.5);
    }
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
    const styleGenome = styleIndexToGenome("k", 123456789n);
    const v2 = kToV2Genome(styleGenome);
    expect(v2.blueprint).toBe(styleGenome.form);
    expect(v2.length).toBe(styleGenome.length);
    expect(v2.key).toBe(styleGenome.key);
    expect(v2.mode).toBe(styleGenome.mode);
    expect(v2.tempo).toBe(styleGenome.tempo);
    expect(v2.bassShape).toBe(styleGenome.bassShape);
    expect(v2.drumVariant).toBe(styleGenome.drumVariant);
    expect(v2.riffRhythm).toBe(styleGenome.riffRhythm);
    expect(v2.riffPitch).toBe(styleGenome.riffPitch);
  });

  it("form(0~11)이 blueprintIdFor의 compute(0~5)/metropolis(6~11) 판정과 그대로 맞는다", () => {
    for (let form = 0; form <= 11; form++) {
      const v2 = kToV2Genome({ style: "k", form });
      expect(v2.blueprint).toBe(form);
    }
  });
});

describe("seedToGenome (§5.3)", () => {
  it("open 코드는 genomeFromCode와 완전히 같은 결과를 낸다", () => {
    const result = seedToGenome("krachwerk");
    const expected = genomeFromCode("krachwerk");
    expect(result.family).toBe("open");
    if (result.family === "open") {
      expect(result.code).toBe(expected.code);
      expect(result.genome).toEqual(expected.genome);
      expect(result.n).toBe(expected.n);
      expect(result.seedHash).toBe(expected.n % 2 ** 32);
    }
  });

  it("스타일 코드는 그 스타일의 styleGenome을 낸다", () => {
    for (const style of STYLE_LETTERS) {
      const code = style + "1".repeat(15);
      const result = seedToGenome(code);
      expect(result.family).toBe(style);
      if (result.family !== "open") {
        expect(result.styleGenome.style).toBe(style);
        expect(result.code).toBe(code);
        expect(Number.isInteger(result.seedHash)).toBe(true);
        expect(result.seedHash).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("같은 스타일 코드는 항상 같은 결과를 낸다", () => {
    const a = seedToGenome("d000000000000001");
    const b = seedToGenome("d000000000000001");
    expect(a).toEqual(b);
  });

  it("스타일 코드 하나만 달라도 게놈이 달라진다", () => {
    const a = seedToGenome("d000000000000001");
    const b = seedToGenome("d000000000000002");
    expect(a).not.toEqual(b);
  });
});
