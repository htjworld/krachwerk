import { degreeToMidi, midiToFrequency } from "./scales";
import { mulberry32 } from "./prng";
import { STEP_COUNT, isTextureActive, type Pattern } from "./pattern";
import { resolveLayers, type PatternOverride } from "./patternOverride";
import type { CrosshairControl } from "./crosshairControl";
import type { VoiceId } from "./voices";

export function secondsPerStep(tempo: number): number {
  return 60 / tempo / 4;
}

export function loopDurationSeconds(tempo: number): number {
  return secondsPerStep(tempo) * STEP_COUNT;
}

// 트랙 정체성과 무관한 드럼 노이즈(하이햇)는 시드와 상관없이 항상 같은 소리여야 하므로
// 고정된 시드로 만든 노이즈 버퍼를 쓴다.
const FIXED_DRUM_NOISE_SEED = 0x4b524b57;

function makeNoiseBuffer(ctx: BaseAudioContext, seed: number, durationSeconds: number): AudioBuffer {
  const length = Math.max(1, Math.round(ctx.sampleRate * durationSeconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const rng = mulberry32(seed);
  for (let i = 0; i < length; i++) data[i] = rng() * 2 - 1;
  return buffer;
}

function envelopeGain(
  ctx: BaseAudioContext,
  destination: AudioNode,
  time: number,
  attack: number,
  decay: number,
  peak: number
): GainNode {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(peak, time + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + attack + decay);
  gain.connect(destination);
  return gain;
}

function triggerKick(ctx: BaseAudioContext, destination: AudioNode, time: number): void {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(150, time);
  osc.frequency.exponentialRampToValueAtTime(45, time + 0.12);
  const gain = envelopeGain(ctx, destination, time, 0.002, 0.15, 0.9);
  osc.connect(gain);
  osc.start(time);
  osc.stop(time + 0.18);
}

function triggerHihat(ctx: BaseAudioContext, destination: AudioNode, time: number, noiseBuffer: AudioBuffer): void {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 7000;
  const gain = envelopeGain(ctx, destination, time, 0.001, 0.035, 0.12);
  source.connect(filter);
  filter.connect(gain);
  source.start(time);
  source.stop(time + 0.05);
}

function triggerVoice(
  ctx: BaseAudioContext,
  destination: AudioNode,
  voiceId: VoiceId,
  freq: number,
  time: number,
  stepDuration: number,
  noiseBuffer: AudioBuffer,
  level: number
): void {
  const noteDuration = stepDuration * 0.9;
  switch (voiceId) {
    case "square": {
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.setValueAtTime(freq, time);
      const gain = envelopeGain(ctx, destination, time, 0.005, noteDuration * 0.8, 0.22 * level);
      osc.connect(gain);
      osc.start(time);
      osc.stop(time + noteDuration);
      break;
    }
    case "sawUnison": {
      const gain = envelopeGain(ctx, destination, time, 0.005, noteDuration * 0.8, 0.18 * level);
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = freq * 4;
      filter.connect(gain);
      for (const detune of [-8, 8]) {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(freq, time);
        osc.detune.setValueAtTime(detune, time);
        osc.connect(filter);
        osc.start(time);
        osc.stop(time + noteDuration);
      }
      break;
    }
    case "triSub": {
      const gain = envelopeGain(ctx, destination, time, 0.005, noteDuration * 0.85, 0.24 * level);
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, time);
      const sub = ctx.createOscillator();
      sub.type = "sine";
      sub.frequency.setValueAtTime(freq / 2, time);
      osc.connect(gain);
      sub.connect(gain);
      osc.start(time);
      osc.stop(time + noteDuration);
      sub.start(time);
      sub.stop(time + noteDuration);
      break;
    }
    case "fmBell": {
      const gain = envelopeGain(ctx, destination, time, 0.002, noteDuration, 0.2 * level);
      const carrier = ctx.createOscillator();
      carrier.type = "sine";
      carrier.frequency.setValueAtTime(freq, time);
      const modulator = ctx.createOscillator();
      modulator.type = "sine";
      modulator.frequency.setValueAtTime(freq * 3.01, time);
      const modGain = ctx.createGain();
      modGain.gain.setValueAtTime(freq * 2, time);
      modulator.connect(modGain);
      modGain.connect(carrier.frequency);
      carrier.connect(gain);
      carrier.start(time);
      carrier.stop(time + noteDuration);
      modulator.start(time);
      modulator.stop(time + noteDuration);
      break;
    }
    case "noiseZap": {
      const gain = envelopeGain(ctx, destination, time, 0.001, 0.06, 0.3 * level);
      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = freq * 2;
      filter.Q.value = 6;
      source.connect(filter);
      filter.connect(gain);
      source.start(time);
      source.stop(time + 0.06);
      break;
    }
    case "ringMod": {
      const gain = envelopeGain(ctx, destination, time, 0.005, noteDuration * 0.7, 0.2 * level);
      const carrier = ctx.createOscillator();
      carrier.type = "sine";
      carrier.frequency.setValueAtTime(freq, time);
      const modulator = ctx.createOscillator();
      modulator.type = "sine";
      modulator.frequency.setValueAtTime(freq * 1.41, time);
      const ring = ctx.createGain();
      ring.gain.value = 0;
      carrier.connect(ring);
      modulator.connect(ring.gain);
      ring.connect(gain);
      carrier.start(time);
      carrier.stop(time + noteDuration);
      modulator.start(time);
      modulator.stop(time + noteDuration);
      break;
    }
  }
}

// 4.5 크로스헤어의 텍스처 레이어: 스케일 루트를 한 옥타브 아래로 깔아주는 지속음 패드.
// 시드에서 활성으로 뽑힌 트랙에서만 재생된다.
function scheduleTexturePad(ctx: BaseAudioContext, destination: AudioNode, pattern: Pattern, loopDuration: number): void {
  const octave = pattern.scale.intervals.length;
  const freq = midiToFrequency(degreeToMidi(pattern.scale, -octave));
  const release = Math.min(0.4, loopDuration / 4);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, 0);
  gain.gain.linearRampToValueAtTime(0.06, release);
  gain.gain.setValueAtTime(0.06, loopDuration - release);
  gain.gain.linearRampToValueAtTime(0, loopDuration);
  gain.connect(destination);

  const osc1 = ctx.createOscillator();
  osc1.type = "triangle";
  osc1.frequency.setValueAtTime(freq, 0);
  const osc2 = ctx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(freq * 2.01, 0);
  osc1.connect(gain);
  osc2.connect(gain);
  osc1.start(0);
  osc1.stop(loopDuration);
  osc2.start(0);
  osc2.stop(loopDuration);
}

