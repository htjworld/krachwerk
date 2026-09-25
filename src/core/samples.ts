// public/samples 아래에 넣어둔 CC0 원샷들. 출처와 라이선스는 public/samples/CREDITS.txt 참고.
// 신스로는 안 나오는 질감(808 아날로그 드럼, 모루/브레이크 드럼 같은 금속 타격음)을
// 여기서 가져온다.

const SAMPLE_FILES = {
  kickTight: "808/kick-tight.wav",
  kickMid: "808/kick-mid.wav",
  kickLong: "808/kick-long.wav",
  snare: "808/snare.wav",
  snareTight: "808/snare-tight.wav",
  clap: "808/clap.wav",
  hatClosed: "808/hat-closed.wav",
  hatOpen: "808/hat-open.wav",
  hatOpenLong: "808/hat-open-long.wav",
  rim: "808/rim.wav",
  clave: "808/clave.wav",
  cowbell: "808/cowbell.wav",
  maraca: "808/maraca.wav",
  tomLow: "808/tom-low.wav",
  tomMid: "808/tom-mid.wav",
  tomHigh: "808/tom-high.wav",
  congaHigh: "808/conga-high.wav",
  cymbal: "808/cymbal.wav",
  anvil1: "metal/anvil-1.wav",
  anvil2: "metal/anvil-2.wav",
  brake1: "metal/brake-1.wav",
  brake2: "metal/brake-2.wav",
  logLow: "metal/logdrum-lo.wav",
  logHigh: "metal/logdrum-hi.wav",
  slapstick: "metal/slapstick.wav",
  ratchet: "metal/ratchet.wav",
  agogoHigh: "metal/agogo-hi.wav",
  agogoLow: "metal/agogo-lo.wav",
} as const;

export type SampleId = keyof typeof SAMPLE_FILES;
export type SampleBank = Record<SampleId, AudioBuffer>;

export const SAMPLE_IDS = Object.keys(SAMPLE_FILES) as SampleId[];

function sampleUrl(file: string): string {
  const base = import.meta.env?.BASE_URL ?? "/";
  return `${base}samples/${file}`;
}

// 디코딩 결과는 컨텍스트가 아니라 샘플레이트에만 묶인다. 출력 장치에 따라 렌더링
// 샘플레이트가 달라지므로(44.1k / 48k) 레이트별로 캐시한다.
const banks = new Map<number, Promise<SampleBank>>();

export function loadSampleBank(ctx: BaseAudioContext): Promise<SampleBank> {
  const rate = ctx.sampleRate;
  let bank = banks.get(rate);
  if (!bank) {
    bank = Promise.all(
      SAMPLE_IDS.map(async (id) => {
        const response = await fetch(sampleUrl(SAMPLE_FILES[id]));
        if (!response.ok) throw new Error(`sample ${id} failed: ${response.status}`);
        return [id, await ctx.decodeAudioData(await response.arrayBuffer())] as const;
      })
    )
      .then((entries) => Object.fromEntries(entries) as SampleBank)
      .catch((error) => {
        banks.delete(rate); // 네트워크 실패는 캐시하지 않는다.
        throw error;
      });
    banks.set(rate, bank);
  }
  return bank;
}
