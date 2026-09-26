import { degreeToMidi, midiToFrequency, type Scale } from "./scales";
import { mulberry32, pick } from "./prng";
import { STEP_COUNT, type Pattern, type StepCell } from "./pattern";
import { resolveLayers, type PatternOverride, type ResolvedLayers } from "./patternOverride";
import type { CrosshairControl } from "./crosshairControl";
import type { VoiceId } from "./voices";
import { loadSampleBank, type SampleBank, type SampleId } from "./samples";
import { buildArrangement, type Arrangement, type Section } from "./arrangement";
import { cueActiveAtStep, cueFor, fillSteps, rateAt, rateStepActive, semitoneShift, type LayerCue, type LayerId } from "./blueprint";
import { blueprintById, legacyCue } from "./blueprints/legacy";
import { targetSecondsFor } from "./genome";
import {
  computeBass,
  computeRiff,
  computeScale,
  familyDrumHit,
  metropolisBass,
  metropolisScale,
  metropolisSeq,
  metropolisSeqAccent,
} from "./motifs";
import { deriveTrack, type Track } from "./track";
import { loadVoiceForCode, type VoiceLang } from "./voiceBank";
import { loadSigSample, type SigSampleKind } from "./sigBank";
import { loadSynthKit, type SynthKit } from "./drumSynth";

export function secondsPerStep(tempo: number): number {
  return 60 / tempo / 4;
}

/** 16스텝 = 4/4 한 마디 */
export function loopDurationSeconds(tempo: number): number {
  return secondsPerStep(tempo) * STEP_COUNT;
}

export function arrangementFor(pattern: Pattern, tempo: number): Arrangement {
  return buildArrangement(blueprintById(pattern.blueprintId), tempo, targetSecondsFor(pattern.genome));
}

export const DEFAULT_SAMPLE_RATE = 44100;

export interface RenderOptions {
  override?: PatternOverride | null;
  liveControls?: CrosshairControl | null;
  /**
   * 재생에 쓸 AudioContext의 샘플레이트. 사파리는 버퍼와 컨텍스트의 샘플레이트가 어긋나면
   * 리샘플링을 안 하고 그냥 무음을 내보내므로, 출력 장치 레이트에 맞춰 렌더링해야 한다.
   */
  sampleRate?: number;
  onProgress?: (ratio: number) => void;
}

// 성능 메모: 크롬은 오프라인 렌더링이 끝날 때까지 다 쓴 노드를 그래프에서 놓아주지 않는다.
// 노트마다 오실레이터를 새로 만들면 3분 트랙에서 노드가 수천 개로 불어나고 렌더링이
// 1분을 넘긴다. 그래서
//   - 드럼은 노드를 안 만들고 JS에서 샘플을 직접 버퍼에 더한다(믹싱 한 번, 소스 두 개).
//   - 신스는 레이어마다 트랙 전체를 도는 모노 보이스 하나를 만들어 두고
//     주파수/게인 오토메이션만 써 넣는다. 실제 모노 신스가 동작하는 방식 그대로다.
// 결과적으로 노드 수는 수천 개에서 수십 개로 줄어든다.

// ---------------------------------------------------------------- 버퍼 재료

