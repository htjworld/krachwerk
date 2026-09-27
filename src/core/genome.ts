import { familyFeistel, familySpace, parseSeed, type SeedFamily, type StyleLetter } from "./seedCode";

// 게놈: 시드 코드가 결정하는 곡의 정체성 필드들. 장르(seedCode.ts의 첫 글자)마다 필드
// 목록과 기수가 다르다(GENRE_SPECS). 필드 하나하나가 들리는 차이로 이어지게 만들었다.
//
// 코드 → 게놈(decodeGenomeFields)은 두 가지를 보장한다.
//  1. 서로 다른 코드는 반드시 서로 다른 게놈이다(encodeGenomeFields가 정확한 역변환이다).
//  2. 모든 필드의 모든 값이 실제로 나온다. 장르 공간(≈7×10^14)이 필드 전체의 곱보다 작아서
//     그냥 혼합 기수로 풀면 뒤쪽 필드가 항상 0이 된다(v2 시절 length·bassShape·drumVariant가
//     전부 0이던 버그). 그래서 공간 안에 다 들어가는 앞쪽 필드(prefix)는 그대로 풀고 — 이
//     필드들은 모든 조합이 다 나온다 — 나머지 필드는 남은 몫 q의 자릿수에 prefix 번호로 만든
//     오프셋을 더한다. q=0인 코드만 봐도 오프셋이 모든 값을 한 번씩 훑는다.

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

// §8.2: 게놈 길이 필드(기수 13)가 고르는 목표 길이. 150, 155, …, 210초.
export const LENGTH_FIELD_RADIX = 13;
export const TARGET_LENGTHS_SECONDS: readonly number[] = Array.from(
  { length: LENGTH_FIELD_RADIX },
  (_, i) => 150 + 5 * i
);

export function targetSecondsFor(genome: Pick<Genome, "length">): number {
  return TARGET_LENGTHS_SECONDS[genome.length];
}

// ---------------------------------------------------------------- 스타일 게놈 (§5.4, §13.3)
//
// k/d/p/f 장르의 게놈. 필드 이름·개수·기수는 스타일마다 다르다(§5.4 표). 각 스타일은
// "그 스타일의 모든 블루프린트에서 들리는 차이"를 낼 수 있게 필드를 골랐다(R6).

export type StyleField =
  | "form"
  | "length"
  | "key"
  | "mode"
  | "prog"
  | "tempo"
  | "bassShape"
  | "drumVariant"
  | "kit"
  | "voice"
  | "sig"
  | "timbre"
  | "tape"
  | "sample"
  | "hook"
  | "chop"
  | "riffRhythm"
  | "riffPitch";

// 필드 순서 = 분해 순서(중요한 것 먼저). 장르 공간에 다 들어가는 앞쪽 필드는 모든 조합이
// 다 나온다 — 지금은 멜로디 세부(riffRhythm, riffPitch) 앞까지 전부 들어간다.
export const STYLE_GENOME_SPECS: Record<StyleLetter, readonly (readonly [StyleField, number])[]> = {
  k: [
    ["form", 12],
    ["length", 13],
    ["key", 12],
    ["mode", 4],
    ["tempo", 16],
    ["bassShape", 64],
    ["drumVariant", 256],
    ["kit", 36],
    ["voice", 8],
    ["sig", 6],
    ["timbre", 64],
    ["riffRhythm", 4096],
    ["riffPitch", 390625],
  ],
  d: [
    ["form", 12],
    ["length", 7],
    ["key", 12],
    ["mode", 4],
    ["tempo", 16],
    ["bassShape", 64],
    ["drumVariant", 256],
    ["kit", 384],
    ["tape", 16],
    ["sample", 32],
    ["riffRhythm", 4096],
    ["riffPitch", 390625],
  ],
  p: [
    ["form", 12],
    ["length", 13],
    ["key", 12],
    ["prog", 8],
    ["tempo", 16],
    ["bassShape", 64],
    ["drumVariant", 256],
    ["kit", 384],
    ["hook", 256],
    ["riffRhythm", 4096],
    ["riffPitch", 390625],
  ],
  f: [
    ["form", 12],
    ["length", 13],
    ["key", 12],
    ["prog", 8],
    ["tempo", 16],
    ["bassShape", 64],
    ["drumVariant", 256],
    ["kit", 384],
    ["chop", 256],
    ["riffRhythm", 4096],
    ["riffPitch", 390625],
  ],
};

/** 테크노(open, legacy 블루프린트 3종). 이 장르가 실제로 쓰는 건 blueprint·length·drumVariant와
 *  게놈 밖 seedHash 난수(템포, 스케일, 보이스, 베이스·리드)지만, 필드를 줄이면 서로 다른 코드가
 *  같은 게놈이 될 수 있어서 v2 필드를 그대로 둔다. */
const OPEN_GENOME_SPEC: readonly (readonly [keyof Genome, number])[] = [
  ["blueprint", 3],
  ["length", 13],
  ["key", 12],
  ["mode", 4],
  ["tempo", 16],
  ["bassShape", 64],
  ["drumVariant", 256],
  ["riffRhythm", 4096],
  ["riffPitch", 390625],
];

export type GenomeSpec = readonly (readonly [string, number])[];

export const GENRE_SPECS: Record<SeedFamily, GenomeSpec> = { open: OPEN_GENOME_SPEC, ...STYLE_GENOME_SPECS };

