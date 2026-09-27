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

// ---------------------------------------------------------------- 260927 §7.2: 스타일 킷

// 게놈 kit이 고르는 원샷(§13.1 drumSynth.ts 확장). tape(d)/house(p)/garage(f)는 곡마다
// 결정론적인 프리셋 인덱스(§7.2 표)를 그대로 쓴다 — v2 circuit/skyline과 달리 해시 흔들림이
// 없다(게놈 자체가 이미 다양성의 원천이라서다). 반환 키 이름이 audioEngine.ts의 DrumRole과
// 겹치지만(kick/clap/hat) import 순환을 피하려고 여기선 독립된 타입으로 둔다 — 나중에
// 그대로 Rig.styleKit에 얹으면 된다(§11 단계 8~10).
export type StyleFamily = "tape" | "house" | "garage";
export type StyleDrumSlot = "kick" | "clap" | "hat";
export type StyleKit = Record<StyleDrumSlot, AudioBuffer>;

interface KickPreset {
  startHz: number;
  bodyHz: number;
  pitchDecayMs: number;
  ampDecayMs: number; // 측정 기준: −20dB 지점
  click: number; // 0~1
  drive: number;
  lowpassHz: number;
}

type SnarePreset =
  | { kind: "toneNoise"; toneHz: number; noiseFilter: "bandpass" | "highpass"; noiseHz: number; decayMs: number }
  | { kind: "rim"; toneHz: number; decayMs: number }
  | { kind: "clap"; bandHz: number; decayMs: number; bursts: number; gapMs?: number }
  | { kind: "clapDual"; bandHzA: number; bandHzB: number; bursts: number; gapMs: number; decayMs: number }
  | { kind: "noiseLP"; lpHz: number; decayMs: number }
  | { kind: "snap"; toneHz: number; decayMs: number }
  | { kind: "overlap"; a: SnarePreset; b: SnarePreset; mix: number };

type HatPreset =
  | { kind: "noiseHP"; hpHz: number; decayMs: number }
  | { kind: "noiseBP"; bpHz: number; decayMs: number }
  | { kind: "squares"; bpHz: number; hpHz?: number; decayMs: number }
  | { kind: "shaker"; bpHz: number; decayMs: number; attackMs?: number }
  | { kind: "tambourine"; bpHz: number; decayMs: number; bursts: number };

// 완만한 tanh 드라이브. audioEngine.ts의 makeSaturationCurve와 같은 발상이지만, drumSynth.ts는
// audioEngine.ts를 참조하면 순환 임포트가 생겨서 따로 둔다(작은 순수 함수라 중복 비용이 싸다).
function driveCurve(drive: number): Float32Array<ArrayBuffer> {
  const n = 512;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
  }
  return curve;
}

