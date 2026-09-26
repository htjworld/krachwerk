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
