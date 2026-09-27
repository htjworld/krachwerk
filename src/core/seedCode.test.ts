import { describe, expect, it } from "vitest";
import {
  BODY_SPACE,
  CODE_SPACE,
  GENRE_LEADS,
  SEED_FAMILIES,
  canonicalize,
  encodeSeed,
  familyFeistel,
  familyFeistelInverse,
  familySpace,
  isCanonical,
  parseSeed,
  randomCode,
  type SeedFamily,
} from "./seedCode";
import { mulberry32 } from "./prng";

// 결정론적 BigInt 표본(LCG). 0 ≤ 결과 < space.
function sample(count: number, space: bigint, seed = 0x2545f491): bigint[] {
  const out: bigint[] = [];
  let a = BigInt(seed);
  for (let i = 0; i < count; i++) {
    a = (a * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
    out.push(a % space);
  }
  return out;
}

function detRand(seed: number): (bytes: Uint8Array) => void {
  const rng = mulberry32(seed);
  return (bytes) => {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(rng() * 256);
  };
}

describe("GENRE_LEADS", () => {
  it("첫 글자 36개를 겹치지 않게 다섯 장르에 거의 같게(7/7/7/7/8) 나눈다", () => {
    const all = SEED_FAMILIES.flatMap((f) => [...GENRE_LEADS[f]]);
    expect(all.sort().join("")).toBe("0123456789abcdefghijklmnopqrstuvwxyz");
    expect(SEED_FAMILIES.map((f) => GENRE_LEADS[f].length).sort()).toEqual([7, 7, 7, 7, 8]);
  });

  it("스타일 장르는 자기 글자가 대표 글자(맨 앞)다", () => {
    for (const f of ["k", "d", "p", "f"] as const) expect(GENRE_LEADS[f][0]).toBe(f);
  });

  it("장르 공간을 다 더하면 코드 공간 전체(36^10)다", () => {
    expect(SEED_FAMILIES.reduce((sum, f) => sum + familySpace(f), 0n)).toBe(CODE_SPACE);
  });
});

describe("parseSeed / encodeSeed", () => {
  it("모든 첫 글자가 정규 코드다: 36글자 전부 자기 장르로 풀리고 그대로 되돌아온다", () => {
    for (const family of SEED_FAMILIES) {
      for (const lead of GENRE_LEADS[family]) {
        const code = `${lead}000000000`;
        const parsed = parseSeed(code);
        expect(parsed.family).toBe(family);
        expect(parsed.code).toBe(code);
        expect(encodeSeed(family, parsed.n)).toBe(code);
      }
    }
  });

  it("장르마다 0, 끝, 무작위 1만 개를 왕복한다", () => {
    for (const family of SEED_FAMILIES) {
      const space = familySpace(family);
      for (const n of [0n, space - 1n, ...sample(10_000, space)]) {
        const code = encodeSeed(family, n);
        expect(code).toMatch(/^[0-9a-z]{10}$/);
        expect(parseSeed(code)).toEqual({ family, code, n });
      }
    }
  });

  it("장르 안 번호는 [0, familySpace) 안이다", () => {
    const parsed = parseSeed("zzzzzzzzzz");
    expect(parsed.n).toBe(familySpace(parsed.family) - 1n);
    expect(parseSeed("0000000000").n).toBe(BODY_SPACE); // 0은 k 장르의 두 번째 글자
  });
});

describe("familyFeistel / familyFeistelInverse", () => {
  it.each(SEED_FAMILIES)("%s: 순열이 공간 안에 머물고 정확히 되돌아온다", (family: SeedFamily) => {
    const space = familySpace(family);
    for (const n of [0n, 1n, space - 1n, ...sample(5_000, space, 7)]) {
      const p = familyFeistel(family, n);
      expect(p >= 0n && p < space).toBe(true);
      expect(familyFeistelInverse(family, p)).toBe(n);
    }
  });

  it("실제로 섞고, 장르마다 다른 순열이다", () => {
    expect(familyFeistel("k", 1n)).not.toBe(1n);
    expect(familyFeistel("k", 12345n)).not.toBe(familyFeistel("d", 12345n));
  });
});

describe("canonicalize", () => {
  it("이미 정규 코드면 그대로 둔다", () => {
    expect(canonicalize("a123456789")).toBe("a123456789");
  });

  it("자유 텍스트는 해시해서 정규 코드로 만들고, 같은 텍스트는 항상 같은 코드다", () => {
    expect(isCanonical(canonicalize("hello"))).toBe(true);
    expect(canonicalize("krachwerk")).toBe(canonicalize("krachwerk"));
    expect(canonicalize("krachwerk")).not.toBe(canonicalize("Krachwerk")); // trim/소문자 변환은 호출하는 쪽 몫
  });

  it("자유 텍스트도 다섯 장르 모두로 흩어진다", () => {
    const families = new Set(Array.from({ length: 200 }, (_, i) => parseSeed(`text ${i}`).family));
    expect(families.size).toBe(5);
  });
});

describe("randomCode", () => {
  it("장르를 주면 그 장르의 대표 글자로 시작하는 정규 코드를 낸다", () => {
    for (const family of SEED_FAMILIES) {
      const code = randomCode(family, detRand(1));
      expect(isCanonical(code)).toBe(true);
      expect(code[0]).toBe(GENRE_LEADS[family][0]);
      expect(parseSeed(code).family).toBe(family);
    }
  });

  it("장르 없이 뽑으면 다섯 장르가 거의 같은 비율(20%)로 나온다", () => {
    const rand = detRand(42);
    const counts = new Map<SeedFamily, number>();
    const N = 20_000;
    for (let i = 0; i < N; i++) {
      const family = parseSeed(randomCode(undefined, rand)).family;
      counts.set(family, (counts.get(family) ?? 0) + 1);
    }
    for (const family of SEED_FAMILIES) expect(Math.abs((counts.get(family) ?? 0) / N - 0.2)).toBeLessThan(0.015);
  });

  it("실제 crypto로도 유효한 코드를 낸다 (기본 인자)", () => {
    expect(isCanonical(randomCode())).toBe(true);
  });
});
