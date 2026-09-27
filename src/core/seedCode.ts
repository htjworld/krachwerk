// 정규 시드 코드: base36 8자([0-9a-z]{8}), 공간 크기 36^8 = 2,821,109,907,456.
// 목표는 "서로 다른 정규 코드는 반드시 다른 곡을 낸다"는 걸 구조적으로 보장하는 것
// (명세 §9). 이 파일은 그 앞단, 코드 문자열 ↔ 정수 변환과 Feistel 순열만 다룬다.

export const CODE_LENGTH = 8;
export const CODE_SPACE = 36 ** 8; // 2,821,109,907,456

const HALF = 2 ** 21;
const MASK = HALF - 1;
const KEYS = [0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c];

// 21비트 → 21비트. 라운드 함수가 무엇이든 Feistel 구조는 항상 전단사다.
function roundFn(r: number, k: number): number {
  let x = Math.imul(r ^ k, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) & MASK;
}

// 4라운드 Feistel. [0, 2^42) 위의 전단사(2^42 = 2 * HALF * HALF... 정확히는 HALF^2 * 2).
// 이웃한 코드(...aa, ...ab)가 비슷한 곡을 내지 않도록 섞는다.
function permuteOnce(n: number): number {
  let l = Math.floor(n / HALF);
  let r = n % HALF;
  for (const k of KEYS) {
    const t = r;
    r = l ^ roundFn(r, k);
    l = t;
  }
  return l * HALF + r;
}

function unpermuteOnce(p: number): number {
  let l = Math.floor(p / HALF);
  let r = p % HALF;
  for (let i = KEYS.length - 1; i >= 0; i--) {
    const t = l;
    l = r ^ roundFn(l, KEYS[i]);
    r = t;
  }
  return l * HALF + r;
}

// cycle walking: permuteOnce의 정의역(2^42)이 CODE_SPACE보다 넓어서, 결과가
// CODE_SPACE를 벗어나면 다시 순열을 돌린다. 전단사를 그대로 유지한 채 정의역을 좁힌다.
export function feistel(n: number): number {
  let p = permuteOnce(n);
  while (p >= CODE_SPACE) p = permuteOnce(p);
  return p;
}

export function feistelInverse(p: number): number {
  let n = unpermuteOnce(p);
  while (n >= CODE_SPACE) n = unpermuteOnce(n);
  return n;
}

export function encodeCode(n: number): string {
  return n.toString(36).padStart(CODE_LENGTH, "0");
}

const CODE_PATTERN = /^[0-9a-z]{8}$/;

export function decodeCode(code: string): number | null {
  if (!CODE_PATTERN.test(code)) return null;
  return parseInt(code, 36);
}

export function isCanonical(input: string): boolean {
  return CODE_PATTERN.test(input);
}

// ---------------------------------------------------------------- 스타일 코드 (§5, §13.2)
//
// 얼굴 버튼(Kraftwerk/Delroy/Peggy/Fred)이 만드는 16자 코드: 스타일 글자 1(k/d/p/f) + 본문
// 15자. 본문은 기본 코드와 같은 구조(base36 → Feistel 전단사 → 혼합 기수 게놈)를 쓰지만
// 공간이 36^15 ≈ 2.21×10^23이라 JS Number(2^53 한계)를 넘는다 — 전부 BigInt로 계산한다.
// 자유 텍스트는 이 경로에 절대 들어오지 않는다(§5.1) — 얼굴을 눌러야만 스타일 코드가 된다.

export type StyleLetter = "k" | "d" | "p" | "f";
export const STYLE_LETTERS: readonly StyleLetter[] = ["k", "d", "p", "f"];
export const STYLE_BODY_LENGTH = 15;
export const STYLE_CODE_SPACE = 36n ** 15n; // 221,073,919,720,733,357,899,776

const STYLE_CODE_PATTERN = /^[kdpf][0-9a-z]{15}$/;
const HALF_BITS = 39n;
const HALF39 = 1n << HALF_BITS;
const MASK39 = HALF39 - 1n;
const MASK64_STYLE = (1n << 64n) - 1n;

// 스타일마다 다른 키 4개(4라운드 Feistel). 서로 다른 스타일이 같은 본문 숫자를 넣어도
// 다른 순서로 섞이게 한다 — 스타일 간에는 어차피 블루프린트 집합이 겹치지 않으므로(§5.5)
// 필수는 아니지만, 스타일마다 독립된 치환이라는 게 더 깔끔하다.
const STYLE_KEYS: Record<StyleLetter, readonly bigint[]> = {
  k: [0x243f6a8885a308d3n, 0x13198a2e03707344n, 0xa4093822299f31d0n, 0x082efa98ec4e6c89n],
  d: [0x452821e638d01377n, 0xbe5466cf34e90c6cn, 0xc0ac29b7c97c50ddn, 0x3f84d5b5b5470917n],
  p: [0x9216d5d98979fb1bn, 0xd1310ba698dfb5acn, 0x2ffd72dbd01adfb7n, 0xb8e1afed6a267e96n],
  f: [0xba7c9045f12c7f99n, 0x24a19947b3916cf7n, 0x0801f2e2858efc16n, 0x636920d871574e69n],
};

// 39비트 → 39비트 라운드 함수. 64비트 산술로 섞은 뒤 39비트로 자른다 — 라운드 함수가
// 무엇이든 Feistel 구조는 항상 전단사다(v2 seedCode.ts의 roundFn과 같은 논리, BigInt판).
function roundFn39(r: bigint, k: bigint): bigint {
  let x = ((r ^ k) * 0x9e3779b97f4a7c15n) & MASK64_STYLE;
  x ^= x >> 29n;
  x = (x * 0xbf58476d1ce4e5b9n) & MASK64_STYLE;
  x ^= x >> 32n;
  return x & MASK39;
}

