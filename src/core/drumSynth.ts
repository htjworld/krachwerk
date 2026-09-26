// 합성 드럼 원샷(§14.2 K, §7.4, §15.3): io-808 발상 킥/스네어/햇/클랩을 렌더 시작 때
// OfflineAudioContext로 한 번 만들어 AudioBuffer로 굳힌다 — 노트마다 노드를 만들지
// 않는다(§1.4 성능 규칙). compute→"circuit", metropolis→"skyline" 킷. §15.3의 "파라미터
// 5개를 hashRand로 ±15% 흔든다"를 mulberry32로 구현한다(호출 순서 무관, 시드당 한 번뿐이라
// 부담 없다).
import { mulberry32 } from "./prng";

export type SynthKitId = "circuit" | "skyline";

export interface SynthKit {
  kick: AudioBuffer;
  snare: AudioBuffer;
  hat: AudioBuffer;
  clap: AudioBuffer;
}

interface KitParams {
  kickStartFreq: number;
  kickDecayMs: number;
  hatBandpass: number;
  hatHighpass: number;
  snareNoiseDecayMs: number;
  clapBandpass: number;
  clapBurstGapMs: number;
  clapTailMs: number;
}

// §14.2 K 표. compute 킥 95ms/스네어 노이즈 75ms(기본)/클랩 1.6kHz·25ms.
// metropolis 킥 46ms/스네어 노이즈 180ms/햇 어둡게(밴드패스 6kHz+하이패스 4kHz).
const BASE_PARAMS: Record<SynthKitId, KitParams> = {
  circuit: {
    kickStartFreq: 98,
    kickDecayMs: 95,
    hatBandpass: 12000,
    hatHighpass: 8000,
    snareNoiseDecayMs: 75,
    clapBandpass: 1600,
    clapBurstGapMs: 10,
    clapTailMs: 25,
  },
  skyline: {
    kickStartFreq: 98,
    kickDecayMs: 46,
    hatBandpass: 6000,
    hatHighpass: 4000,
    snareNoiseDecayMs: 180,
    clapBandpass: 1000,
    clapBurstGapMs: 10,
    clapTailMs: 115,
  },
};

// ±15% 흔들림(§15.3). 다섯 자리만: 킥 시작 주파수·감쇠, 햇 밴드패스, 스네어 노이즈 감쇠,
// 클랩 버스트 간격.
function jitterParams(base: KitParams, rng: () => number): KitParams {
  const j = (v: number) => v * (0.85 + rng() * 0.3);
  return {
    ...base,
    kickStartFreq: j(base.kickStartFreq),
    kickDecayMs: j(base.kickDecayMs),
    hatBandpass: j(base.hatBandpass),
    snareNoiseDecayMs: j(base.snareNoiseDecayMs),
    clapBurstGapMs: j(base.clapBurstGapMs),
  };
}

function makeNoiseBuffer(ctx: OfflineAudioContext, seed: number, seconds: number): AudioBuffer {
  const length = Math.ceil(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const rng = mulberry32(seed);
  for (let i = 0; i < length; i++) data[i] = rng() * 2 - 1;
  return buffer;
}

async function renderKick(sampleRate: number, p: KitParams): Promise<AudioBuffer> {
  const decay = p.kickDecayMs / 1000;
  const ctx = new OfflineAudioContext(1, Math.ceil(sampleRate * (decay * 2 + 0.05)), sampleRate);

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(p.kickStartFreq, 0);
  osc.frequency.exponentialRampToValueAtTime(48, decay);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(2200, 0);
  filter.frequency.exponentialRampToValueAtTime(200, decay);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.9, 0);
  gain.gain.exponentialRampToValueAtTime(0.001, decay * 1.6);

  osc.connect(filter);
  filter.connect(gain);

  // 클릭 펄스: 아주 짧은 어택 임펄스 하나로 딱딱함을 더한다.
  const click = ctx.createOscillator();
  click.type = "square";
  click.frequency.value = 1200;
  const clickGain = ctx.createGain();
  clickGain.gain.setValueAtTime(0.3, 0);
  clickGain.gain.exponentialRampToValueAtTime(0.001, 0.008);
  click.connect(clickGain);
  clickGain.connect(gain);

  gain.connect(ctx.destination);
  osc.start(0);
  osc.stop(decay * 2);
  click.start(0);
  click.stop(0.01);

  return ctx.startRendering();
}

