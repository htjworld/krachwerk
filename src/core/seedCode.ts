// 시드 코드: 형식은 하나뿐이다. base36 10자([0-9a-z]{10}), 36^10개 전부가 정규 코드다.
// 첫 글자가 장르를 정하고, 나머지 9자는 그 장르 안의 곡 번호다. 첫 글자 36개를 다섯 장르에
// 거의 같게(7/7/7/7/8) 나눴다. 맨 앞 글자가 그 장르의 대표 글자다.
//
//   k 0 1 2 3 4 5     Kraftwerk
//   d 6 7 8 9 a b     Delroy Edwards
//   p c e g h i j     Peggy Gou
//   f l m n o q r     Fred again..
//   t s u v w x y z   테크노(open: classicBuild/slowBurn/doubleDrop)
//
// 장르 안에서는 Feistel 순열로 섞어서 이웃한 코드(...aa, ...ab)가 비슷한 곡을 내지 않게 한다.
// 서로 다른 코드가 반드시 서로 다른 게놈이 되는 건 genome.ts가 보장한다.

export type StyleLetter = "k" | "d" | "p" | "f";
export type SeedFamily = "open" | StyleLetter;
export const STYLE_LETTERS: readonly StyleLetter[] = ["k", "d", "p", "f"];
export const SEED_FAMILIES: readonly SeedFamily[] = ["open", ...STYLE_LETTERS];

export const CODE_LENGTH = 10;
const BASE36_DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";
/** 장르별 첫 글자. 맨 앞 글자가 그 장르의 대표 글자다(얼굴 버튼이 만드는 코드가 이걸로 시작한다). */
export const GENRE_LEADS: Record<SeedFamily, string> = {
  k: "k012345",
  d: "d6789ab",
  p: "pceghij",
  f: "flmnoqr",
  open: "tsuvwxyz",
};
const LEAD_FAMILY = new Map<string, SeedFamily>(
  SEED_FAMILIES.flatMap((family) => [...GENRE_LEADS[family]].map((c) => [c, family] as const))
);

const BODY_LENGTH = CODE_LENGTH - 1;
export const BODY_SPACE = 36n ** BigInt(BODY_LENGTH); // 101,559,956,668,416
export const CODE_SPACE = 36n ** BigInt(CODE_LENGTH);

export function familySpace(family: SeedFamily): bigint {
  return BigInt(GENRE_LEADS[family].length) * BODY_SPACE;
}

const CODE_PATTERN = /^[0-9a-z]{10}$/;

export function isCanonical(input: string): boolean {
  return CODE_PATTERN.test(input);
}

function encodeBase36(n: bigint, length: number): string {
  let remaining = n;
  const chars = new Array<string>(length);
  for (let i = length - 1; i >= 0; i--) {
    chars[i] = BASE36_DIGITS[Number(remaining % 36n)];
    remaining /= 36n;
  }
  return chars.join("");
}

function decodeBase36(s: string): bigint {
  let n = 0n;
  for (const c of s) n = n * 36n + BigInt(BASE36_DIGITS.indexOf(c));
  return n;
}

/** 장르 + 장르 안 번호(0 ≤ n < familySpace) → 10자 코드. parseSeed의 역변환. */
export function encodeSeed(family: SeedFamily, n: bigint): string {
  return GENRE_LEADS[family][Number(n / BODY_SPACE)] + encodeBase36(n % BODY_SPACE, BODY_LENGTH);
}

export interface ParsedSeed {
  family: SeedFamily;
  code: string;
  /** 장르 안 번호, Feistel로 섞기 전. */
  n: bigint;
}

/** 정규 코드면 그대로, 아니면 canonicalize(해시)한 코드를 장르와 번호로 푼다. trim이나
 *  소문자 변환은 하지 않는다 — 호출하는 쪽이 정한다. */
export function parseSeed(input: string): ParsedSeed {
  const code = canonicalize(input);
  const family = LEAD_FAMILY.get(code[0])!;
  const n = BigInt(GENRE_LEADS[family].indexOf(code[0])) * BODY_SPACE + decodeBase36(code.slice(1));
  return { family, code, n };
}

// ---------------------------------------------------------------- Feistel 순열 (장르마다 따로)

// 장르마다 다른 키 4개. 정의역 2^50은 가장 큰 장르 공간(open, 8·36^9 ≈ 8.1×10^14)을 덮는
// 가장 작은 짝수 비트다 — cycle walking 반복이 평균 2회를 넘지 않는다.
const HALF_BITS = 25n;
const FEISTEL_KEYS: Record<SeedFamily, readonly bigint[]> = {
  open: [0x3c6ef372fe94f82bn, 0xa54ff53a5f1d36f1n, 0x510e527fade682d1n, 0x9b05688c2b3e6c1fn],
  k: [0x243f6a8885a308d3n, 0x13198a2e03707344n, 0xa4093822299f31d0n, 0x082efa98ec4e6c89n],
  d: [0x452821e638d01377n, 0xbe5466cf34e90c6cn, 0xc0ac29b7c97c50ddn, 0x3f84d5b5b5470917n],
  p: [0x9216d5d98979fb1bn, 0xd1310ba698dfb5acn, 0x2ffd72dbd01adfb7n, 0xb8e1afed6a267e96n],
  f: [0xba7c9045f12c7f99n, 0x24a19947b3916cf7n, 0x0801f2e2858efc16n, 0x636920d871574e69n],
};