function makeStyleNoiseBuffer(ctx: OfflineAudioContext, seed: number, seconds: number): AudioBuffer {
  const length = Math.ceil(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const rng = mulberry32(seed);
  for (let i = 0; i < length; i++) data[i] = rng() * 2 - 1;
  return buffer;
}

// 버퍼 여러 개를 그대로 더한다(§6.1 드럼 JS 믹싱과 같은 발상) — overlap(클랩+스네어 겹침)
// 하나만 쓴다. 길이가 다르면 짧은 쪽 이후는 0으로 취급한다.
function mixBuffers(ctx: OfflineAudioContext, parts: { buffer: AudioBuffer; gain: number }[]): AudioBuffer {
  const length = Math.max(...parts.map((p) => p.buffer.length));
  const out = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = out.getChannelData(0);
  for (const { buffer, gain } of parts) {
    const src = buffer.getChannelData(0);
    for (let i = 0; i < src.length; i++) data[i] += src[i] * gain;
  }
  return out;
}

/** §7.2 킥 표를 그대로 합성한다: 시작Hz→본체Hz(피치하강ms), −20dB감쇠ms, 클릭, 드라이브,
 *  로우패스. v2 renderKick과 달리 피치 하강과 진폭 감쇠 시간을 따로 둔다(원곡 실측이 둘을
 *  다르게 쟀다 — 예: tape #0은 피치 60ms인데 몸통은 380ms까지 운다). */
async function renderStyleKick(sampleRate: number, p: KickPreset): Promise<AudioBuffer> {
  const pitchDecay = p.pitchDecayMs / 1000;
  const ampDecay = p.ampDecayMs / 1000;
  const tail = ampDecay * 1.8 + 0.05;
  const ctx = new OfflineAudioContext(1, Math.ceil(sampleRate * tail), sampleRate);

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(p.startHz, 0);
  osc.frequency.exponentialRampToValueAtTime(p.bodyHz, pitchDecay);

  const drive = ctx.createWaveShaper();
  drive.curve = driveCurve(p.drive);

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = p.lowpassHz;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.95, 0);
  gain.gain.exponentialRampToValueAtTime(0.1, ampDecay); // 측정 기준점(−20dB)
  gain.gain.exponentialRampToValueAtTime(0.001, ampDecay * 1.8);

  osc.connect(drive);
  drive.connect(lowpass);
  lowpass.connect(gain);

  if (p.click > 0) {
    const click = ctx.createOscillator();
    click.type = "square";
    click.frequency.value = 1200;
    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(p.click, 0);
    clickGain.gain.exponentialRampToValueAtTime(0.001, 0.008);
    click.connect(clickGain);
    clickGain.connect(gain);
    click.start(0);
    click.stop(0.01);
  }

  gain.connect(ctx.destination);
  osc.start(0);
  osc.stop(tail);

  return ctx.startRendering();
}

async function renderNoiseTransient(
  sampleRate: number,
  filterType: "bandpass" | "highpass",
  freq: number,
  decayMs: number,
  attackMs = 0
): Promise<AudioBuffer> {
  const decay = decayMs / 1000;
  const seconds = decay + attackMs / 1000 + 0.02;
  const ctx = new OfflineAudioContext(1, Math.ceil(sampleRate * seconds), sampleRate);

  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = freq;
  filter.Q.value = filterType === "bandpass" ? 1.4 : 0.7;

  const gain = ctx.createGain();
  if (attackMs > 0) {
    gain.gain.setValueAtTime(0, 0);
    gain.gain.linearRampToValueAtTime(0.6, attackMs / 1000);
  } else {
    gain.gain.setValueAtTime(0.6, 0);
  }
  gain.gain.exponentialRampToValueAtTime(0.001, attackMs / 1000 + decay);

  const noise = ctx.createBufferSource();
  noise.buffer = makeStyleNoiseBuffer(ctx, 0x7a17e0 ^ Math.round(freq), seconds);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  noise.start(0);
  noise.stop(seconds);

  return ctx.startRendering();
}

async function renderBurstNoise(
  sampleRate: number,
  bandHz: number,
  bursts: number,
  gapMs: number,
  tailMs: number
): Promise<AudioBuffer> {
  const gapSec = gapMs / 1000;
  const tailSec = tailMs / 1000;
  const seconds = bursts * gapSec + tailSec + 0.02;
  const ctx = new OfflineAudioContext(1, Math.ceil(sampleRate * seconds), sampleRate);

  const noiseBuffer = makeStyleNoiseBuffer(ctx, 0x63a9a3 ^ Math.round(bandHz), seconds);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = bandHz;
  bp.Q.value = 2;
  const gain = ctx.createGain();
  bp.connect(gain);
  gain.connect(ctx.destination);

  for (let burst = 0; burst < bursts; burst++) {
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.connect(bp);
    const start = burst * gapSec;
    source.start(start);
    source.stop(start + gapSec * 0.9);
  }
  const tailStart = bursts * gapSec;
  gain.gain.setValueAtTime(0.6, tailStart);
  gain.gain.exponentialRampToValueAtTime(0.001, tailStart + tailSec);

  return ctx.startRendering();
}

async function renderTonePercussive(sampleRate: number, toneHz: number, decayMs: number): Promise<AudioBuffer> {
  const decay = decayMs / 1000;
  const ctx = new OfflineAudioContext(1, Math.ceil(sampleRate * (decay + 0.02)), sampleRate);
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = toneHz;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.7, 0);
  gain.gain.exponentialRampToValueAtTime(0.001, decay);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(0);
  osc.stop(decay);
  return ctx.startRendering();
}