async function renderSnare(sampleRate: number, p: KitParams): Promise<AudioBuffer> {
  const decay = p.snareNoiseDecayMs / 1000;
  const seconds = decay + 0.05;
  const ctx = new OfflineAudioContext(1, Math.ceil(sampleRate * seconds), sampleRate);

  const toneGain = ctx.createGain();
  toneGain.gain.setValueAtTime(0.5, 0);
  toneGain.gain.exponentialRampToValueAtTime(0.001, 0.05);
  for (const freq of [238, 476]) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    osc.connect(toneGain);
    osc.start(0);
    osc.stop(0.05);
  }
  toneGain.connect(ctx.destination);

  const noise = ctx.createBufferSource();
  noise.buffer = makeNoiseBuffer(ctx, 0x5a17e0, seconds);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.setValueAtTime(800, 0);
  hp.frequency.exponentialRampToValueAtTime(1800, Math.min(0.02, decay));
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.7, 0);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, decay);
  noise.connect(hp);
  hp.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noise.start(0);
  noise.stop(decay);

  return ctx.startRendering();
}

async function renderHat(sampleRate: number, p: KitParams): Promise<AudioBuffer> {
  const seconds = 0.08;
  const ctx = new OfflineAudioContext(1, Math.ceil(sampleRate * seconds), sampleRate);

  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = p.hatBandpass;
  bp.Q.value = 1.2;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = p.hatHighpass;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.4, 0);
  gain.gain.exponentialRampToValueAtTime(0.001, 0.05);

  bp.connect(hp);
  hp.connect(gain);
  gain.connect(ctx.destination);

  for (const freq of [263, 400, 421, 474, 587, 845]) {
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = freq;
    osc.connect(bp);
    osc.start(0);
    osc.stop(0.05);
  }

  return ctx.startRendering();
}

async function renderClap(sampleRate: number, p: KitParams): Promise<AudioBuffer> {
  const gapSec = p.clapBurstGapMs / 1000;
  const tailSec = p.clapTailMs / 1000;
  const seconds = 4 * gapSec + tailSec + 0.02;
  const ctx = new OfflineAudioContext(1, Math.ceil(sampleRate * seconds), sampleRate);

  const noiseBuffer = makeNoiseBuffer(ctx, 0x63a9a3, seconds);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = p.clapBandpass;
  bp.Q.value = 2;
  const gain = ctx.createGain();
  bp.connect(gain);
  gain.connect(ctx.destination);

  for (let burst = 0; burst < 4; burst++) {
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.connect(bp);
    const start = burst * gapSec;
    source.start(start);
    source.stop(start + gapSec * 0.9);
  }
  const tailStart = 4 * gapSec;
  gain.gain.setValueAtTime(0.6, tailStart);
  gain.gain.exponentialRampToValueAtTime(0.001, tailStart + tailSec);

  return ctx.startRendering();
}

const cache = new Map<string, Promise<SynthKit>>();

/** compute("circuit")/metropolis("skyline")의 합성 드럼 킷. 곡(시드)마다 파라미터가
 *  ±15% 흔들리므로 캐시 키에 흔들린 값까지 넣는다(§15.3). */
export function loadSynthKit(sampleRate: number, kitId: SynthKitId, seedHash: number): Promise<SynthKit> {
  const rng = mulberry32((seedHash ^ 0x05117a17) >>> 0);
  const params = jitterParams(BASE_PARAMS[kitId], rng);
  const key = `${sampleRate}:${kitId}:${JSON.stringify(params)}`;
  let kit = cache.get(key);
  if (!kit) {
    kit = Promise.all([
      renderKick(sampleRate, params),
      renderSnare(sampleRate, params),
      renderHat(sampleRate, params),
      renderClap(sampleRate, params),
    ]).then(([kick, snare, hat, clap]) => ({ kick, snare, hat, clap }));
    cache.set(key, kit);
  }
  return kit;
}
