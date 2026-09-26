import { describe, expect, it } from "vitest";
import {
  CODE_SPACE,
  canonicalize,
  decodeCode,
  encodeCode,
  feistel,
  feistelInverse,
  isCanonical,
} from "./seedCode";

// 결정론적 표본. Math.random 없이 시드 하나에서 10만 개를 고르게 흩뿌린다.
function sampleIndices(count: number): number[] {
  const out: number[] = [];
  let a = 0x2545f491;
  for (let i = 0; i < count; i++) {
    a = (Math.imul(a, 1103515245) + 12345) >>> 0;
    out.push(a % CODE_SPACE);
  }
  return out;
}

describe("encodeCode / decodeCode", () => {
  it("round-trips 0, 1, M-1 and a large random sample", () => {
    const cases = [0, 1, CODE_SPACE - 1, ...sampleIndices(100_000)];
    for (const n of cases) {
      expect(decodeCode(encodeCode(n))).toBe(n);
    }
  });

  it("produces 8-char base36 codes, zero-padded", () => {
    expect(encodeCode(0)).toBe("00000000");
    expect(encodeCode(1)).toBe("00000001");
    expect(encodeCode(0)).toMatch(/^[0-9a-z]{8}$/);
  });

  it("returns null for anything that isn't an 8-char lowercase base36 string", () => {
    expect(decodeCode("!!!")).toBeNull();
    expect(decodeCode("ABCDEFGH")).toBeNull(); // 대문자는 정규 코드가 아니다
    expect(decodeCode("1234567")).toBeNull(); // 7자
    expect(decodeCode("123456789")).toBeNull(); // 9자
    expect(decodeCode("hello world")).toBeNull();
  });
});

describe("feistel / feistelInverse", () => {
  it("round-trips 0, 1, M-1 and a large random sample", () => {
    const cases = [0, 1, CODE_SPACE - 1, ...sampleIndices(100_000)];
    for (const n of cases) {
      expect(feistelInverse(feistel(n))).toBe(n);
    }
  });

  it("always stays inside [0, CODE_SPACE)", () => {
    for (const n of [0, 1, CODE_SPACE - 1, ...sampleIndices(1000)]) {
      const p = feistel(n);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(CODE_SPACE);
    }
  });

  it("is not the identity function (actually mixes the input)", () => {
    expect(feistel(1)).not.toBe(1);
  });
});

describe("canonicalize", () => {
  it("returns already-canonical codes unchanged", () => {
    const code = encodeCode(123456);
    expect(canonicalize(code)).toBe(code);
  });

  it("hashes non-canonical input into a canonical code", () => {
    const code = canonicalize("hello");
    expect(isCanonical(code)).toBe(true);
  });

  it("is deterministic: the same text always maps to the same code", () => {
    expect(canonicalize("krachwerk")).toBe(canonicalize("krachwerk"));
  });

  it("does not trim or lowercase — that's the caller's decision", () => {
    // "ABC"는 정규 코드가 아니므로 해시되고, 원문 그대로 입력이 다르면 코드도 달라진다.
    expect(canonicalize("abc")).not.toBe(canonicalize("ABC"));
  });
});