async function renderRim(sampleRate: number, toneHz: number, decayMs: number): Promise<AudioBuffer> {
  const [tone, click] = await Promise.all([
    renderTonePercussive(sampleRate, toneHz, decayMs),
    renderTonePercussive(sampleRate, 1800, 8),
  ]);
  const ctx = new OfflineAudioContext(1, Math.max(tone.length, click.length), sampleRate);
  return mixBuffers(ctx, [
    { buffer: tone, gain: 0.8 },
    { buffer: click, gain: 0.5 },
  ]);
}

async function renderSquares(sampleRate: number, bpHz: number, hpHz: number | undefined, decayMs: number): Promise<AudioBuffer> {
  const decay = decayMs / 1000;
  const seconds = decay + 0.03;
  const ctx = new OfflineAudioContext(1, Math.ceil(sampleRate * seconds), sampleRate);

  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = bpHz;
  bp.Q.value = 1.2;
  let last: AudioNode = bp;
  if (hpHz !== undefined) {
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = hpHz;
    bp.connect(hp);
    last = hp;
  }
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.4, 0);
  gain.gain.exponentialRampToValueAtTime(0.001, decay);
  last.connect(gain);
  gain.connect(ctx.destination);

  for (const freq of [263, 400, 421, 474, 587, 845]) {
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = freq;
    osc.connect(bp);
    osc.start(0);
    osc.stop(seconds);
  }

  return ctx.startRendering();
}

async function renderSnarePreset(sampleRate: number, p: SnarePreset): Promise<AudioBuffer> {
  switch (p.kind) {
    case "toneNoise": {
      const [tone, noise] = await Promise.all([
        renderTonePercussive(sampleRate, p.toneHz, Math.min(60, p.decayMs)),
        renderNoiseTransient(sampleRate, p.noiseFilter, p.noiseHz, p.decayMs),
      ]);
      const ctx = new OfflineAudioContext(1, Math.max(tone.length, noise.length), sampleRate);
      return mixBuffers(ctx, [
        { buffer: tone, gain: 0.5 },
        { buffer: noise, gain: 0.8 },
      ]);
    }
    case "rim":
      return renderRim(sampleRate, p.toneHz, p.decayMs);
    case "clap":
      return renderBurstNoise(sampleRate, p.bandHz, p.bursts, p.gapMs ?? 10, p.decayMs);
    case "clapDual": {
      const [a, b] = await Promise.all([
        renderBurstNoise(sampleRate, p.bandHzA, p.bursts, p.gapMs, p.decayMs),
        renderBurstNoise(sampleRate, p.bandHzB, p.bursts, p.gapMs, p.decayMs),
      ]);
      const ctx = new OfflineAudioContext(1, Math.max(a.length, b.length), sampleRate);
      return mixBuffers(ctx, [
        { buffer: a, gain: 0.7 },
        { buffer: b, gain: 0.7 },
      ]);
    }
    case "noiseLP":
      return renderNoiseLowpass(sampleRate, p.lpHz, p.decayMs);
    case "snap":
      return renderTonePercussive(sampleRate, p.toneHz, p.decayMs);
    case "overlap": {
      const [a, b] = await Promise.all([renderSnarePreset(sampleRate, p.a), renderSnarePreset(sampleRate, p.b)]);
      const ctx = new OfflineAudioContext(1, Math.max(a.length, b.length), sampleRate);
      return mixBuffers(ctx, [
        { buffer: a, gain: 1 },
        { buffer: b, gain: p.mix },
      ]);
    }
  }
}

async function renderNoiseLowpass(sampleRate: number, lpHz: number, decayMs: number): Promise<AudioBuffer> {
  const decay = decayMs / 1000;
  const seconds = decay + 0.02;
  const ctx = new OfflineAudioContext(1, Math.ceil(sampleRate * seconds), sampleRate);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = lpHz;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.5, 0);
  gain.gain.exponentialRampToValueAtTime(0.001, decay);
  const noise = ctx.createBufferSource();
  noise.buffer = makeStyleNoiseBuffer(ctx, 0x1401d, seconds);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  noise.start(0);
  noise.stop(seconds);
  return ctx.startRendering();
}