// 오프셋 배수. 모든 기수의 소인수(2, 3, 5, 7, 13)보다 큰 소수라 어떤 기수와도 서로소다 —
// a가 기수 하나 이상의 연속 구간을 돌면 (a × OFFSET) mod r이 0..r-1을 전부 한 번씩 낸다.
const OFFSET = 1000003n;

/** 앞쪽 몇 개 필드까지 공간 안에 다 들어가는지와 그 곱. */
export function genomePrefix(space: bigint, spec: GenomeSpec): { count: number; product: bigint } {
  let count = 0;
  let product = 1n;
  while (count < spec.length && product * BigInt(spec[count][1]) <= space) product *= BigInt(spec[count++][1]);
  return { count, product };
}

/** 0 ≤ p < space인 (순열 후) 번호를 필드 값으로 푼다. 위 머리말의 두 보장을 참고. */
export function decodeGenomeFields(p: bigint, space: bigint, spec: GenomeSpec): Record<string, number> {
  const { count, product } = genomePrefix(space, spec);
  const values: Record<string, number> = {};
  let a = p % product;
  let q = p / product;
  const offsetBase = a * OFFSET;
  spec.forEach(([field, radix], i) => {
    const r = BigInt(radix);
    if (i < count) {
      values[field] = Number(a % r);
      a /= r;
    } else {
      values[field] = Number((q % r + offsetBase) % r);
      q /= r;
    }
  });
  return values;
}

/** decodeGenomeFields의 역변환. 서로 다른 코드가 서로 다른 게놈이 된다는 증거이자 테스트용. */
export function encodeGenomeFields(values: Record<string, number>, space: bigint, spec: GenomeSpec): bigint {
  const { count, product } = genomePrefix(space, spec);
  let a = 0n;
  for (let i = count - 1; i >= 0; i--) a = a * BigInt(spec[i][1]) + BigInt(values[spec[i][0]] ?? 0);
  const offsetBase = a * OFFSET;
  let q = 0n;
  for (let i = spec.length - 1; i >= count; i--) {
    const r = BigInt(spec[i][1]);
    const digit = (((BigInt(values[spec[i][0]] ?? 0) - offsetBase) % r) + r) % r;
    q = q * r + digit;
  }
  return q * product + a;
}

export type StyleGenome = { style: StyleLetter } & Partial<Record<StyleField, number>>;

/** §8.2와 같은 공식(150 + 5×length). d는 length 기수가 7이라 150~180초, 나머지는
 *  13이라 150~210초 — 공식 자체는 같고 범위만 기수를 따라 달라진다. */
export function targetSecondsForStyle(g: Pick<StyleGenome, "length">): number {
  return 150 + 5 * (g.length ?? 0);
}

/**
 * k(Kraftwerk) 스타일 게놈을 v2 motifs.ts/`Genome`이 받는 모양으로 편다. 이름이 같은
 * 필드는 그대로 옮기고 form만 blueprint로 이름을 바꾼다 — k의 form은 0~11 범위라
 * `blueprintIdFor`의 compute(0–5)/metropolis(6–11) 판정과 그대로 맞아떨어진다(단,
 * 실제 블루프린트 선택은 pattern.ts가 `blueprintFor`로 하지 별도로 이 값을
 * blueprintIdFor에 다시 넣지 않는다 — 이 함수는 computeScale/computeRiff/computeBass 같은
 * 기존 v2 함수를 k 곡에도 그대로 재사용하기 위한 어댑터일 뿐이다). k 게놈에만 있는
 * kit/voice/sig/timbre는 Genome에 없는 필드라 여기서 버려진다 — 그 값들은
 * `Pattern.styleGenome`에서 따로 읽는다.
 */
export function kToV2Genome(g: StyleGenome): Genome {
  return {
    blueprint: g.form ?? 0,
    length: g.length ?? 0,
    key: g.key ?? 0,
    mode: g.mode ?? 0,
    tempo: g.tempo ?? 0,
    bassShape: g.bassShape ?? 0,
    drumVariant: g.drumVariant ?? 0,
    riffRhythm: g.riffRhythm ?? 0,
    riffPitch: g.riffPitch ?? 0,
  };
}

export type SeedGenomeResult =
  | { family: "open"; code: string; genome: Genome; n: bigint; seedHash: number }
  | { family: StyleLetter; code: string; styleGenome: StyleGenome; n: bigint; seedHash: number };

/**
 * 시드 문자열 하나를 완전히 풀어낸다: 정규 코드가 아니면 해시해서 만들고(parseSeed),
 * 장르 안 번호를 Feistel로 섞은 뒤(P) 게놈 필드로 푼다. seedHash(게놈 밖 난수의 씨앗)는
 * 섞은 뒤 값 P에서 뽑는다 — 섞기 전 번호를 쓰면 "…000" 같은 코드의 난수가 전부 뻔해진다.
 */
export function seedToGenome(input: string): SeedGenomeResult {
  const { family, code, n } = parseSeed(input);
  const space = familySpace(family);
  const p = familyFeistel(family, n);
  const values = decodeGenomeFields(p, space, GENRE_SPECS[family]);
  const seedHash = Number(p % 2n ** 32n);
  if (family === "open") return { family, code, genome: values as unknown as Genome, n: p, seedHash };
  return { family, code, styleGenome: { style: family, ...values }, n: p, seedHash };
}
