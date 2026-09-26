import { describe, expect, it } from "vitest";
import { CODE_SPACE, feistel } from "./seedCode";
import { LENGTH_FIELD_RADIX, RADICES, TARGET_LENGTHS_SECONDS, genomeFromCode, genomeToIndex, indexToGenome } from "./genome";

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
