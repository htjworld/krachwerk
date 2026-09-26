import { canonicalize, decodeCode, feistel } from "./seedCode";

// 게놈: 시드 코드가 결정하는 곡의 정체성을 필드 9개로 나눈 것 (§9.2). 필드 하나하나가
// 들리는 차이로 이어지게 만들어서, 정규 코드가 하나라도 다르면 게놈 필드가 최소 하나는
// 달라지고(혼합 기수 분해는 유일하다), 그게 곧 곡이 다르다는 뜻이 되게 한다(Q4).
//
// 기수는 blueprint 15 · key 12 · mode 4 · tempo 16 · riffRhythm 4096 · riffPitch 390625 ·
// bassShape 64 · drumVariant 256 · length 13. 곱은 CODE_SPACE(36^8 ≈ 2.82×10^12)보다
// 훨씬 크다(§9.2) — 그래서 서로 다른 인덱스 N은 반드시 서로 다른 게놈이 된다.

// §9.2가 적어 둔 순서 그대로([15,12,4,16,4096,390625,64,256,13])는 실제로 심각한 버그가
// 있었다: 혼합 기수 분해는 앞쪽 필드부터 p(< CODE_SPACE ≈ 2.82×10^12)를 나눠 쓰는데,
// blueprint·key·mode·tempo·riffRhythm까지 곱해도 겨우 4.7×10^7이라 문제없지만, 그 다음
// riffPitch(390625)까지 곱하면 1.84×10^13으로 CODE_SPACE를 넘어버린다. 그 뒤에 남는 p가
// 없어서 bassShape·drumVariant·length는 어떤 시드를 넣어도 항상 나머지 0을 받는다
// (유일성 증명 자체는 여전히 성립하지만 — 서로 다른 p는 여전히 서로 다른 9-튜플을
// 낸다 — 이 세 필드 혼자만 보면 전혀 다양해지지 않는다는 뜻이다. §11 단계 4 구현 중
// genome.length가 모든 시드에서 0으로 나오는 걸로 실측했다).
//
// RADICES의 값 자체(각 필드가 뜻하는 실제 가짓수)는 안 바꾸고, 필드를 나누는 **순서**만
// 바꿨다: blueprint(구조 선택, 40/40/20 비중이 깨지면 안 된다) → length(Q3로 사용자가
// 명시적으로 원한 길이 다양성) → key → mode → tempo → bassShape → drumVariant(§11 단계
// 5·6이 실제로 쓴다) → riffRhythm → riffPitch. 이 순서면 앞 7개 필드는 전 범위를 그대로
// 쓰고, riffRhythm은 부분 범위(4096 중 약 1150, ~28%)만 쓰고, riffPitch만 항상 0이 된다
// (리프 피치는 8음 중 뒤쪽 음들이 항상 근음이 된다는 뜻 — §11 단계 6 전까진 아직 어차피
// 안 쓰인다). 세 필드가 죽는 것보다 하나가 죽는 쪽이 훨씬 낫다.
export const RADICES = [15, 13, 12, 4, 16, 64, 256, 4096, 390625] as const;

export interface Genome {
  blueprint: number;
  length: number;
  key: number;
  mode: number;
  tempo: number;
  bassShape: number;
  drumVariant: number;
  riffRhythm: number;
  riffPitch: number;
}

const ORDER: (keyof Genome)[] = [
  "blueprint",
  "length",
  "key",
  "mode",
  "tempo",
  "bassShape",
  "drumVariant",
  "riffRhythm",
  "riffPitch",
];

// 혼합 기수 분해: 낮은 자리(첫 필드)부터 나머지를 뽑는다. p < CODE_SPACE ≤ 기수의 곱이므로
// 마지막 필드(length)의 몫도 항상 기수(13) 안에 들어온다 — 버릴 게 없다.
export function indexToGenome(p: number): Genome {
  let remaining = p;
  const values: Partial<Genome> = {};
  for (let i = 0; i < ORDER.length; i++) {
    const radix = RADICES[i];
    values[ORDER[i]] = remaining % radix;
    remaining = Math.floor(remaining / radix);
  }
  return values as Genome;
}

// 역변환: 마지막 필드부터 되짚어 올라간다. p = p * radix + g[field].
export function genomeToIndex(g: Genome): number {
  let p = 0;
  for (let i = ORDER.length - 1; i >= 0; i--) {
    p = p * RADICES[i] + g[ORDER[i]];
  }
  return p;
}

// §8.2: 게놈 길이 필드(기수 13)가 고르는 목표 길이. 150, 155, …, 210초.
export const LENGTH_FIELD_RADIX = RADICES[ORDER.indexOf("length")];
export const TARGET_LENGTHS_SECONDS: readonly number[] = Array.from(
  { length: LENGTH_FIELD_RADIX },
  (_, i) => 150 + 5 * i
);

export function targetSecondsFor(genome: Pick<Genome, "length">): number {
  return TARGET_LENGTHS_SECONDS[genome.length];
}

/**
 * 시드 문자열 하나를 게놈까지 완전히 풀어낸다: 정규 코드가 아니면 해시해서 만들고
 * (canonicalize), base36을 정수로 읽고(decodeCode), Feistel로 섞어서(feistel) 이웃한
 * 코드끼리 비슷한 곡이 나오지 않게 한 다음, 혼합 기수로 게놈을 뽑는다.
 * `n`은 이후 mulberry32 시드 등 게놈 밖 무작위성에도 쓴다(seedHash = n % 2^32).
 */
export function genomeFromCode(seedInput: string): { code: string; genome: Genome; n: number } {
  const code = canonicalize(seedInput);
  const decoded = decodeCode(code);
  // canonicalize의 결과는 항상 정규 코드 형식이라 decodeCode가 null을 줄 일이 없다.
  if (decoded === null) throw new Error(`canonicalize produced a non-canonical code: ${code}`);
  const n = feistel(decoded);
  return { code, genome: indexToGenome(n), n };
}