const MASK64 = (1n << 64n) - 1n;

// 라운드 함수가 무엇이든 Feistel 구조는 항상 전단사다. 64비트로 섞고 반폭으로 자른다.
function roundFn(r: bigint, k: bigint, mask: bigint): bigint {
  let x = ((r ^ k) * 0x9e3779b97f4a7c15n) & MASK64;
  x ^= x >> 29n;
  x = (x * 0xbf58476d1ce4e5b9n) & MASK64;
  x ^= x >> 32n;
  return x & mask;
}

function permute(n: bigint, halfBits: bigint, keys: readonly bigint[]): bigint {
  const mask = (1n << halfBits) - 1n;
  let l = n >> halfBits;
  let r = n & mask;
  for (const k of keys) {
    const t = r;
    r = l ^ roundFn(r, k, mask);
    l = t;
  }
  return (l << halfBits) | r;
}

function unpermute(p: bigint, halfBits: bigint, keys: readonly bigint[]): bigint {
  const mask = (1n << halfBits) - 1n;
  let l = p >> halfBits;
  let r = p & mask;
  for (let i = keys.length - 1; i >= 0; i--) {
    const t = l;
    l = r ^ roundFn(l, keys[i], mask);
    r = t;
  }
  return (l << halfBits) | r;
}

// cycle walking: 순열의 정의역(2^50)이 장르 공간보다 넓어서, 결과가 범위를
// 벗어나면 다시 돌린다. 전단사를 유지한 채 정의역을 장르 공간으로 좁힌다.
export function familyFeistel(family: SeedFamily, n: bigint): bigint {
  const keys = FEISTEL_KEYS[family];
  const space = familySpace(family);
  let p = permute(n, HALF_BITS, keys);
  while (p >= space) p = permute(p, HALF_BITS, keys);
  return p;
}

export function familyFeistelInverse(family: SeedFamily, p: bigint): bigint {
  const keys = FEISTEL_KEYS[family];
  const space = familySpace(family);
  let n = unpermute(p, HALF_BITS, keys);
  while (n >= space) n = unpermute(n, HALF_BITS, keys);
  return n;
}

// ---------------------------------------------------------------- 무작위 코드

type RandBytes = (bytes: Uint8Array) => void;
const cryptoRand: RandBytes = (b) => crypto.getRandomValues(b);

/** 0 ≤ 결과 < max(≤ 256)를 편향 없이 뽑는다. 256 % max만큼 남는 윗부분 바이트는 버리고 다시 뽑는다. */
function randomBelow(max: number, rand: RandBytes): number {
  const rejectAbove = 256 - (256 % max);
  const buf = new Uint8Array(1);
  do rand(buf);
  while (buf[0] >= rejectAbove);
  return buf[0] % max;
}

/**
 * 무작위 10자 코드. family를 안 주면(빈 칸으로 생성) 다섯 장르를 정확히 같은 확률(20%)로
 * 고른 뒤 그 장르의 첫 글자 중 하나로 시작한다. family를 주면(얼굴 버튼) 그 장르의 대표
 * 글자로 시작한다. rand는 테스트에서 결정론적 소스로 바꿔 끼운다.
 */
export function randomCode(family?: SeedFamily, rand: RandBytes = cryptoRand): string {
  const genre = family ?? SEED_FAMILIES[randomBelow(SEED_FAMILIES.length, rand)];
  const leads = GENRE_LEADS[genre];
  const lead = family ? leads[0] : leads[randomBelow(leads.length, rand)];
  let body = "";
  for (let i = 0; i < BODY_LENGTH; i++) body += BASE36_DIGITS[randomBelow(36, rand)];
  return lead + body;
}

// ---------------------------------------------------------------- 자유 텍스트

// 64비트 FNV-1a. BigInt로 계산해서 32비트 해시보다 충돌 공간을 넓힌다(자유 텍스트는
// 무한하니 완전히 없앨 수는 없다).
const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;

function fnv1a64(input: string): bigint {
  let hash = FNV_OFFSET;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * FNV_PRIME) & MASK64;
  }
  return hash;
}

// 입력이 이미 정규 코드면 그대로 쓴다. 아니면 64비트 해시를 코드 공간 전체(다섯 장르 모두)로
// 접는다. 자유 텍스트끼리 안 겹치는 건 수학적으로 불가능하다(텍스트는 무한하고 코드는 유한하다).
export function canonicalize(input: string): string {
  if (isCanonical(input)) return input;
  return encodeBase36(fnv1a64(input) % CODE_SPACE, CODE_LENGTH);
}