async function renderHatPreset(sampleRate: number, p: HatPreset): Promise<AudioBuffer> {
  switch (p.kind) {
    case "noiseHP":
      return renderNoiseTransient(sampleRate, "highpass", p.hpHz, p.decayMs);
    case "noiseBP":
      return renderNoiseTransient(sampleRate, "bandpass", p.bpHz, p.decayMs);
    case "shaker":
      return renderNoiseTransient(sampleRate, "bandpass", p.bpHz, p.decayMs, p.attackMs ?? 5);
    case "squares":
      return renderSquares(sampleRate, p.bpHz, p.hpHz, p.decayMs);
    case "tambourine":
      return renderBurstNoise(sampleRate, p.bpHz, p.bursts, 12, p.decayMs);
  }
}

// §7.2 표. 인덱스 = 게놈 kit에서 뽑은 자리(킥 kit%8, 스네어/클랩 ⌊kit/8⌋%8, 햇 ⌊kit/64⌋).
// 괄호 없는 6·7번 킥/스네어는 "샘플 슬롯"(§8) 자리라 파일이 오기 전까지 이 값을 그대로 쓴다.
export const KICKS: Record<StyleFamily, readonly KickPreset[]> = {
  tape: [
    { startHz: 110, bodyHz: 47, pitchDecayMs: 60, ampDecayMs: 380, click: 0.1, drive: 1.5, lowpassHz: 2000 },
    { startHz: 130, bodyHz: 67, pitchDecayMs: 45, ampDecayMs: 196, click: 0.2, drive: 1.4, lowpassHz: 2500 },
    { startHz: 140, bodyHz: 73, pitchDecayMs: 35, ampDecayMs: 91, click: 0.25, drive: 1.3, lowpassHz: 3000 },
    { startHz: 150, bodyHz: 80, pitchDecayMs: 40, ampDecayMs: 152, click: 0.3, drive: 1.4, lowpassHz: 3000 },
    { startHz: 220, bodyHz: 140, pitchDecayMs: 20, ampDecayMs: 64, click: 0.05, drive: 1.8, lowpassHz: 1200 },
    { startHz: 160, bodyHz: 58, pitchDecayMs: 35, ampDecayMs: 120, click: 0.35, drive: 1.2, lowpassHz: 4000 },
    { startHz: 180, bodyHz: 52, pitchDecayMs: 45, ampDecayMs: 250, click: 0.3, drive: 1.3, lowpassHz: 3500 },
    { startHz: 120, bodyHz: 90, pitchDecayMs: 25, ampDecayMs: 80, click: 0.4, drive: 2.0, lowpassHz: 2500 },
  ],
  house: [
    { startHz: 150, bodyHz: 60, pitchDecayMs: 40, ampDecayMs: 117, click: 0.25, drive: 1.2, lowpassHz: 6000 },
    { startHz: 170, bodyHz: 73, pitchDecayMs: 30, ampDecayMs: 66, click: 0.35, drive: 1.3, lowpassHz: 7000 },
    { startHz: 200, bodyHz: 52, pitchDecayMs: 50, ampDecayMs: 220, click: 0.2, drive: 1.1, lowpassHz: 5000 },
    { startHz: 180, bodyHz: 58, pitchDecayMs: 40, ampDecayMs: 140, click: 0.4, drive: 1.3, lowpassHz: 6000 },
    { startHz: 120, bodyHz: 48, pitchDecayMs: 55, ampDecayMs: 260, click: 0.15, drive: 1.2, lowpassHz: 4000 },
    { startHz: 90, bodyHz: 50, pitchDecayMs: 50, ampDecayMs: 180, click: 0.1, drive: 1.1, lowpassHz: 3000 },
    { startHz: 190, bodyHz: 56, pitchDecayMs: 45, ampDecayMs: 160, click: 0.3, drive: 1.25, lowpassHz: 6500 },
    { startHz: 160, bodyHz: 62, pitchDecayMs: 35, ampDecayMs: 100, click: 0.45, drive: 1.4, lowpassHz: 7000 },
  ],
  garage: [
    { startHz: 160, bodyHz: 60, pitchDecayMs: 35, ampDecayMs: 71, click: 0.3, drive: 1.3, lowpassHz: 6000 },
    { startHz: 120, bodyHz: 47, pitchDecayMs: 50, ampDecayMs: 151, click: 0.2, drive: 1.2, lowpassHz: 5000 },
    { startHz: 70, bodyHz: 53, pitchDecayMs: 60, ampDecayMs: 328, click: 0.05, drive: 1.6, lowpassHz: 2500 },
    { startHz: 180, bodyHz: 55, pitchDecayMs: 40, ampDecayMs: 110, click: 0.4, drive: 1.3, lowpassHz: 6500 },
    { startHz: 110, bodyHz: 50, pitchDecayMs: 50, ampDecayMs: 200, click: 0.15, drive: 1.2, lowpassHz: 4000 },
    { startHz: 200, bodyHz: 65, pitchDecayMs: 25, ampDecayMs: 55, click: 0.5, drive: 1.4, lowpassHz: 8000 },
    { startHz: 150, bodyHz: 57, pitchDecayMs: 40, ampDecayMs: 130, click: 0.3, drive: 1.3, lowpassHz: 6000 },
    { startHz: 140, bodyHz: 52, pitchDecayMs: 45, ampDecayMs: 180, click: 0.25, drive: 1.25, lowpassHz: 5000 },
  ],
};