// 4라운드 Feistel, [0, 2^78) 위의 전단사(2^78 = HALF39^2 * 2).
function permute78(n: bigint, keys: readonly bigint[]): bigint {
  let l = n >> HALF_BITS;
  let r = n & MASK39;
  for (const k of keys) {
    const t = r;
    r = l ^ roundFn39(r, k);
    l = t;
  }
  return (l << HALF_BITS) | r;
}

function unpermute78(p: bigint, keys: readonly bigint[]): bigint {
  let l = p >> HALF_BITS;
  let r = p & MASK39;
  for (let i = keys.length - 1; i >= 0; i--) {
    const t = l;
    l = r ^ roundFn39(l, keys[i]);
    r = t;
  }
  return (l << HALF_BITS) | r;
}

// cycle walking: permute78의 정의역(2^78)이 STYLE_CODE_SPACE(36^15)보다 넓어서, 결과가
// 범위를 벗어나면 다시 순열을 돌린다(평균 약 1.37회). 전단사를 그대로 유지한 채 정의역을 좁힌다.
export function styleFeistel(style: StyleLetter, n: bigint): bigint {
  const keys = STYLE_KEYS[style];
  let p = permute78(n, keys);
  while (p >= STYLE_CODE_SPACE) p = permute78(p, keys);
  return p;
}

export function styleFeistelInverse(style: StyleLetter, p: bigint): bigint {
  const keys = STYLE_KEYS[style];
  let n = unpermute78(p, keys);
  while (n >= STYLE_CODE_SPACE) n = unpermute78(n, keys);
  return n;
}

const BASE36_DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";

/** 스타일 코드 본문(15자, base36)을 BigInt로. 인코딩만 — Feistel은 안 거친다. */
export function encodeStyleBody(n: bigint): string {
  let remaining = n;
  const chars = new Array<string>(STYLE_BODY_LENGTH);
  for (let i = STYLE_BODY_LENGTH - 1; i >= 0; i--) {
    chars[i] = BASE36_DIGITS[Number(remaining % 36n)];
    remaining /= 36n;
  }
  return chars.join("");
}

const STYLE_BODY_PATTERN = /^[0-9a-z]{15}$/;

export function decodeStyleBody(body: string): bigint | null {
  if (!STYLE_BODY_PATTERN.test(body)) return null;
  let n = 0n;
  for (let i = 0; i < body.length; i++) {
    n = n * 36n + BigInt(BASE36_DIGITS.indexOf(body[i]));
  }
  return n;
}

export type ParsedSeed =
  | { family: "open"; code: string; n: number }
  | { family: StyleLetter; code: string; n: bigint };

/**
 * §5.1 해석 순서: ① 스타일 코드(첫 글자 k/d/p/f + 본문 15자) ② 기본 코드(8자 base36)
 * ③ 그 밖은 자유 텍스트로 보고 canonicalize(64비트 해시 → 기본 코드)한다. trim이나
 * 소문자 변환은 하지 않는다(v2 §16.2 결정 그대로) — 대문자 `K...`는 스타일 코드
 * 정규식에 안 걸려서 자유 텍스트로 해시된다.
 */
export function parseSeed(input: string): ParsedSeed {
  if (STYLE_CODE_PATTERN.test(input)) {
    const style = input[0] as StyleLetter;
    const n = decodeStyleBody(input.slice(1))!;
    return { family: style, code: input, n };
  }
  const code = canonicalize(input);
  return { family: "open", code, n: decodeCode(code)! };
}

/** 얼굴 버튼: 누를 때마다 새 무작위 스타일 코드. crypto.getRandomValues로 바이트를
 *  뽑고 252 이상은 버려서(모듈로 편향 제거, 256 % 36 = 4가 남아 편향이 생긴다) 36으로
 *  접는다. rand는 테스트에서 결정론적 소스로 바꿔 끼울 수 있게 인자로 받는다. */
export function randomStyleCode(
  style: StyleLetter,
  rand: (bytes: Uint8Array) => void = (b) => crypto.getRandomValues(b)
): string {
  const REJECT_ABOVE = 252; // 256 - (256 % 36)
  const chars = new Array<string>(STYLE_BODY_LENGTH);
  const buf = new Uint8Array(1);
  for (let i = 0; i < STYLE_BODY_LENGTH; i++) {
    let byte: number;
    do {
      rand(buf);
      byte = buf[0];
    } while (byte >= REJECT_ABOVE);
    chars[i] = BASE36_DIGITS[byte % 36];
  }
  return style + chars.join("");
}

// 64비트 FNV-1a. BigInt로 계산해서 32비트 해시보다 충돌 공간을 넓힌다(자유 텍스트는
// 무한하니 완전히 없앨 수는 없지만, 이 정도면 충분하다).
const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK64 = (1n << 64n) - 1n;

function fnv1a64(input: string): bigint {
  let hash = FNV_OFFSET;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * FNV_PRIME) & MASK64;
  }
  return hash;
}

// 입력이 이미 정규 코드 형식이면 그대로 쓴다. 아니면 64비트 해시를 코드 공간으로
// 접어서 정규 코드를 만든다. 자유 텍스트끼리 안 겹치는 건 수학적으로 불가능하다
// (텍스트는 무한하고 코드는 유한하다). 유일성 보장은 정규 코드 사이에서만 성립한다.
export function canonicalize(input: string): string {
  if (isCanonical(input)) return input;
  const n = Number(fnv1a64(input) % BigInt(CODE_SPACE));
  return encodeCode(n);
}