function scheduleLoop(
  ctx: BaseAudioContext,
  destination: AudioNode,
  pattern: Pattern,
  layers: ReturnType<typeof resolveLayers>,
  startTime: number,
  drumNoise: AudioBuffer,
  voiceNoise: AudioBuffer,
  tempo: number
): void {
  const stepDur = secondsPerStep(tempo);
  const octave = pattern.scale.intervals.length;
  for (let i = 0; i < STEP_COUNT; i++) {
    const t = startTime + i * stepDur;
    if (layers.kick[i]) triggerKick(ctx, destination, t);
    if (layers.hihat[i]) triggerHihat(ctx, destination, t, drumNoise);
    if (layers.bass[i].on) {
      const midi = degreeToMidi(pattern.scale, layers.bass[i].degree - octave);
      triggerVoice(ctx, destination, pattern.bassVoice, midiToFrequency(midi), t, stepDur, voiceNoise, 0.9);
    }
    if (layers.lead[i].on) {
      const midi = degreeToMidi(pattern.scale, layers.lead[i].degree + octave);
      triggerVoice(ctx, destination, pattern.leadVoice, midiToFrequency(midi), t, stepDur, voiceNoise, 0.7);
    }
  }
}

// filterCutoff(0..1)를 로우패스 컷오프 주파수(Hz)로 매핑한다. 1이면 가청 대역 위라 사실상
// 필터가 안 걸린 것처럼 들린다.
function cutoffToFrequency(cutoff: number): number {
  return 300 * Math.pow(18000 / 300, cutoff);
}

// 한 마디(16스텝) 분량만 오프라인으로 렌더링한다. 재생은 이 버퍼를 loop=true로 반복하고,
// 다운로드는 이 버퍼의 PCM을 여러 번 이어붙여서(wav.ts) 만든다.
export async function renderLoopBuffer(
  pattern: Pattern,
  override?: PatternOverride | null,
  liveControls?: CrosshairControl | null
): Promise<AudioBuffer> {
  const tempo = liveControls?.tempo ?? pattern.tempo;
  const duration = loopDurationSeconds(tempo);
  const sampleRate = 44100;
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);

  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = cutoffToFrequency(liveControls?.filterCutoff ?? 1);
  tone.connect(ctx.destination);

  const master = ctx.createGain();
  master.gain.value = 0.8;
  master.connect(tone);

  const drumNoise = makeNoiseBuffer(ctx, FIXED_DRUM_NOISE_SEED, 0.05);
  const voiceNoise = makeNoiseBuffer(ctx, pattern.seedHash, 0.06);
  const layers = resolveLayers(pattern, override);
  scheduleLoop(ctx, master, pattern, layers, 0, drumNoise, voiceNoise, tempo);
  if (isTextureActive(pattern)) scheduleTexturePad(ctx, master, pattern, duration);

  return ctx.startRendering();
}