export const SNARES: Record<StyleFamily, readonly SnarePreset[]> = {
  tape: [
    { kind: "toneNoise", toneHz: 167, noiseFilter: "bandpass", noiseHz: 2000, decayMs: 200 },
    { kind: "toneNoise", toneHz: 207, noiseFilter: "bandpass", noiseHz: 1600, decayMs: 350 },
    { kind: "clap", bandHz: 1800, decayMs: 80, bursts: 3 },
    { kind: "rim", toneHz: 820, decayMs: 30 },
    { kind: "noiseLP", lpHz: 1400, decayMs: 70 },
    { kind: "toneNoise", toneHz: 190, noiseFilter: "highpass", noiseHz: 1500, decayMs: 120 },
    { kind: "clap", bandHz: 1200, decayMs: 150, bursts: 4 },
    { kind: "toneNoise", toneHz: 200, noiseFilter: "bandpass", noiseHz: 2500, decayMs: 150 },
  ],
  house: [
    { kind: "clapDual", bandHzA: 1300, bandHzB: 2600, bursts: 4, gapMs: 10, decayMs: 180 },
    { kind: "toneNoise", toneHz: 230, noiseFilter: "bandpass", noiseHz: 1300, decayMs: 140 },
    { kind: "clap", bandHz: 2000, decayMs: 120, bursts: 4 },
    { kind: "snap", toneHz: 1700, decayMs: 25 },
    {
      kind: "overlap",
      a: { kind: "clapDual", bandHzA: 1300, bandHzB: 2600, bursts: 4, gapMs: 10, decayMs: 180 },
      b: { kind: "toneNoise", toneHz: 230, noiseFilter: "bandpass", noiseHz: 1300, decayMs: 140 },
      mix: 0.6,
    },
    { kind: "clap", bandHz: 1100, decayMs: 90, bursts: 3 },
    { kind: "clap", bandHz: 1500, decayMs: 200, bursts: 5 },
    { kind: "rim", toneHz: 900, decayMs: 35 },
  ],
  garage: [
    { kind: "toneNoise", toneHz: 233, noiseFilter: "bandpass", noiseHz: 2500, decayMs: 56 },
    { kind: "toneNoise", toneHz: 360, noiseFilter: "bandpass", noiseHz: 3000, decayMs: 73 },
    { kind: "clap", bandHz: 4700, decayMs: 20, bursts: 3 },
    { kind: "rim", toneHz: 1100, decayMs: 30 },
    { kind: "clap", bandHz: 3500, decayMs: 25, bursts: 1 }, // "스냅 bp 3500, 25" — 짧은 대역 노이즈 한 번
    { kind: "clap", bandHz: 1800, decayMs: 150, bursts: 4 },
    { kind: "toneNoise", toneHz: 250, noiseFilter: "bandpass", noiseHz: 2200, decayMs: 90 },
    { kind: "clap", bandHz: 2800, decayMs: 60, bursts: 3 },
  ],
};