function makeNoiseBuffer(ctx: BaseAudioContext, seed: number, durationSeconds: number): AudioBuffer {
  const length = Math.max(1, Math.round(ctx.sampleRate * durationSeconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const rng = mulberry32(seed);
  for (let i = 0; i < length; i++) data[i] = rng() * 2 - 1;
  return buffer;
}

// 임펄스 응답 파일을 따로 받지 않고 감쇠하는 노이즈로 홀 리버브를 만든다.
function makeImpulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const length = Math.round(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  const rng = mulberry32(0x517cc1b7);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      data[i] = (rng() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return buffer;
}

// 시그니처 사운드(§15.2) S2: 우주 교신음(Quindar 톤). 2525Hz 250ms → 2475Hz 250ms.
function makeQuindarBuffer(ctx: BaseAudioContext): AudioBuffer {
  const seconds = 0.5;
  const length = Math.round(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const half = Math.round(length / 2);
  const fadeSamples = Math.round(ctx.sampleRate * 0.006);
  for (let i = 0; i < length; i++) {
    const freq = i < half ? 2525 : 2475;
    const t = i / ctx.sampleRate;
    const fadeIn = Math.min(1, i / fadeSamples);
    const fadeOut = Math.min(1, (length - i) / fadeSamples);
    data[i] = Math.sin(2 * Math.PI * freq * t) * 0.6 * fadeIn * fadeOut;
  }
  return buffer;
}

// 시그니처 사운드 S3: 금속 벨 "클링". FM 6배음(Tone.js MetalSynth 발상, 비율만 참고).
// 비율을 시드로 살짝 흔들어서 곡마다 음색이 조금씩 다르다.
function makeBellBuffer(ctx: BaseAudioContext, seedHash: number): AudioBuffer {
  const seconds = 1.2;
  const length = Math.round(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const rng = mulberry32((seedHash ^ 0x00b3117) >>> 0);
  const ratios = [1, 1.483, 1.932, 2.546, 2.63, 3.897].map((r) => r * (0.94 + rng() * 0.12));
  const base = 480;
  for (let i = 0; i < length; i++) {
    const t = i / ctx.sampleRate;
    let v = 0;
    for (const r of ratios) v += Math.sin(2 * Math.PI * base * r * t) * Math.exp(-t * (2 + r));
    data[i] = (v / ratios.length) * 0.7;
  }
  return buffer;
}

// 완만한 tanh 곡선. 마스터에서 살짝 물려 피크를 둥글게 깎는다.
function makeSaturationCurve(drive: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
  }
  return curve;
}

// ---------------------------------------------------------------- 믹스 버스

export interface Mix {
  /** 사이드체인을 안 먹는 드럼 버스 */
  drum: GainNode;
  /** 킥에 맞춰 눌리는 악기 버스 */
  music: GainNode;
  sidechain: GainNode;
  reverbSend: GainNode;
  delaySend: GainNode;
  /** 섹션별로 훑는 마스터 로우패스 */
  tone: BiquadFilterNode;
  /** 섹션별 에너지 곡선. 리미터가 다 눌러버리지 않게 여기서 실제로 음량을 움직인다. */
  master: GainNode;
}

function buildMix(ctx: BaseAudioContext, tempo: number, liveCutoffHz: number): Mix {
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 3;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.14;
  limiter.connect(ctx.destination);

  const saturator = ctx.createWaveShaper();
  saturator.curve = makeSaturationCurve(1.5);
  saturator.connect(limiter);

  // 크로스헤어의 톤 노브. 섹션 오토메이션과 직렬로 건다.
  const liveTone = ctx.createBiquadFilter();
  liveTone.type = "lowpass";
  liveTone.frequency.value = liveCutoffHz;
  liveTone.connect(saturator);

  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.Q.value = 0.9;
  tone.connect(liveTone);

  const rumbleCut = ctx.createBiquadFilter();
  rumbleCut.type = "highpass";
  rumbleCut.frequency.value = 26;
  rumbleCut.connect(tone);

  const master = ctx.createGain();
  master.gain.value = 0.8;
  master.connect(rumbleCut);

  const drum = ctx.createGain();
  drum.connect(master);

  const sidechain = ctx.createGain();
  sidechain.gain.value = 1;
  sidechain.connect(master);

  const music = ctx.createGain();
  music.connect(sidechain);

  const convolver = ctx.createConvolver();
  convolver.buffer = makeImpulse(ctx, 1.8, 2.6);
  const reverbReturn = ctx.createGain();
  reverbReturn.gain.value = 0.34;
  convolver.connect(reverbReturn);
  reverbReturn.connect(master);
  const reverbSend = ctx.createGain();
  reverbSend.connect(convolver);

  // 점8분 딜레이. 일렉트로닉에서 리드가 넓게 들리게 하는 가장 흔한 수단이다.
  const delay = ctx.createDelay(2);
  delay.delayTime.value = (60 / tempo) * 0.75;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.36;
  const feedbackTone = ctx.createBiquadFilter();
  feedbackTone.type = "lowpass";
  feedbackTone.frequency.value = 2600;
  delay.connect(feedbackTone);
  feedbackTone.connect(feedback);
  feedback.connect(delay);
  const delayReturn = ctx.createGain();
  delayReturn.gain.value = 0.28;
  delay.connect(delayReturn);
  delayReturn.connect(master);
  const delaySend = ctx.createGain();
  delaySend.connect(delay);

  return { drum, music, sidechain, reverbSend, delaySend, tone, master };
}

// ---------------------------------------------------------------- 드럼 (JS 믹싱)

export type DrumRole = "kick" | "hat" | "openHat" | "backbeat" | "perc" | "metal" | "lowDrum" | "tick" | "calls" | "sig";

interface DrumVoiceSpec {
  level: number;
  pan: number;
  send: number;
}

const DRUM_VOICES: Record<DrumRole, DrumVoiceSpec> = {
  kick: { level: 1, pan: 0, send: 0.02 },
  hat: { level: 0.3, pan: 0.34, send: 0.07 },
  openHat: { level: 0.3, pan: -0.4, send: 0.14 },
  backbeat: { level: 0.6, pan: -0.1, send: 0.22 },
  perc: { level: 0.32, pan: 0.5, send: 0.16 },
  metal: { level: 0.36, pan: -0.55, send: 0.32 },
  // compute의 저음 드럼 시퀀스(§4.2). 킥과 같은 자리(레벨·팬·리버브)에서 킥 전용
  // 버스(kickHighpass)를 같이 쓴다 — §11 단계 6 전까진 아무도 이 역할로 hit()을 안 부른다.
  lowDrum: { level: 1, pan: 0, send: 0.02 },
  // metropolis 인트로 펄스(§4.2/§16.7: 2분음표 틱). 지금은 킥 샘플을 재사용한다.
  tick: { level: 0.6, pan: 0, send: 0.05 },
  // 로봇 목소리가 시드 코드를 읽는다(§15.2 S1).
  calls: { level: 0.8, pan: 0, send: 0.3 },
  // 시그니처 사운드(§15.2 S2~S6). 킥 사이드체인 안 받는다 — KICK_BUS_ROLES에 없다.
  sig: { level: 0.6, pan: 0, send: 0.35 },
};

const KICK_BUS_ROLES: readonly DrumRole[] = ["kick", "lowDrum"];

export interface DrumMixer {
  hit(role: DrumRole, sample: AudioBuffer, time: number, level: number, rate?: number): void;
  /** 믹싱이 다 끝난 뒤에 부른다. 버퍼를 소스에 물려 그래프에 연결한다. */
  connect(): void;
  /**
   * 킥·lowDrum만 지나는 하이패스. §11 단계 6의 metropolis 아웃트로(kickLowCut, §16.4)가
   * 이 frequency를 20Hz(사실상 무영향) → 최대 몇백Hz로 오토메이션해서 저역만 뺀다.
   * 지금은 아무 섹션도 kickLowCut을 안 써서 항상 20Hz 그대로다 — 소리에 영향 없다.
   */
  kickHighpass: BiquadFilterNode;
}

function createDrumMixer(ctx: BaseAudioContext, mix: Mix, totalSamples: number): DrumMixer {
  // AudioBuffer의 채널 데이터에 바로 더한다. 중간 배열을 따로 두지 않으려는 것.
  // kick/lowDrum만 별도 버퍼(kickDry)에 모아서 하이패스 하나를 태울 수 있게 한다.
  const dry = ctx.createBuffer(2, totalSamples, ctx.sampleRate);
  const left = dry.getChannelData(0);
  const right = dry.getChannelData(1);
  const kickDry = ctx.createBuffer(2, totalSamples, ctx.sampleRate);
  const kickLeft = kickDry.getChannelData(0);
  const kickRight = kickDry.getChannelData(1);
  const wet = ctx.createBuffer(1, totalSamples, ctx.sampleRate);
  const send = wet.getChannelData(0);

  const kickHighpass = ctx.createBiquadFilter();
  kickHighpass.type = "highpass";
  kickHighpass.frequency.value = 20;
  kickHighpass.connect(mix.drum);

  return {
    kickHighpass,

    connect() {
      const drySource = ctx.createBufferSource();
      drySource.buffer = dry;
      drySource.connect(mix.drum);
      drySource.start(0);

      const kickSource = ctx.createBufferSource();
      kickSource.buffer = kickDry;
      kickSource.connect(kickHighpass);
      kickSource.start(0);

      const wetSource = ctx.createBufferSource();
      wetSource.buffer = wet;
      const toReverb = ctx.createGain();
      toReverb.gain.value = 0.6;
      const toDelay = ctx.createGain();
      toDelay.gain.value = 0.4;
      wetSource.connect(toReverb);
      wetSource.connect(toDelay);
      toReverb.connect(mix.reverbSend);
      toDelay.connect(mix.delaySend);
      wetSource.start(0);
    },

    hit(role, sample, time, level, rate = 1) {
      const spec = DRUM_VOICES[role];
      const amount = spec.level * level;
      const angle = ((spec.pan + 1) * Math.PI) / 4;
      const gl = amount * Math.cos(angle) * Math.SQRT2;
      const gr = amount * Math.sin(angle) * Math.SQRT2;
      const gs = amount * spec.send;
      const [outLeft, outRight] = KICK_BUS_ROLES.includes(role) ? [kickLeft, kickRight] : [left, right];

      const data = sample.getChannelData(0);
      const start = Math.round(time * ctx.sampleRate);
      if (start >= totalSamples) return;

      if (rate === 1) {
        const frames = Math.min(data.length, totalSamples - start);
        for (let i = 0; i < frames; i++) {
          const v = data[i];
          const j = start + i;
          outLeft[j] += v * gl;
          outRight[j] += v * gr;
          send[j] += v * gs;
        }
        return;
      }
      // 보간에 다음 샘플을 쓰므로 마지막 한 칸은 남겨둔다. 배열 밖을 읽으면 NaN이
      // 버퍼에 섞이고, 그 NaN이 마스터 필터 상태를 망가뜨려 트랙 전체가 무음이 된다.
      const frames = Math.min(Math.floor((data.length - 1) / rate), totalSamples - start);
      for (let i = 0; i < frames; i++) {
        const pos = i * rate;
        const k = pos | 0;
        const frac = pos - k;
        const v = data[k] + (data[k + 1] - data[k]) * frac;
        const j = start + i;
        outLeft[j] += v * gl;
        outRight[j] += v * gr;
        send[j] += v * gs;
      }
    },
  };
}

// ---------------------------------------------------------------- 신스 (모노 보이스)

export type SynthLayer = "bass" | "lead" | "arp" | "stab" | "pad" | "riser" | "seqRiff" | "seqRun" | "glide" | "drone";

interface StripSpec {
  level: number;
  pan: number;
  reverb: number;
  delay: number;
}

const SYNTH_STRIPS: Record<SynthLayer, StripSpec> = {
  bass: { level: 0.85, pan: 0, reverb: 0.02, delay: 0 },
  lead: { level: 0.52, pan: 0.2, reverb: 0.18, delay: 0.32 },
  arp: { level: 0.3, pan: -0.45, reverb: 0.22, delay: 0.38 },
  stab: { level: 0.34, pan: 0.05, reverb: 0.3, delay: 0.18 },
  pad: { level: 0.3, pan: 0, reverb: 0.45, delay: 0.1 },
  riser: { level: 0.4, pan: 0, reverb: 0.25, delay: 0.1 },
  seqRiff: { level: 0.4, pan: 0.15, reverb: 0.15, delay: 0.28 },
  seqRun: { level: 0.34, pan: -0.2, reverb: 0.2, delay: 0.3 },
  glide: { level: 0.3, pan: 0, reverb: 0.3, delay: 0.15 },
  drone: { level: 0.25, pan: 0, reverb: 0.35, delay: 0 },
};

function buildStrip(ctx: BaseAudioContext, mix: Mix, spec: StripSpec): GainNode {
  const input = ctx.createGain();
  input.gain.value = spec.level;
  const panner = ctx.createStereoPanner();
  panner.pan.value = spec.pan;
  input.connect(panner);
  panner.connect(mix.music);
  if (spec.reverb > 0) {
    const send = ctx.createGain();
    send.gain.value = spec.reverb;
    panner.connect(send);
    send.connect(mix.reverbSend);
  }
  if (spec.delay > 0) {
    const send = ctx.createGain();
    send.gain.value = spec.delay;
    panner.connect(send);
    send.connect(mix.delaySend);
  }
  return input;
}

/** note()를 부를 때 freq에 비례해서 값을 써 넣을 파라미터 */
interface RatioTarget {
  param: AudioParam;
  ratio: number;
  /** 있으면 노트 안에서 이 비율까지 내려온다 (FM 인덱스, 노이즈 스윕) */
  decayRatio?: number;
  /**
   * 필터 주파수처럼 값이 툭 튀면 필터가 발산해버리는 파라미터. 보이스를 트랙 내내
   * 재사용하다 보니 한 번 발산하면 끝까지 NaN이 남는다. 이런 파라미터는 계단이 아니라
   * 짧은 선형 램프로만 움직인다.
   */
  smooth?: boolean;
}

export interface MonoVoice {
  note(time: number, freq: number, duration: number, level: number): void;
}

/**
 * 트랙 전체를 도는 모노 신스 하나. 노트마다 노드를 만드는 대신 여기에 오토메이션만 쌓는다.
 * 모노라서 한 레이어 안에서는 노트가 겹치지 않는다는 뜻인데, 시퀀서 기반 일렉트로닉에서는
 * 오히려 그게 제대로 된 동작이다.
 */
function createVoice(
  ctx: BaseAudioContext,
  destination: AudioNode,
  voiceId: VoiceId,
  noiseBuffer: AudioBuffer,
  duration: number,
  filterEnv: number
): MonoVoice {
  const amp = ctx.createGain();
  amp.gain.value = 0;

  let target: AudioNode = destination;
  let filter: BiquadFilterNode | null = null;
  if (filterEnv > 0) {
    filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 0.8 + 1.2 * filterEnv;
    filter.frequency.value = 12000;
    filter.connect(destination);
    target = filter;
  }
  amp.connect(target);

  const targets: RatioTarget[] = [];
  const osc = (type: OscillatorType, ratio: number, detune: number, dest: AudioNode | AudioParam) => {
    const node = ctx.createOscillator();
    node.type = type;
    node.frequency.value = 220 * ratio;
    node.detune.value = detune;
    // connect는 AudioNode와 AudioParam 양쪽을 받는데 타입 정의상 오버로드 선택이 안 된다.
    (node.connect as (target: AudioNode | AudioParam) => void)(dest);
    node.start(0);
    node.stop(duration);
    targets.push({ param: node.frequency, ratio });
    return node;
  };

  let attack = 0.005;
  let peak = 0.2;

  switch (voiceId) {
    case "square":
      osc("square", 1, 0, amp);
      peak = 0.22;
      break;
    case "sawUnison":
      osc("sawtooth", 1, -9, amp);
      osc("sawtooth", 1, 9, amp);
      peak = 0.17;
      break;
    case "triSub":
      osc("triangle", 1, 0, amp);
      osc("sine", 0.5, 0, amp);
      peak = 0.24;
      break;
    case "fmBell": {
      const carrier = ctx.createOscillator();
      carrier.type = "sine";
      carrier.frequency.value = 220;
      carrier.connect(amp);
      carrier.start(0);
      carrier.stop(duration);
      targets.push({ param: carrier.frequency, ratio: 1 });

      const modGain = ctx.createGain();
      modGain.gain.value = 1;
      modGain.connect(carrier.frequency);
      targets.push({ param: modGain.gain, ratio: 2.4, decayRatio: 0.2 });
      osc("sine", 3.01, 0, modGain);
      attack = 0.002;
      peak = 0.2;
      break;
    }
    case "noiseZap": {
      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer;
      source.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.Q.value = 3;
      band.frequency.value = 660;
      source.connect(band);
      band.connect(amp);
      source.start(0);
      source.stop(duration);
      targets.push({ param: band.frequency, ratio: 3, decayRatio: 1, smooth: true });
      attack = 0.001;
      peak = 0.3;
      break;
    }
    case "ringMod": {
      const carrier = ctx.createOscillator();
      carrier.type = "sine";
      carrier.frequency.value = 220;
      const ring = ctx.createGain();
      ring.gain.value = 0;
      carrier.connect(ring);
      ring.connect(amp);
      carrier.start(0);
      carrier.stop(duration);
      targets.push({ param: carrier.frequency, ratio: 1 });
      osc("sine", 1.41, 0, ring.gain);
      peak = 0.22;
      break;
    }
  }

  return {
    note(time, freq, noteDuration, level) {
      for (const t of targets) {
        const value = Math.max(1, freq * t.ratio);
        if (t.smooth) t.param.linearRampToValueAtTime(value, time + 0.004);
        else t.param.setValueAtTime(value, time);
        if (t.decayRatio !== undefined) {
          const decayTo = Math.max(1, freq * t.decayRatio);
          const decayAt = time + noteDuration * 0.8;
          if (t.smooth) t.param.linearRampToValueAtTime(decayTo, decayAt);
          else t.param.exponentialRampToValueAtTime(decayTo, decayAt);
        }
      }
      if (filter) {
        // 계단 없이 램프만 쓴다. 이전 노트가 끝난 값에서 이어지므로 필터가 발산하지 않는다.
        const top = Math.min(12000, Math.max(400, freq * (4 + 16 * filterEnv)));
        const bottom = Math.min(top, Math.max(240, freq * 2));
        filter.frequency.linearRampToValueAtTime(top, time + 0.006);
        filter.frequency.linearRampToValueAtTime(bottom, time + noteDuration * 0.7);
      }
      amp.gain.setValueAtTime(0.0001, time);
      amp.gain.linearRampToValueAtTime(peak * level, time + attack);
      amp.gain.exponentialRampToValueAtTime(0.0001, time + attack + noteDuration);
    },
  };
}

function schedulePad(
  ctx: BaseAudioContext,
  destination: AudioNode,
  scale: Scale,
  rootDegree: number,
  start: number,
  length: number
): void {
  const attack = Math.min(2.5, length * 0.3);
  const release = Math.min(3, length * 0.35);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(0.5, start + attack);
  gain.gain.setValueAtTime(0.5, start + length - release);
  gain.gain.linearRampToValueAtTime(0, start + length);
  gain.connect(destination);

  const octave = scale.intervals.length;
  for (const [degree, detune, type] of [
    [rootDegree - octave, -7, "sawtooth"],
    [rootDegree - octave, 7, "sawtooth"],
    [rootDegree, 0, "triangle"],
    [rootDegree + 4, 4, "sine"],
  ] as const) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = midiToFrequency(degreeToMidi(scale, degree));
    osc.detune.value = detune;
    osc.connect(gain);
    osc.start(start);
    osc.stop(start + length);
  }
}

function scheduleRiser(
  ctx: BaseAudioContext,
  destination: AudioNode,
  noiseBuffer: AudioBuffer,
  start: number,
  length: number
): void {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer;
  source.loop = true;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = 2.5;
  band.frequency.setValueAtTime(320, start);
  band.frequency.exponentialRampToValueAtTime(9000, start + length);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.55, start + length * 0.96);
  gain.gain.linearRampToValueAtTime(0, start + length);
  source.connect(band);
  band.connect(gain);
  gain.connect(destination);
  source.start(start);
  source.stop(start + length);
}

// 자유박/롱노트 자리(compute ambient drone, metropolis 인트로 베이스)에 쓰는 단순 지속음.
function scheduleDrone(
  ctx: BaseAudioContext,
  destination: AudioNode,
  scale: Scale,
  degree: number,
  start: number,
  length: number
): void {
  const attack = Math.min(3, length * 0.4);
  const release = Math.min(3, length * 0.4);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(0.4, start + attack);
  gain.gain.setValueAtTime(0.4, Math.max(start + attack, start + length - release));
  gain.gain.linearRampToValueAtTime(0, start + length);
  gain.connect(destination);

  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = midiToFrequency(degreeToMidi(scale, degree));
  osc.connect(gain);
  osc.start(start);
  osc.stop(start + length);

  const sub = ctx.createOscillator();
  sub.type = "sine";
  sub.frequency.value = midiToFrequency(degreeToMidi(scale, degree - scale.intervals.length));
  sub.connect(gain);
  sub.start(start);
  sub.stop(start + length);
}

// 포르타멘토 스윕 (metropolis 인트로 glide). 섹션 안에서 2마디 구간마다 한 번씩 불린다.
function scheduleGlide(
  ctx: BaseAudioContext,
  destination: AudioNode,
  scale: Scale,
  fromDegree: number,
  toDegree: number,
  start: number,
  length: number
): void {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(0.3, start + length * 0.15);
  gain.gain.linearRampToValueAtTime(0, start + length);
  gain.connect(destination);

  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(midiToFrequency(degreeToMidi(scale, fromDegree)), start);
  osc.frequency.exponentialRampToValueAtTime(midiToFrequency(degreeToMidi(scale, toDegree)), start + length * 0.9);
  osc.connect(gain);
  osc.start(start);
  osc.stop(start + length);
}

// ---------------------------------------------------------------- 마디 스케줄링

// 큐가 있고 이 마디에서 활성화된 rateSteps로 해당 스텝이 켜지는지. 큐 자체가 없으면(레이어가
// 이 섹션에서 안 켜져 있으면) false. rateSteps를 안 쓰는 레이어(kick 등, 더미 rate:16만 들어
// 있음)에 이 함수를 쓰면 안 된다 — 항상 true가 나온다.
function cueStepActive(cue: LayerCue | null, sectionBar: number, step: number): boolean {
  if (!cue) return false;
  const rateStep = rateAt(cue, sectionBar) ?? { atBar: 0, rate: 16 as const };
  return rateStepActive(rateStep, step);
}

export interface Rig {
  ctx: BaseAudioContext;
  mix: Mix;
  drums: DrumMixer;
  voices: Record<"bass" | "lead" | "arp" | "seqRiff" | "seqRun", MonoVoice>;
  stabVoices: MonoVoice[];
  strips: Record<SynthLayer, GainNode>;
  bank: SampleBank;
  pattern: Pattern;
  track: Track;
  layers: ResolvedLayers;
  noise: AudioBuffer;
  stepDur: number;
  /** compute/metropolis 전용 조성. legacy는 pattern.scale 그대로다. */
  motifScale: Scale;
  /** compute(computeRiff)/metropolis(metropolisSeq) 리프. legacy는 null(seqRiff 큐를 안 쓴다). */
  motifRiff: StepCell[] | null;
  /** compute(computeBass)/metropolis(metropolisBass) 베이스. legacy는 null(기존 layers.bass를 쓴다). */
  motifBass: { cells: StepCell[]; gateBeats: number | null } | null;
  /** 로봇 목소리(§15.2 S1). "calls" 큐가 있는 블루프린트(compute)만 채운다. */
  voiceBank: Map<string, AudioBuffer> | null;
  /** 시그니처 사운드(§15.2 S2~S6). 곡 하나에 하나만 고른다 — sigSlots가 있는 블루프린트
   *  (compute/metropolis)만 채운다. */
  sigBuffer: AudioBuffer | null;
  /** 합성 드럼 킷(§14.2 K, §15.3). compute="circuit"/metropolis="skyline". legacy는 null
   *  (코어/uzu/simmons 샘플 킷을 그대로 쓴다). */
  synthKit: SynthKit | null;
}

export function scheduleBar(
  rig: Rig,
  section: Section,
  barIndex: number,
  sectionBar: number,
  barStart: number,
  rng: () => number,
  swing = 0
): void {
  // 자유박 섹션(metropolis freeIntro)은 격자 자체가 없다 — pad/glide/드론은
  // renderArrangement가 섹션 단위로 직접 스케줄한다.
  if (section.freeTime) return;

  const { mix, drums, voices, stabVoices, bank, pattern, track, layers, stepDur } = rig;
  const intensity = section.intensity;
  const isCompute = pattern.blueprintId === "compute";
  const isMetropolis = pattern.blueprintId === "metropolis";
  const familyHit =
    isCompute || isMetropolis ? familyDrumHit(section.drumFamily, pattern.genome, barIndex) : null;
  const octave = pattern.scale.intervals.length;
  const isLastBar = sectionBar === section.bars - 1;
  // legacy(§11 단계 2 이관분)는 fill 배열을 안 쓰고 옛 방식대로 매 필 마디마다 rng()로
  // 4종 중 하나를 고른다. compute/metropolis(§11 단계 6)는 section.fill/endFill을 채워서
  // 이 분기를 안 타고 아래의 새 필 메커니즘(§11 단계 3)을 쓴다.
  const legacyFill = section.fill.length === 0 && section.endFill === undefined;
  // §11 단계 5: 필 주기가 게놈 drumVariant에서 나온다(4마디 또는 8마디). 예전엔 8로 고정.
  const isFill = legacyFill && (isLastBar || sectionBar % track.fillPeriodBars === track.fillPeriodBars - 1);
  const fillKind = isFill ? Math.floor(rng() * 4) : -1;
  // 마지막 마디 뒷부분에서 하이햇을 빼면 다음 블록이 훨씬 세게 들어온다.
  const hatCutFrom = isFill ? 12 : STEP_COUNT;
  const shift = track.progression[Math.floor(barIndex / 4) % track.progression.length];
  // 홀수 16분 스텝을 swing×stepDur만큼 늦춘다(§11 단계 3, metropolis 측정 스윙).
  const at = (step: number) => barStart + step * stepDur + (step % 2 === 1 ? swing * stepDur : 0);
  const semitones = (step: number) => semitoneShift(section, sectionBar, step);
  const withShift = (freq: number, step: number) => freq * 2 ** (semitones(step) / 12);

  if (sectionBar === 0 && intensity > 0.28) {
    drums.hit("metal", bank[track.cymbal], barStart, 0.5);
  }

  // 로봇 목소리(§15.2 S1): 마디마다 시드 코드 한 글자씩, 순서대로. 스텝 단위가 아니라
  // 마디당 한 번이라 window/rate 대신 cueFor로만 "이 마디에 켜져 있는가"를 본다.
  if (rig.voiceBank && cueFor(section, "calls", sectionBar)) {
    const code = pattern.seedInput;
    const char = code[barIndex % code.length];
    const buf = rig.voiceBank.get(char);
    if (buf) drums.hit("calls", buf, barStart, 0.8);
  }

  // 시그니처 사운드(§15.2): 블루프린트가 정한 마디에서 한 번, 곡 전체에서 고른 S2~S6 소리로.
  if (rig.sigBuffer && section.sigSlots?.includes(sectionBar)) {
    drums.hit("sig", rig.sigBuffer, barStart, 0.7);
  }

  for (let step = 0; step < STEP_COUNT; step++) {
    const time = at(step);
    const accent = track.accent[step] ? 1.3 : 1;
    const downbeat = step % 4 === 0;

    if (familyHit) {
      // compute/metropolis: 드럼 계열이 킥/lowDrum/tick의 on-off를 정한다(§16.4). 소리는
      // 합성 킷(circuit/skyline, §14.2 K)의 킥 원샷을 세 역할 다 재사용한다 — 역할별
      // 음색은 §11 단계 6 청취 후 다듬는다.
      if (familyHit.mask[step]) {
        const sample = rig.synthKit ? rig.synthKit.kick : bank[track.kick];
        drums.hit(familyHit.role, sample, time, 0.9 + 0.1 * intensity);
        if (familyHit.role !== "tick") {
          const depth = 0.34 + 0.24 * (1 - intensity);
          mix.sidechain.gain.setValueAtTime(depth, time);
          mix.sidechain.gain.linearRampToValueAtTime(1, time + Math.min(0.22, stepDur * 2.4));
        }
      }
    } else if (cueActiveAtStep(section, "kick", sectionBar, step)) {
      const doubled = section.id.startsWith("build") && isLastBar && step % 2 === 0;
      if (layers.kick[step] || doubled || (intensity > 0.85 && step === 14 && rng() < 0.25)) {
        drums.hit("kick", bank[track.kick], time, (doubled ? 0.75 : 1) * (0.9 + 0.1 * intensity));
        // 킥이 칠 때마다 악기 버스를 눌렀다 푼다(사이드체인 펌핑).
        const depth = 0.34 + 0.24 * (1 - intensity);
        mix.sidechain.gain.setValueAtTime(depth, time);
        mix.sidechain.gain.linearRampToValueAtTime(1, time + Math.min(0.22, stepDur * 2.4));
      }
    }

    if (cueActiveAtStep(section, "backbeat", sectionBar, step) && (step === 4 || step === 12)) {
      const double = fillKind === 3 && step === 12;
      // compute는 클랩 성향(§14.2 K), metropolis는 스네어 성향 — 합성 킷에도 그대로 따른다.
      const backbeatSample = rig.synthKit ? (isCompute ? rig.synthKit.clap : rig.synthKit.snare) : bank[track.backbeat];
      drums.hit("backbeat", backbeatSample, time, double ? 0.85 : 0.7);
      if (double) drums.hit("backbeat", backbeatSample, at(14), 0.6);
    }

    const hatCue = cueActiveAtStep(section, "hat", sectionBar, step);
    if (hatCue && step < hatCutFrom && cueStepActive(hatCue, sectionBar, step)) {
      const level = (downbeat ? 0.55 : step % 2 === 0 ? 0.4 : 0.24) * accent;
      drums.hit("hat", rig.synthKit ? rig.synthKit.hat : bank[track.hat], time, level, 0.95 + rng() * 0.12);
    }

    if (cueActiveAtStep(section, "openHat", sectionBar, step) && step % 4 === 2) {
      drums.hit("openHat", bank[step % 8 === 6 ? track.hatOpenLong : track.hatOpen], time, 0.42);
    }

    if (cueActiveAtStep(section, "perc", sectionBar, step) && track.percSteps[step]) {
      drums.hit("perc", bank[track.shaker], time, 0.3 * accent, 0.9 + rng() * 0.25);
    }

    if (cueActiveAtStep(section, "metal", sectionBar, step)) {
      const hit = step === track.metalSteps[0] ? track.metalA : step === track.metalSteps[1] ? track.metalB : null;
      if (hit && rng() < 0.3 + 0.5 * intensity) {
        drums.hit("metal", bank[hit], time, 0.4 + 0.3 * intensity, 0.85 + rng() * 0.4);
      }
      if (barIndex % 8 === 0 && step === 0) {
        drums.hit("metal", bank[track.metalA], time, 0.55, 0.8);
      }
    }

    const bassCue = cueActiveAtStep(section, "bass", sectionBar, step);
    if (bassCue && cueStepActive(bassCue, sectionBar, step)) {
      if (rig.motifBass) {
        const cell = rig.motifBass.cells[step];
        if (cell.on) {
          const freq = isCompute
            ? midiToFrequency(rig.motifScale.rootMidi + cell.degree)
            : midiToFrequency(degreeToMidi(rig.motifScale, cell.degree));
          const longNote = bassCue.window && bassCue.window[0] === bassCue.window[1];
          const duration = longNote
            ? stepDur * 10
            : rig.motifBass.gateBeats !== null
              ? stepDur * 2 * rig.motifBass.gateBeats
              : stepDur * (intensity > 0.7 ? 0.85 : 1.5);
          voices.bass.note(time, withShift(freq, step), duration, 0.9 * accent);
        }
      } else if (layers.bass[step].on) {
        const jump = track.bassOctave[step] && intensity > 0.6 ? octave : 0;
        const degree = layers.bass[step].degree + shift + jump - octave;
        voices.bass.note(
          time,
          withShift(midiToFrequency(degreeToMidi(pattern.scale, degree)), step),
          stepDur * (intensity > 0.7 ? 0.85 : 1.5),
          0.9 * accent
        );
      }
    }

    const seqRiffCue = cueActiveAtStep(section, "seqRiff", sectionBar, step);
    if (seqRiffCue && rig.motifRiff) {
      const cell = rig.motifRiff[step];
      if (cell.on) {
        const freq = isCompute
          ? midiToFrequency(rig.motifScale.rootMidi + cell.degree + (section.seqOctave ?? 0))
          : midiToFrequency(degreeToMidi(rig.motifScale, cell.degree) + (section.seqOctave ?? 0));
        const accentMul = isMetropolis ? metropolisSeqAccent(pattern.genome, step) : 1;
        voices.seqRiff.note(time, withShift(freq, step), stepDur * 0.9, (0.5 + 0.3 * intensity) * accentMul * accent);
      }
    }

    const seqRunCue = cueActiveAtStep(section, "seqRun", sectionBar, step);
    if (seqRunCue && cueStepActive(seqRunCue, sectionBar, step)) {
      const degree = track.arp[(step + barIndex) % STEP_COUNT] + shift + octave;
      voices.seqRun.note(
        time,
        withShift(midiToFrequency(degreeToMidi(rig.motifScale, degree)), step),
        stepDur * 0.4,
        0.4 + 0.3 * intensity
      );
    }

    if (cueActiveAtStep(section, "lead", sectionBar, step)) {
      // A A B A. 한 프레이즈만 반복하면 3분을 못 버틴다.
      const phrase = barIndex % 4 === 2 ? track.leadB : layers.lead;
      if (phrase[step].on) {
        const lift = intensity > 0.9 && barIndex % 8 >= 4 ? octave : 0;
        const degree = phrase[step].degree + shift + octave + lift;
        voices.lead.note(
          time,
          withShift(midiToFrequency(degreeToMidi(pattern.scale, degree)), step),
          stepDur * 1.1,
          0.8 * accent
        );
      }
    }

    // 아르페지오는 저강도 구간에서 8분음표로 성글게, 피크에서 16분음표로 촘촘하게.
    const arpCue = cueActiveAtStep(section, "arp", sectionBar, step);
    if (arpCue && cueStepActive(arpCue, sectionBar, step)) {
      const degree = track.arp[(step + barIndex) % STEP_COUNT] + shift + octave;
      voices.arp.note(
        time,
        withShift(midiToFrequency(degreeToMidi(pattern.scale, degree)), step),
        stepDur * 0.75,
        0.45 + 0.3 * intensity
      );
    }

    if (cueActiveAtStep(section, "stab", sectionBar, step) && (step === 0 || step === 10)) {
      track.chord.forEach((chordDegree, i) => {
        stabVoices[i].note(
          time,
          withShift(midiToFrequency(degreeToMidi(pattern.scale, chordDegree + shift)), step),
          stepDur * 2,
          0.55
        );
      });
    }
  }

  if (legacyFill) {
    if (isFill && fillKind >= 0 && fillKind <= 2) {
      if (fillKind === 0) {
        const toms: SampleId[] = ["tomLow", "tomLow", "tomMid", "tomHigh"];
        toms.forEach((tom, i) => drums.hit("perc", bank[tom], at(12 + i), 0.6 + i * 0.06));
      } else if (fillKind === 1) {
        for (let i = 0; i < 4; i++) {
          drums.hit("backbeat", bank.snareTight, at(12 + i), 0.3 + i * 0.12, 1 + i * 0.05);
        }
      } else {
        drums.hit("metal", bank[track.metalB], at(14), 0.6, 0.7);
      }
    }
  } else {
    // 새 필 메커니즘(§11 단계 3): fill 배열의 주기적 필 + endFill(섹션 마지막 마디 전용).
    // 어느 역할에 꽂을지는 블루프린트별 드럼 계열이 정할 일이라 §11 단계 6 전까지는
    // kick 자리를 빌려 스텝 패턴만 검증한다.
    for (const f of section.fill) {
      if (sectionBar % f.everyBars === f.atBarInCycle) {
        for (const step of fillSteps(f.kind)) drums.hit("kick", bank[track.kick], at(step), 1);
      }
    }
    if (section.endFill && isLastBar) {
      for (const step of fillSteps(section.endFill)) drums.hit("kick", bank[track.kick], at(step), 1);
    }
  }
}

// ---------------------------------------------------------------- 렌더링

// filterCutoff(0..1)를 로우패스 컷오프 주파수(Hz)로 매핑한다. 1이면 가청 대역 위라 사실상
// 필터가 안 걸린 것처럼 들린다.
function cutoffToFrequency(cutoff: number): number {
  return 300 * Math.pow(18000 / 300, cutoff);
}

// 시드마다 보이스와 킥 조합이 달라서 그냥 두면 트랙끼리 체감 음량이 세 배씩 벌어진다.
// 평균 음량(RMS)을 기준으로 곡 전체에 같은 배수를 한 번 곱하므로 섹션 간 에너지 곡선은
// 그대로 남고, 그 과정에서 삐져나온 몇몇 피크만 tanh로 눌러 1을 안 넘게 한다.
const NORMALIZE_KNEE = 0.72;

function normalize(buffer: AudioBuffer, targetRms = 0.16): AudioBuffer {
  let square = 0;
  let count = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) square += data[i] * data[i];
    count += data.length;
  }
  if (count === 0) return buffer;

  const rms = Math.sqrt(square / count);
  if (rms <= 0) return buffer;
  const gain = Math.max(0.25, Math.min(4, targetRms / rms));

  const range = 1 - NORMALIZE_KNEE;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      const v = data[i] * gain;
      const a = v < 0 ? -v : v;
      data[i] = a <= NORMALIZE_KNEE ? v : Math.sign(v) * (NORMALIZE_KNEE + range * Math.tanh((a - NORMALIZE_KNEE) / range));
    }
  }
  return buffer;
}

