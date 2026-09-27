import { describe, expect, it } from "vitest";
import {
  CODE_SPACE,
  STYLE_CODE_SPACE,
  STYLE_LETTERS,
  canonicalize,
  decodeCode,
  decodeStyleBody,
  encodeCode,
  encodeStyleBody,
  feistel,
  feistelInverse,
  isCanonical,
  parseSeed,
  randomStyleCode,
  styleFeistel,
  styleFeistelInverse,
  type StyleLetter,
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

// 결정론적 BigInt 표본 (§5.2 스타일 코드용). LCG를 BigInt로.
function sampleBigInts(count: number, space: bigint): bigint[] {
  const out: bigint[] = [];
  let a = 0x2545f4914f6cdd1dn;
  const M = 1n << 64n;
  for (let i = 0; i < count; i++) {
    a = (a * 6364136223846793005n + 1442695040888963407n) & (M - 1n);
    out.push(a % space);
  }
  return out;
}

describe("encodeStyleBody / decodeStyleBody (§13.2)", () => {
  it("round-trips 0n, 1n, space-1, 무작위 10만 개", () => {
    const cases = [0n, 1n, STYLE_CODE_SPACE - 1n, ...sampleBigInts(100_000, STYLE_CODE_SPACE)];
    for (const n of cases) {
      expect(decodeStyleBody(encodeStyleBody(n))).toBe(n);
    }
  });

  it("15자 base36 코드를 낸다, 0으로 채운다", () => {
    expect(encodeStyleBody(0n)).toBe("000000000000000");
    expect(encodeStyleBody(0n)).toHaveLength(15);
    expect(encodeStyleBody(0n)).toMatch(/^[0-9a-z]{15}$/);
  });

  it("형식이 아니면 null", () => {
    expect(decodeStyleBody("!!!")).toBeNull();
    expect(decodeStyleBody("ABCDEFGHIJKLMNO")).toBeNull(); // 대문자
    expect(decodeStyleBody("123456789012345678")).toBeNull(); // 18자
    expect(decodeStyleBody("12345")).toBeNull(); // 5자
  });
});

describe("styleFeistel / styleFeistelInverse (§13.2)", () => {
  it.each(STYLE_LETTERS)("%s: round-trips 0n, 1n, space-1, 무작위 10만 개", (style) => {
    const cases = [0n, 1n, STYLE_CODE_SPACE - 1n, ...sampleBigInts(100_000, STYLE_CODE_SPACE)];
    for (const n of cases) {
      expect(styleFeistelInverse(style, styleFeistel(style, n))).toBe(n);
    }
  });

  it.each(STYLE_LETTERS)("%s: 항상 [0, STYLE_CODE_SPACE) 안에 있다", (style) => {
    for (const n of [0n, 1n, STYLE_CODE_SPACE - 1n, ...sampleBigInts(1000, STYLE_CODE_SPACE)]) {
      const p = styleFeistel(style, n);
      expect(p).toBeGreaterThanOrEqual(0n);
      expect(p).toBeLessThan(STYLE_CODE_SPACE);
    }
  });

  it("실제로 섞는다 (항등함수가 아니다)", () => {
    expect(styleFeistel("k", 1n)).not.toBe(1n);
  });

  it("스타일마다 다른 치환이다 (같은 n이 스타일마다 다른 p를 낸다)", () => {
    const outputs = STYLE_LETTERS.map((s) => styleFeistel(s, 12345n));
    expect(new Set(outputs.map(String)).size).toBe(STYLE_LETTERS.length);
  });
});

describe("parseSeed (§5.1)", () => {
  it("16자 스타일 코드(k/d/p/f + 본문 15자)를 그 가족으로 판정한다", () => {
    for (const style of STYLE_LETTERS) {
      const code = style + "0".repeat(15);
      const parsed = parseSeed(code);
      expect(parsed.family).toBe(style);
      expect(parsed.code).toBe(code);
      if (parsed.family !== "open") expect(parsed.n).toBe(0n);
    }
  });

  it("8자 기본 코드는 open으로 그대로 판정한다", () => {
    const parsed = parseSeed("3k9x0a2b");
    expect(parsed.family).toBe("open");
    expect(parsed.code).toBe("3k9x0a2b");
    if (parsed.family === "open") expect(parsed.n).toBe(decodeCode("3k9x0a2b"));
  });

  it("자유 텍스트는 절대 스타일 코드가 되지 않는다 — canonicalize된 기본 코드가 된다", () => {
    const parsed = parseSeed("hello world");
    expect(parsed.family).toBe("open");
    expect(isCanonical(parsed.code)).toBe(true);
    expect(parsed.code).toBe(canonicalize("hello world"));
  });

  it("대문자 'K...'는 스타일 코드 정규식에 안 걸려서 자유 텍스트로 해시된다", () => {
    const upper = "K" + "0".repeat(15);
    const parsed = parseSeed(upper);
    expect(parsed.family).toBe("open");
    expect(parsed.code).toBe(canonicalize(upper));
  });

  it("스타일 코드가 아닌 첫 글자(예: q)는 자유 텍스트로 취급된다", () => {
    const notStyle = "q" + "0".repeat(15);
    const parsed = parseSeed(notStyle);
    expect(parsed.family).toBe("open");
  });
});

describe("randomStyleCode (§5.6)", () => {
  // 결정론적 가짜 난수 소스: 바이트를 순환시킨다. 편향 제거 로직(252 이상 재시도)도
  // 같이 검증하기 위해 일부러 252 이상 값을 섞어 넣는다.
  function fakeRand(bytes: number[]): (out: Uint8Array) => void {
    let i = 0;
    return (out: Uint8Array) => {
      out[0] = bytes[i % bytes.length];
      i++;
    };
  }

  it("스타일 글자로 시작하는 16자 코드를 낸다", () => {
    for (const style of STYLE_LETTERS) {
      const code = randomStyleCode(style, fakeRand([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]));
      expect(code[0]).toBe(style);
      expect(code).toHaveLength(16);
      expect(code.slice(1)).toMatch(/^[0-9a-z]{15}$/);
    }
  });

  it("252 이상 바이트는 버리고 다시 뽑는다 (모듈로 편향 없음)", () => {
    // 252,253,254,255를 계속 주다가 결국 유효한 값(0)을 준다 — 무한루프 없이 끝나야 한다.
    const code = randomStyleCode("k", fakeRand([252, 253, 254, 255, 0]));
    expect(code).toBe("k" + "0".repeat(15));
  });

  it("다른 rand 소스를 주면 다른 코드가 나온다 (매번 새 코드)", () => {
    const a = randomStyleCode("d", fakeRand([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]));
    const b = randomStyleCode("d", fakeRand([9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 11, 12, 13, 14, 15]));
    expect(a).not.toBe(b);
  });

  it("실제 crypto.getRandomValues로도 유효한 스타일 코드를 낸다 (기본 인자)", () => {
    const code = randomStyleCode("p" as StyleLetter);
    expect(code).toMatch(/^p[0-9a-z]{15}$/);
  });
});