export const HATS: Record<StyleFamily, readonly HatPreset[]> = {
  tape: [
    { kind: "noiseHP", hpHz: 7000, decayMs: 40 },
    { kind: "squares", bpHz: 5000, decayMs: 60 },
    { kind: "shaker", bpHz: 6500, decayMs: 70, attackMs: 8 },
    { kind: "noiseHP", hpHz: 7000, decayMs: 220 },
    { kind: "squares", bpHz: 8000, hpHz: 6000, decayMs: 45 },
    { kind: "tambourine", bpHz: 9000, decayMs: 90, bursts: 3 },
  ],
  house: [
    { kind: "noiseHP", hpHz: 9000, decayMs: 45 },
    { kind: "noiseBP", bpHz: 7700, decayMs: 166 },
    { kind: "shaker", bpHz: 6200, decayMs: 60 },
    { kind: "squares", bpHz: 10000, hpHz: 8000, decayMs: 50 },
    { kind: "noiseBP", bpHz: 8500, decayMs: 240 },
    { kind: "tambourine", bpHz: 9000, decayMs: 90, bursts: 3 }, // 표에 수치 없음 — tape 탬버린과 같은 값
  ],
  garage: [
    { kind: "noiseBP", bpHz: 6900, decayMs: 120 },
    { kind: "noiseHP", hpHz: 8300, decayMs: 35 },
    { kind: "noiseBP", bpHz: 3400, decayMs: 40 },
    { kind: "noiseBP", bpHz: 5000, decayMs: 60 },
    { kind: "noiseBP", bpHz: 7500, decayMs: 180 },
    { kind: "shaker", bpHz: 7000, decayMs: 55 },
  ],
};

const SUB808: KickPreset = { startHz: 50, bodyHz: 36, pitchDecayMs: 60, ampDecayMs: 330, click: 0.02, drive: 1.8, lowpassHz: 400 };

export function styleKitIndices(kit: number): { kickIdx: number; snareIdx: number; hatIdx: number } {
  return { kickIdx: kit % 8, snareIdx: Math.floor(kit / 8) % 8, hatIdx: Math.floor(kit / 64) % 6 };
}

const styleCache = new Map<string, Promise<StyleKit>>();

/**
 * §7.2: 새 블루프린트(d/p/f)의 합성 드럼 킷. `kit` 게놈 값(0~383)이 결정론적으로 킥·
 * 스네어/클랩·햇 프리셋을 고른다 — v2 circuit/skyline과 달리 해시 흔들림이 없다.
 * `samples`에 채운 슬롯이 있으면(§8 CC0 파일, 단계 8~10) 합성 대신 그걸 쓴다.
 */
export function loadStyleKit(
  sampleRate: number,
  family: StyleFamily,
  kit: number,
  samples: Partial<Record<StyleDrumSlot, AudioBuffer>> = {}
): Promise<StyleKit> {
  const key = `${sampleRate}:${family}:${kit}`;
  let promise = styleCache.get(key);
  if (!promise) {
    const { kickIdx, snareIdx, hatIdx } = styleKitIndices(kit);
    promise = Promise.all([
      renderStyleKick(sampleRate, KICKS[family][kickIdx]),
      renderSnarePreset(sampleRate, SNARES[family][snareIdx]),
      renderHatPreset(sampleRate, HATS[family][hatIdx]),
    ]).then(([kick, clap, hat]) => ({ kick: samples.kick ?? kick, clap: samples.clap ?? clap, hat: samples.hat ?? hat }));
    styleCache.set(key, promise);
  }
  return promise;
}

let sub808Cache: Promise<AudioBuffer> | null = null;