// 진행률은 있으면 좋은 정도라, 지원하지 않는 브라우저(사파리는 OfflineAudioContext.suspend가
// 없다)에서 렌더링 자체를 실패시키면 안 된다. 전부 조용히 넘어간다.
function attachProgress(ctx: OfflineAudioContext, duration: number, onProgress: (ratio: number) => void): void {
  if (typeof ctx.suspend !== "function") return;
  const steps = 25;
  try {
    for (let i = 1; i < steps; i++) {
      // suspend 시각은 렌더 퀀텀(128 프레임) 경계여야 한다.
      const frames = Math.round((duration * ctx.sampleRate * i) / steps / 128) * 128;
      ctx
        .suspend(frames / ctx.sampleRate)
        .then(() => {
          onProgress(i / steps);
          return ctx.resume();
        })
        .catch(() => {});
    }
  } catch {
    // 일부 브라우저는 suspend 자체를 동기적으로 던진다.
  }
}

async function buildRig(
  pattern: Pattern,
  options: RenderOptions,
  duration: number
): Promise<{ ctx: OfflineAudioContext; rig: Rig }> {
  const { override, liveControls, onProgress } = options;
  const sampleRate = options.sampleRate || DEFAULT_SAMPLE_RATE;
  const tempo = liveControls?.tempo ?? pattern.tempo;
  const totalSamples = Math.ceil(duration * sampleRate);
  const ctx = new OfflineAudioContext(2, totalSamples, sampleRate);
  if (onProgress) attachProgress(ctx, duration, onProgress);

  const track = deriveTrack(pattern);
  const bank = await loadSampleBank(ctx, track.kit);
  const mix = buildMix(ctx, tempo, cutoffToFrequency(liveControls?.filterCutoff ?? 1));
  const noise = makeNoiseBuffer(ctx, pattern.seedHash, 1);

  const strips = Object.fromEntries(
    (Object.keys(SYNTH_STRIPS) as SynthLayer[]).map((id) => [id, buildStrip(ctx, mix, SYNTH_STRIPS[id])])
  ) as Record<SynthLayer, GainNode>;

  const motifScale =
    pattern.blueprintId === "compute"
      ? computeScale(pattern.genome)
      : pattern.blueprintId === "metropolis"
        ? metropolisScale(pattern.genome)
        : pattern.scale;
  const motifRiff =
    pattern.blueprintId === "compute"
      ? computeRiff(pattern.genome)
      : pattern.blueprintId === "metropolis"
        ? metropolisSeq(pattern.genome)
        : null;
  const motifBass =
    pattern.blueprintId === "compute"
      ? { cells: computeBass(pattern.genome), gateBeats: null }
      : pattern.blueprintId === "metropolis"
        ? (() => {
            const b = metropolisBass(pattern.genome);
            return { cells: b.cells, gateBeats: b.gateBeats };
          })()
        : null;
  // "calls" 큐는 지금 compute 블루프린트만 쓴다(§16.4). 언어는 게놈 밖 — 곡 정체성과 무관하다.
  const voiceLang: VoiceLang = pattern.seedHash % 2 === 0 ? "de" : "en";
  const voiceBank = pattern.blueprintId === "compute" ? await loadVoiceForCode(ctx, voiceLang, pattern.seedInput) : null;

  // 시그니처 사운드(§15.2): sigSlots가 있는 compute/metropolis만, 곡 하나당 S2~S6 중 하나.
  // (S1 로봇 목소리는 이미 위 voiceBank/"calls" 큐가 맡는다.)
  const usesSig = pattern.blueprintId === "compute" || pattern.blueprintId === "metropolis";
  let sigBuffer: AudioBuffer | null = null;
  if (usesSig) {
    const sigRng = mulberry32((pattern.seedHash ^ 0x51617) >>> 0);
    const kind = pick(sigRng, ["quindar", "bell", "mech", "modem", "space"] as const);
    if (kind === "quindar") sigBuffer = makeQuindarBuffer(ctx);
    else if (kind === "bell") sigBuffer = makeBellBuffer(ctx, pattern.seedHash);
    else sigBuffer = await loadSigSample(ctx, kind as SigSampleKind, Math.floor(sigRng() * 7));
  }

  // 합성 드럼 킷(§14.2 K): compute/metropolis는 legacy 샘플 대신 자기 킷으로 킥·백비트·햇을 낸다.
  const synthKit =
    pattern.blueprintId === "compute"
      ? await loadSynthKit(ctx.sampleRate, "circuit", pattern.seedHash)
      : pattern.blueprintId === "metropolis"
        ? await loadSynthKit(ctx.sampleRate, "skyline", pattern.seedHash)
        : null;

  const rig: Rig = {
    ctx,
    mix,
    drums: createDrumMixer(ctx, mix, totalSamples),
    voices: {
      bass: createVoice(ctx, strips.bass, pattern.bassVoice, noise, duration, 0.6),
      lead: createVoice(ctx, strips.lead, pattern.leadVoice, noise, duration, 0.25),
      arp: createVoice(ctx, strips.arp, "square", noise, duration, 0.45),
      seqRiff: createVoice(ctx, strips.seqRiff, "triSub", noise, duration, 0.4),
      seqRun: createVoice(ctx, strips.seqRun, "sawUnison", noise, duration, 0.35),
    },
    stabVoices: [0, 1, 2].map(() => createVoice(ctx, strips.stab, "sawUnison", noise, duration, 0.4)),
    strips,
    bank,
    pattern,
    track,
    layers: resolveLayers(pattern, override),
    noise,
    stepDur: secondsPerStep(tempo),
    motifScale,
    motifRiff,
    motifBass,
    voiceBank,
    sigBuffer,
    synthKit,
  };

  return { ctx, rig };
}

