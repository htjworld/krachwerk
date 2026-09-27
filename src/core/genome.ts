import { canonicalize, decodeCode, feistel, parseSeed, styleFeistel, type StyleLetter } from "./seedCode";

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

// ---------------------------------------------------------------- 스타일 게놈 (§5.4, §13.3)
//
// 얼굴 버튼(k/d/p/f)이 만드는 16자 코드의 게놈. 기본 게놈(위)과 같은 원리(혼합 기수 분해)를
// BigInt로 확장한 것 — 필드 이름·개수·기수는 스타일마다 다르다(§5.4 표). 각 스타일은
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

// 필드 순서 = 분해 순서(중요한 것 먼저). §5.2 조건 ①(곱 ≥ 36^15)·②(마지막 필드 뺀 곱 ≤
// 36^15)를 4스타일 모두 만족한다 — 테스트(STYLE_RADIX_PRODUCT)로 강제한다.
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

/** 테스트용(§5.2 조건 검증): 스타일마다 기수의 곱. STYLE_CODE_SPACE(36^15)보다 커야
 *  유일성이 성립하고(조건①), 마지막 필드를 뺀 곱은 그 이하여야 앞 필드들이 전 범위를
 *  쓴다(조건②, genome.test.ts가 확인한다). */
export const STYLE_RADIX_PRODUCT: Record<StyleLetter, bigint> = Object.fromEntries(
  (Object.keys(STYLE_GENOME_SPECS) as StyleLetter[]).map((style) => [
    style,
    STYLE_GENOME_SPECS[style].reduce((acc, [, radix]) => acc * BigInt(radix), 1n),
  ])
) as Record<StyleLetter, bigint>;

export type StyleGenome = { style: StyleLetter } & Partial<Record<StyleField, number>>;

/** 혼합 기수 분해(BigInt판): 낮은 자리(첫 필드)부터 나머지를 뽑는다. p < STYLE_CODE_SPACE ≤
 *  기수의 곱이므로 마지막 필드의 몫도 항상 기수 안에 들어온다 — 버릴 게 없다. */
export function styleIndexToGenome(style: StyleLetter, p: bigint): StyleGenome {
  let remaining = p;
  const values: Partial<Record<StyleField, number>> = {};
  for (const [field, radix] of STYLE_GENOME_SPECS[style]) {
    const r = BigInt(radix);
    values[field] = Number(remaining % r);
    remaining /= r;
  }
  return { style, ...values };
}

/** 역변환: 마지막 필드부터 되짚어 올라간다. 없는 필드(다른 스타일 값 섞어 쓴 경우 등)는 0. */
export function styleGenomeToIndex(g: StyleGenome): bigint {
  const spec = STYLE_GENOME_SPECS[g.style];
  let p = 0n;
  for (let i = spec.length - 1; i >= 0; i--) {
    const [field, radix] = spec[i];
    p = p * BigInt(radix) + BigInt(g[field] ?? 0);
  }
  return p;
}

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
  | { family: "open"; code: string; genome: Genome; n: number; seedHash: number }
  | { family: StyleLetter; code: string; styleGenome: StyleGenome; n: bigint; seedHash: number };

/**
 * §5.1·§5.3: 시드 문자열 하나를 (스타일 코드인지 기본 코드인지 자유 텍스트인지 가려서)
 * 완전히 풀어낸다. open 경로는 기존 genomeFromCode를 그대로 불러써서 §12 단계 0
 * 스냅샷과 한 글자도 다르지 않게 한다. 스타일 경로의 seedHash는 기본 코드 관례
 * (genomeFromCode의 `n`이 이미 Feistel을 거친 값인 것)와 맞춰 **순열 후** 값 P에서
 * 뽑는다 — 순열 전 N을 쓰면 "0...0" 같은 코드의 게놈 밖 난수가 전부 뻔해진다.
 */
export function seedToGenome(input: string): SeedGenomeResult {
  const parsed = parseSeed(input);
  if (parsed.family === "open") {
    const { code, genome, n } = genomeFromCode(parsed.code);
    return { family: "open", code, genome, n, seedHash: n % 2 ** 32 };
  }
  const p = styleFeistel(parsed.family, parsed.n);
  const styleGenome = styleIndexToGenome(parsed.family, p);
  const seedHash = Number(p % 2n ** 32n);
  return { family: parsed.family, code: parsed.code, styleGenome, n: p, seedHash };
}