/** switchUp(f)의 `kitSwap: "sub808"` 전용 킥 하나(§6.3 f-3, §7.2). 곡 전체에서 한 번만 만든다. */
export function loadSub808(sampleRate: number): Promise<AudioBuffer> {
  if (!sub808Cache) sub808Cache = renderStyleKick(sampleRate, SUB808);
  return sub808Cache;
}

let housePercCache: Promise<[AudioBuffer, AudioBuffer]> | null = null;

/** house(p) 콩가/봉고 한 쌍(§7.2). 게놈 drumVariant 비트가 스텝마다 둘 중 하나를 고르는 건
 *  styleDrumMaps/scheduleStyleBar(§11 단계 9)의 몫이라 여기선 소리 둘만 낸다. */
export function loadHousePercussion(sampleRate: number): Promise<[AudioBuffer, AudioBuffer]> {
  if (!housePercCache) {
    housePercCache = Promise.all([renderPercTone(sampleRate, 220), renderPercTone(sampleRate, 330)]);
  }
  return housePercCache;
}

// 사인 f → f×1.4(피치 +40%) 30ms, 감쇠 150ms(§7.2 house 퍼커션).
async function renderPercTone(sampleRate: number, startHz: number): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(1, Math.ceil(sampleRate * 0.17), sampleRate);
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(startHz, 0);
  osc.frequency.exponentialRampToValueAtTime(startHz * 1.4, 0.03);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.6, 0);
  gain.gain.exponentialRampToValueAtTime(0.001, 0.15);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(0);
  osc.stop(0.15);
  return ctx.startRendering();
}

// ---------------------------------------------------------------- 260927 §7.2: circuitK/skylineK

export type KraftwerkKitId = "circuitK" | "skylineK";

// 게놈 kit(0~35) = 킥 프리셋 j(0~5) × 6 + 햇·스네어 프리셋 m(0~5).
export function kraftwerkKitIndices(kit: number): { j: number; m: number } {
  return { j: kit % 6, m: Math.floor(kit / 6) % 6 };
}

// v2 BASE_PARAMS(circuit/skyline)에 곱하는 계수. k는 해시 ±15% 흔들림 대신 이 결정론적
// 배율을 쓴다.
function kraftwerkKMultiplier(base: KitParams, kit: number): KitParams {
  const { j, m } = kraftwerkKitIndices(kit);
  return {
    ...base,
    kickStartFreq: base.kickStartFreq * (0.85 + 0.06 * j),
    kickDecayMs: base.kickDecayMs * (0.8 + 0.11 * j),
    hatBandpass: base.hatBandpass * (0.8 + 0.08 * m),
    snareNoiseDecayMs: base.snareNoiseDecayMs * (0.8 + 0.08 * m),
    clapBurstGapMs: base.clapBurstGapMs * (0.9 + 0.04 * m),
  };
}

const kraftwerkKCache = new Map<string, Promise<SynthKit>>();

/** computeK/metropolisK 전용(§6.3 k-1/k-2, §7.2). 게놈 kit이 정하는 결정론적 프리셋 —
 *  아직 buildRig가 이 함수를 안 부른다(§11 단계 3 결정: k는 당분간 기존 circuit/skyline을
 *  그대로 쓴다). 단계 8~10 이후 게놈별 프리셋을 실제로 켤 때 이 함수로 바꿔 끼우면 된다. */
export function loadKraftwerkKKit(sampleRate: number, kitId: KraftwerkKitId, kit: number): Promise<SynthKit> {
  const base = kitId === "circuitK" ? BASE_PARAMS.circuit : BASE_PARAMS.skyline;
  const params = kraftwerkKMultiplier(base, kit);
  const key = `${sampleRate}:${kitId}:${kit}`;
  let promise = kraftwerkKCache.get(key);
  if (!promise) {
    promise = Promise.all([
      renderKick(sampleRate, params),
      renderSnare(sampleRate, params),
      renderHat(sampleRate, params),
      renderClap(sampleRate, params),
    ]).then(([kick, snare, hat, clap]) => ({ kick, snare, hat, clap }));
    kraftwerkKCache.set(key, promise);
  }
  return promise;
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