/** 3분짜리 전체 트랙. 섹션마다 레이어, 음량, 필터가 전부 바뀐다. */
export async function renderArrangement(pattern: Pattern, options: RenderOptions = {}): Promise<AudioBuffer> {
  const tempo = options.liveControls?.tempo ?? pattern.tempo;
  const arrangement = arrangementFor(pattern, tempo);
  // 리버브/딜레이 꼬리가 잘리지 않게 뒤에 여유를 둔다.
  const duration = arrangement.totalSeconds + 3;
  const { ctx, rig } = await buildRig(pattern, options, duration);

  for (const section of arrangement.sections) {
    const start = section.startBar * arrangement.barSeconds;
    const length = section.bars * arrangement.barSeconds;

    rig.mix.tone.frequency.setValueAtTime(section.filter.from, start);
    rig.mix.tone.frequency.exponentialRampToValueAtTime(Math.max(120, section.filter.to), start + length);

    // 킥 저역 컷 (§11 단계 5, §16.4 metropolis 아웃트로용). 지금은 어떤 섹션도 kickLowCut을
    // 안 써서 이 블록이 안 걸린다 — kickHighpass는 항상 20Hz(무영향) 그대로다.
    if (section.kickLowCut) {
      rig.drums.kickHighpass.frequency.setValueAtTime(section.kickLowCut.from, start);
      rig.drums.kickHighpass.frequency.exponentialRampToValueAtTime(
        Math.max(20, section.kickLowCut.to),
        start + length
      );
    }

    // 에너지 곡선. 인트로와 피크가 같은 음량으로 나오면 3분 내내 평평하게 들린다.
    const level = 0.42 + 0.48 * section.intensity;
    rig.mix.master.gain.setValueAtTime(level, start);
    rig.mix.master.gain.linearRampToValueAtTime(level, start + length * 0.85);

    if (section.cues.some((cue) => cue.layer === "pad")) {
      schedulePad(ctx, rig.strips.pad, pattern.scale, rig.track.chord[0], start, length);
    }
    if (section.cues.some((cue) => cue.layer === "riser")) {
      scheduleRiser(ctx, rig.strips.riser, rig.noise, start, length);
    }
    if (section.cues.some((cue) => cue.layer === "drone")) {
      scheduleDrone(ctx, rig.strips.drone, rig.motifScale, -rig.motifScale.intervals.length, start, length);
    }
    if (section.cues.some((cue) => cue.layer === "glide")) {
      for (let b = 0; b < section.bars; b += 2) {
        const gStart = start + b * arrangement.barSeconds;
        const gLength = Math.min(2, section.bars - b) * arrangement.barSeconds;
        scheduleGlide(ctx, rig.strips.glide, rig.motifScale, 0, 7, gStart, gLength);
      }
    }
    // 자유박 섹션(metropolis freeIntro)의 베이스 롱노트: scheduleBar가 이 섹션을 통째로
    // 건너뛰므로 섹션 단위로 직접 켠다.
    if (section.freeTime && section.cues.some((cue) => cue.layer === "bass")) {
      scheduleDrone(ctx, rig.strips.bass, rig.motifScale, -rig.motifScale.intervals.length, start, length);
    }

    for (let sectionBar = 0; sectionBar < section.bars; sectionBar++) {
      const barIndex = section.startBar + sectionBar;
      const rng = mulberry32((pattern.seedHash ^ ((barIndex + 1) * 0x9e3779b1)) >>> 0);
      scheduleBar(rig, section, barIndex, sectionBar, barIndex * arrangement.barSeconds, rng, arrangement.swing);
    }
  }

  rig.drums.connect();
  return normalize(await ctx.startRendering());
}

// 매트릭스 에디터와 크로스헤어용 한 마디 미리듣기. 전체 편곡을 다시 렌더링하면
// 셀 하나 누를 때마다 몇 초씩 걸려서, 여기서는 피크에 해당하는 한 마디만 뽑아 반복 재생한다.
// legacyCue를 그대로 써서 옛 hatOn/베이스/아르페지오 게이트(§16.7)와 fixture가 계속 맞는다.
const PREVIEW_LAYERS: LayerId[] = ["kick", "hat", "openHat", "backbeat", "perc", "metal", "bass", "lead"];
const PREVIEW_INTENSITY = 0.85;
const PREVIEW_SECTION: Section = {
  id: "preview",
  startBar: 0,
  // 1로 두면 scheduleBar가 "섹션 마지막 마디"로 보고 필을 넣어버린다.
  bars: 8,
  intensity: PREVIEW_INTENSITY,
  cues: PREVIEW_LAYERS.map((layer) => legacyCue(layer, PREVIEW_INTENSITY)),
  drumFamily: "none",
  fill: [],
  filter: { from: 18000, to: 18000 },
};

export async function renderLoopBuffer(pattern: Pattern, options: RenderOptions = {}): Promise<AudioBuffer> {
  const tempo = options.liveControls?.tempo ?? pattern.tempo;
  const duration = loopDurationSeconds(tempo);
  const { ctx, rig } = await buildRig(pattern, { ...options, onProgress: undefined }, duration);

  rig.mix.tone.frequency.value = PREVIEW_SECTION.filter.from;
  rig.mix.master.gain.value = 0.85;
  const rng = mulberry32((pattern.seedHash ^ 0x9e3779b1) >>> 0);
  const swing = blueprintById(pattern.blueprintId).swing;
  scheduleBar(rig, PREVIEW_SECTION, 0, 0, 0, rng, swing);

  rig.drums.connect();
  return normalize(await ctx.startRendering());
}
