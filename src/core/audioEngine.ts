import { degreeToMidi, midiToFrequency, type Scale } from "./scales";
import { hashRand, mulberry32, pick } from "./prng";
import { STEP_COUNT, type Pattern, type StepCell } from "./pattern";
import { resolveLayers, type PatternOverride, type ResolvedLayers } from "./patternOverride";
import { effectiveTempo, type CrosshairControl } from "./crosshairControl";
import type { VoiceId } from "./voices";
import { loadSampleBank, type SampleBank, type SampleId } from "./samples";
import { buildArrangement, type Arrangement, type Section } from "./arrangement";
import {
  blueprintFamily,
  cueActiveAtStep,
  cueFor,
  fillSteps,
  rateAt,
  rateStepActive,
  rateStepVelocity,
  semitoneShift,
  type Blueprint,
  type BlueprintId,
  type FillKind,
  type LayerCue,
  type LayerId,
} from "./blueprint";
import { resolvedBlueprintFor } from "./blueprints";
import { legacyCue } from "./blueprints/legacy";
import { targetSecondsFor, targetSecondsForStyle } from "./genome";
import {
  chopPlan,
  dChordRootAt,
  fChordRootAt,
  hookPlan,
  pChordRootAt,
  styleBass,
  styleDrumMaps,
  styleRiff,
  type ChopNote,
  type DrumMap,
  type HookNote,
} from "./styleMotifs";
import { loadStyleKit, loadSub808 } from "./drumSynth";
import {
  computeBass,
  computeRiff,
  computeScale,
  familyDrumHit,
  fourFloorGhostStep,
  metropolisBass,
  metropolisHarmonyShifts,
  metropolisScale,
  metropolisSeq,
  metropolisSeqAccent,
} from "./motifs";
import { deriveTrack, type Track } from "./track";
import { loadVoiceForCode, type VoiceLang } from "./voiceBank";
import { loadSigSample, type SigSampleKind } from "./sigBank";
import { loadSynthKit, type SynthKit } from "./drumSynth";
import { ROLE_TO_USER_SLOT, USER_SLOTS, type UserSlot } from "./userKit";
import { loadTonalSample } from "./tonalBank";

/** stepsPerBar 기본값 16(4분음표 하나에 16분 4칸). 12(8분 셋잇단, shuffle12 §6.2)는 한 마디를
 *  12칸으로 나눈다 — 마디 길이(barSeconds = 60/bpm×4)는 그대로고 칸 폭만 달라진다. */
export function secondsPerStep(tempo: number, stepsPerBar: 16 | 12 = 16): number {
  return (60 / tempo) * 4 / stepsPerBar;
}

/** 한 마디(4/4) 길이. */
export function loopDurationSeconds(tempo: number, stepsPerBar: 16 | 12 = 16): number {
  return secondsPerStep(tempo, stepsPerBar) * stepsPerBar;
}

// 260927: 길이 계산이 open(genome.length)과 스타일 코드(styleGenome.length)에서 다른 곳에
// 있어서 하나로 모은다.
function targetSecondsForPattern(pattern: Pattern): number {
  return pattern.style === "open" ? targetSecondsFor(pattern.genome) : targetSecondsForStyle(pattern.styleGenome!);
}

/** tempo는 실제 BPM이어야 한다(§6.6) — 크로스헤어 단위 그대로 넘기면 tempoScale이 있는
 *  블루프린트에서 길이·타이밍이 어긋난다. 호출부는 effectiveTempo(pattern, control)를 쓴다. */
export function arrangementFor(pattern: Pattern, tempo: number): Arrangement {
  return buildArrangement(resolvedBlueprintFor(pattern), tempo, targetSecondsForPattern(pattern));
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
  /**
   * 전체 렌더링이 끝나기 전에도, 지금까지 렌더된 앞부분만 담은 프리뷰 버퍼를 주기적으로
   * 넘겨준다(§UX: 앞부분만 먼저 재생/이동 가능하게). 최종 버퍼(정규화 완료)는 여기로 오지
   * 않고 항상 `renderArrangement`의 반환값으로만 온다.
   */
  onChunk?: (buffer: AudioBuffer, readySamples: number) => void;
  /**
   * 내 소리(§15.4). 원본 ArrayBuffer로 받는다 — decodeAudioData가 컨텍스트에 따라 다른
   * 샘플레이트로 디코딩하므로(§1.3 샘플뱅크 주석과 같은 이유), 실제 렌더링에 쓰는
   * OfflineAudioContext로 그때그때 디코딩해야 한다(미리 디코딩해서 캐시해 두면 재생
   * 컨텍스트와 샘플레이트가 어긋날 수 있다). 슬롯에 파일이 여러 개면 buildRig가 곡 하나
   * 동안 고정으로 쓸 것 하나를 시드로 고른다. 슬롯이 비어 있으면 그 역할은 원래 소리를 쓴다.
   */
  userKit?: Partial<Record<UserSlot, ArrayBuffer[]>> | null;
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

// §6.5 item 2 / §4.1 D10(테이프 히스). Paul Kellet의 3단 근사 — 실시간 필터 노드 대신 짧은
// 루프 버퍼 하나로 미리 굽는다(§1.4 성능 규칙, makeNoiseBuffer와 같은 방식).
function makePinkNoiseBuffer(ctx: BaseAudioContext, seed: number, seconds: number): AudioBuffer {
  const length = Math.round(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const rng = mulberry32(seed);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < length; i++) {
    const white = rng() * 2 - 1;
    b0 = 0.99765 * b0 + white * 0.099046;
    b1 = 0.963 * b1 + white * 0.2965164;
    b2 = 0.57 * b2 + white * 1.0526913;
    data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.11;
  }
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

// 렌더링이 끝나기 전에 지금까지 나온 PCM을 그대로 가로채 미리듣기용 버퍼를 만든다.
// ponytail: ScriptProcessorNode는 폐기 예정 API지만, 오프라인 렌더 도중 동기 콜백으로
// 신호를 그대로 복사할 수 있는 가장 단순한 방법이다. 실제 출력 경로에는 끼지 않고
// (게인 0인 노드로만 destination에 연결) 관찰만 하므로 최종 믹스에는 영향이 없다.
// AudioWorkletNode로 옮기려면 별도 모듈 로드가 필요해서 지금 목적에는 과하다.
function attachChunkTap(
  ctx: BaseAudioContext,
  source: AudioNode,
  totalSamples: number,
  onChunk: (buffer: AudioBuffer, readySamples: number) => void
): void {
  const CHUNK_FRAMES = 4096;
  const CHANNELS = 2;
  const tap = ctx.createScriptProcessor(CHUNK_FRAMES, CHANNELS, CHANNELS);
  const accum = Array.from({ length: CHANNELS }, () => new Float32Array(totalSamples));
  let cursor = 0;
  let calls = 0;
  tap.onaudioprocess = (e) => {
    const take = Math.min(e.inputBuffer.length, Math.max(0, totalSamples - cursor));
    for (let c = 0; c < CHANNELS; c++) {
      if (take > 0) accum[c].set(e.inputBuffer.getChannelData(c).subarray(0, take), cursor);
    }
    cursor = Math.min(totalSamples, cursor + e.inputBuffer.length);
    calls++;
    // 콜백마다(4096프레임, 44.1kHz에서 ~93ms) 만들면 너무 잦으니 8번에 한 번(~0.75초)만.
    if (cursor > 0 && (calls % 8 === 0 || cursor >= totalSamples)) {
      const preview = new AudioBuffer({ length: cursor, numberOfChannels: CHANNELS, sampleRate: ctx.sampleRate });
      for (let c = 0; c < CHANNELS; c++) preview.copyToChannel(accum[c].subarray(0, cursor), c);
      onChunk(preview, cursor);
    }
  };
  const sink = ctx.createGain();
  sink.gain.value = 0;
  source.connect(tap);
  tap.connect(sink);
  sink.connect(ctx.destination);
}

function buildMix(
  ctx: BaseAudioContext,
  tempo: number,
  liveCutoffHz: number,
  chunkTap?: { totalSamples: number; onChunk: (buffer: AudioBuffer, readySamples: number) => void },
  lofi?: { lowpassHz: number }
): Mix {
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 3;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.14;
  limiter.connect(ctx.destination);
  if (chunkTap) attachChunkTap(ctx, limiter, chunkTap.totalSamples, chunkTap.onChunk);

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

  if (lofi) {
    // §6.5 item 2(Delroy 로파이 체인): 모노 합산(0.85 비율) → 로우패스(게놈 tape) → 저중역
    // 피킹 +3dB@180Hz → 테이프 새추레이션. tone 앞에 끼운다.
    const splitter = ctx.createChannelSplitter(2);
    rumbleCut.connect(splitter);
    const monoAvg = ctx.createGain();
    monoAvg.gain.value = 0.5 * 0.85;
    splitter.connect(monoAvg, 0);
    splitter.connect(monoAvg, 1);
    const merger = ctx.createChannelMerger(2);
    monoAvg.connect(merger, 0, 0);
    monoAvg.connect(merger, 0, 1);
    const dry = ctx.createGain();
    dry.gain.value = 0.15;
    rumbleCut.connect(dry);

    const lofiLowpass = ctx.createBiquadFilter();
    lofiLowpass.type = "lowpass";
    lofiLowpass.frequency.value = lofi.lowpassHz;
    lofiLowpass.Q.value = 0.7;
    merger.connect(lofiLowpass); // 두 입력(모노 성분 + 드라이)이 자동으로 합쳐진다
    dry.connect(lofiLowpass);

    const peaking = ctx.createBiquadFilter();
    peaking.type = "peaking";
    peaking.frequency.value = 180;
    peaking.gain.value = 3;
    lofiLowpass.connect(peaking);

    const tapeSaturator = ctx.createWaveShaper();
    tapeSaturator.curve = makeSaturationCurve(2.4);
    peaking.connect(tapeSaturator);

    tapeSaturator.connect(tone);
  } else {
    rumbleCut.connect(tone);
  }

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

export type DrumRole =
  | "kick"
  | "hat"
  | "openHat"
  | "backbeat"
  | "clap"
  | "perc"
  | "metal"
  | "lowDrum"
  | "tick"
  | "calls"
  | "sig"
  | "tonal"
  | "sub"
  | "chop"
  | "dialogue"
  | "clapLayer"
  | "texture";

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
  // 260927 §13.6 신규. 새 블루프린트(d/p/f)의 clap 레이어 전용 — backbeat와 자리가 겹치지
  // 않게 따로 둔다.
  clap: { level: 0.6, pan: 0, send: 0.12 },
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
  // VCSL 톤(§15.3, stab 위에 겹치는 샘플). stab과 비슷한 자리(약간 오른쪽, 리버브 많이).
  tonal: { level: 0.5, pan: 0.1, send: 0.3 },
  // 260927 §13.6 신규 (f switchUp). 킥 버스(kickHighpass)를 같이 쓴다.
  sub: { level: 1.0, pan: 0, send: 0.0 },
  // 260927 §13.6 신규 (p 찬트 / f 목소리 조각). hitSlice로만 친다.
  chop: { level: 0.75, pan: 0, send: 0.25 },
  // 260927 §13.6 신규 (d 대사). hitSlice로만 친다.
  dialogue: { level: 0.7, pan: 0, send: 0.2 },
  // 260927 §13.6 신규 (f 빌드업 클랩, 킥 없는 구간 전용 — 사이드체인 안 건다).
  clapLayer: { level: 0.55, pan: 0, send: 0.15 },
  // 260927 §13.6 신규 (d 테이프 히스 / f 일상 소리 베드). 루프 버퍼라 레벨을 낮게 잡는다.
  texture: { level: 0.3, pan: 0, send: 0 },
};

const KICK_BUS_ROLES: readonly DrumRole[] = ["kick", "lowDrum", "sub"];

export interface DrumMixer {
  hit(role: DrumRole, sample: AudioBuffer, time: number, level: number, rate?: number): void;
  /**
   * 260927 §13.6 신규. hit과 같은 방식으로 버퍼의 [offsetSec, offsetSec+durSec) 구간만
   * 재생한다(§6.4 chop/dialogue). 끝 5ms는 페이드아웃해서 자른 자리가 안 튄다.
   */
  hitSlice(
    role: DrumRole,
    buffer: AudioBuffer,
    offsetSec: number,
    durSec: number,
    time: number,
    level: number,
    rate?: number
  ): void;
  /** 믹싱이 다 끝난 뒤에 부른다. 버퍼를 소스에 물려 그래프에 연결한다. */
  connect(): void;
  /**
   * 킥·lowDrum만 지나는 하이패스. §11 단계 6의 metropolis 아웃트로(kickLowCut, §16.4)가
   * 이 frequency를 20Hz(사실상 무영향) → 최대 몇백Hz로 오토메이션해서 저역만 뺀다.
   * 지금은 아무 섹션도 kickLowCut을 안 써서 항상 20Hz 그대로다 — 소리에 영향 없다.
   */
  kickHighpass: BiquadFilterNode;
}

function createDrumMixer(ctx: BaseAudioContext, mix: Mix, totalSamples: number, panScale = 1): DrumMixer {
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
      const angle = ((spec.pan * panScale + 1) * Math.PI) / 4;
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

    hitSlice(role, buffer, offsetSec, durSec, time, level, rate = 1) {
      const spec = DRUM_VOICES[role];
      const amount = spec.level * level;
      const angle = ((spec.pan * panScale + 1) * Math.PI) / 4;
      const gl = amount * Math.cos(angle) * Math.SQRT2;
      const gr = amount * Math.sin(angle) * Math.SQRT2;
      const gs = amount * spec.send;
      const [outLeft, outRight] = KICK_BUS_ROLES.includes(role) ? [kickLeft, kickRight] : [left, right];

      const data = buffer.getChannelData(0);
      const start = Math.round(time * ctx.sampleRate);
      if (start >= totalSamples) return;

      const offsetFrames = Math.round(offsetSec * ctx.sampleRate);
      const durFrames = Math.round(durSec * ctx.sampleRate);
      const fadeFrames = Math.round(0.005 * ctx.sampleRate);
      const availableSrc = data.length - offsetFrames;
      if (availableSrc <= 1) return;
      // hit()의 rate!=1 분기와 같은 이유로 보간용 여유 한 칸을 남긴다.
      const frames = Math.min(durFrames, Math.floor((availableSrc - 1) / rate), totalSamples - start);
      for (let i = 0; i < frames; i++) {
        const pos = offsetFrames + i * rate;
        const k = pos | 0;
        const frac = pos - k;
        const v = data[k] + (data[k + 1] - data[k]) * frac;
        const fade = i >= frames - fadeFrames ? Math.max(0, (frames - i) / fadeFrames) : 1;
        const j = start + i;
        outLeft[j] += v * gl * fade;
        outRight[j] += v * gr * fade;
        send[j] += v * gs * fade;
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

// §6.5 item 4(신스 폭). 좌 0ms/우 12ms의 짧은 스테레오 딜레이 하나로 폭을 넓힌다 — 하스
// 효과. width는 이 딜레이 신호를 얼마나 섞을지(0=원래 그대로, 1=완전히 벌어진 소리).
function widenStereo(ctx: BaseAudioContext, input: AudioNode, width: number): AudioNode {
  const splitter = ctx.createChannelSplitter(2);
  input.connect(splitter);
  const delayR = ctx.createDelay(0.02);
  delayR.delayTime.value = 0.012;
  splitter.connect(delayR, 1);
  const merger = ctx.createChannelMerger(2);
  splitter.connect(merger, 0, 0);
  delayR.connect(merger, 0, 1);

  const wet = ctx.createGain();
  wet.gain.value = width;
  merger.connect(wet);
  const dry = ctx.createGain();
  dry.gain.value = 1 - width;
  input.connect(dry);

  const out = ctx.createGain();
  wet.connect(out);
  dry.connect(out);
  return out;
}

function buildStrip(ctx: BaseAudioContext, mix: Mix, spec: StripSpec, destBus?: GainNode, width?: number): GainNode {
  const input = ctx.createGain();
  input.gain.value = spec.level;
  const panner = ctx.createStereoPanner();
  panner.pan.value = spec.pan;
  input.connect(panner);
  const tail = width !== undefined && width > 0 ? widenStereo(ctx, panner, width) : panner;
  tail.connect(destBus ?? mix.music);
  if (spec.reverb > 0) {
    const send = ctx.createGain();
    send.gain.value = spec.reverb;
    tail.connect(send);
    send.connect(mix.reverbSend);
  }
  if (spec.delay > 0) {
    const send = ctx.createGain();
    send.gain.value = spec.delay;
    tail.connect(send);
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
  /**
   * 260927 §7.1 신규. decayRatio까지 내려가는 시간을 noteDuration×0.8 대신 고정 ms로 쓴다
   * (fmEPiano의 해머 벨처럼 노트 길이와 무관하게 항상 짧게 끝나야 하는 엔벨로프).
   */
  decayMs?: number;
}

export interface MonoVoice {
  note(time: number, freq: number, duration: number, level: number): void;
}

/**
 * 트랙 전체를 도는 모노 신스 하나. 노트마다 노드를 만드는 대신 여기에 오토메이션만 쌓는다.
 * 모노라서 한 레이어 안에서는 노트가 겹치지 않는다는 뜻인데, 시퀀서 기반 일렉트로닉에서는
 * 오히려 그게 제대로 된 동작이다.
 */
// §7.1 전역 행(테이프 워블, d 전용): 0.45Hz 오실레이터 → 게인(±8센트). 반환 노드를 원하는
// 만큼 여러 오실레이터의 detune에 fan-out으로 연결하면 된다 — 곡당 노드 2개로 끝난다.
function createTapeWobble(ctx: BaseAudioContext, duration: number): AudioNode {
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.45;
  const depth = ctx.createGain();
  depth.gain.value = 8;
  lfo.connect(depth);
  lfo.start(0);
  lfo.stop(duration);
  return depth;
}

function createVoice(
  ctx: BaseAudioContext,
  destination: AudioNode,
  voiceId: VoiceId,
  noiseBuffer: AudioBuffer,
  duration: number,
  filterEnv: number,
  detuneMod?: AudioNode
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
  // 260927 §7.1: 0이면 예전처럼 noteDuration에 비례해서 꺼진다(기존 6종, 불변). >0이면 그
  // 릴리스 시간을 최소로 보장한다 — 새 보이스는 노트 길이와 무관하게 자기 릴리스로 운다.
  let release = 0;
  // organBass 전용 키 클릭(§7.1). 노트마다 짧게 열었다 닫는 별도 게인 — persistent 노이즈
  // 소스 하나를 계속 돌리고 게인만 펄스 쳐서 R8(노트마다 노드 생성 금지)을 지킨다.
  let click: GainNode | null = null;

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
    // 260927 §7.1 신규 5종. 전부 모노 보이스 1개 + 오토메이션 원칙 그대로다.
    case "organBass": {
      // 드로바 8·8·8 근사: f + 2f(0.5) + 3f(0.25).
      osc("sine", 1, 0, amp);
      const g2 = ctx.createGain();
      g2.gain.value = 0.5;
      g2.connect(amp);
      osc("sine", 2, 0, g2);
      const g3 = ctx.createGain();
      g3.gain.value = 0.25;
      g3.connect(amp);
      osc("sine", 3, 0, g3);

      // 키 클릭: 노이즈 3ms, −18dB(≈0.126).
      const clickNoise = ctx.createBufferSource();
      clickNoise.buffer = noiseBuffer;
      clickNoise.loop = true;
      click = ctx.createGain();
      click.gain.value = 0;
      clickNoise.connect(click);
      click.connect(amp);
      clickNoise.start(0);
      clickNoise.stop(duration);

      attack = 0.004;
      release = 0.06;
      peak = 0.22;
      break;
    }
    case "formantVox": {
      // ponytail: 모음은 항상 "a"로 고정한다. 실제 찬트 음절(§7.7 hookPlan/chopPlan)이
      // 어느 슬롯에 어느 모음을 줄지는 그 계획을 짜는 단계(§11 단계 9)에서 정해진다 —
      // note()의 (time,freq,duration,level) 네 인자만으로는 모음을 못 골라서, 지금은
      // 이 보이스가 "포먼트 신스"라는 것만 만들어 둔다. 그때 가서 모음별 보이스를 여러
      // 개 두거나 note()에 인자를 늘리거나 고르면 된다.
      const source = ctx.createGain();
      const sawOsc = osc("sawtooth", 1, 0, source);
      const pulseGain = ctx.createGain();
      pulseGain.gain.value = 0.4;
      pulseGain.connect(source);
      const pulseOsc = osc("square", 1, 0, pulseGain);

      // 모음 "a": F1 800 / F2 1150 / F3 2900, Q 8/10/12.
      for (const [freq, q] of [
        [800, 8],
        [1150, 10],
        [2900, 12],
      ] as const) {
        const formant = ctx.createBiquadFilter();
        formant.type = "bandpass";
        formant.frequency.value = freq;
        formant.Q.value = q;
        source.connect(formant);
        formant.connect(amp);
      }

      // 비브라토 5.2Hz ±15센트(detune). ponytail: "노트 시작 150ms 뒤부터"는 노트마다
      // 게이트를 새로 걸어야 해서(R8 위반 없이 하려면 게인 오토메이션 하나가 더 필요하다)
      // 생략하고 항상 걸어 둔다 — 길게 우는 찬트음이라 초반 10분의 1초 차이는 티가 잘 안 난다.
      const vibrato = ctx.createOscillator();
      vibrato.type = "sine";
      vibrato.frequency.value = 5.2;
      const vibratoDepth = ctx.createGain();
      vibratoDepth.gain.value = 15;
      vibrato.connect(vibratoDepth);
      vibrato.start(0);
      vibrato.stop(duration);
      vibratoDepth.connect(sawOsc.detune);
      vibratoDepth.connect(pulseOsc.detune);

      attack = 0.012;
      release = 0.09;
      peak = 0.24;
      break;
    }
    case "fmEPiano": {
      const carrier = ctx.createOscillator();
      carrier.type = "sine";
      carrier.frequency.value = 220;
      carrier.connect(amp);
      carrier.start(0);
      carrier.stop(duration);
      targets.push({ param: carrier.frequency, ratio: 1 });

      // 본체: 모듈레이터 비율 1:1, 인덱스 2.2 → 0.3, 400ms.
      const modGain = ctx.createGain();
      modGain.gain.value = 1;
      modGain.connect(carrier.frequency);
      targets.push({ param: modGain.gain, ratio: 2.2, decayRatio: 0.3, decayMs: 400 });
      osc("sine", 1, 0, modGain);

      // 해머 벨: 모듈레이터 비율 14, 인덱스 0.4, 30ms.
      const hammerGain = ctx.createGain();
      hammerGain.gain.value = 1;
      hammerGain.connect(carrier.frequency);
      targets.push({ param: hammerGain.gain, ratio: 0.4, decayRatio: 0.02, decayMs: 30 });
      osc("sine", 14, 0, hammerGain);

      attack = 0.002;
      release = 1.2;
      peak = 0.22;
      break;
    }
    case "superPad": {
      // 톱니 3개, ±0/±9/±15센트.
      osc("sawtooth", 1, 0, amp);
      osc("sawtooth", 1, 9, amp);
      osc("sawtooth", 1, -15, amp);
      attack = 0.35;
      release = 1.2;
      peak = 0.16;
      break;
    }
    case "cheapSynth": {
      const sq = osc("square", 1, 0, amp);
      const sawGain = ctx.createGain();
      sawGain.gain.value = 0.5;
      sawGain.connect(amp);
      const saw = osc("sawtooth", 1, 6, sawGain);
      // 로파이의 테이프 워블(§7.1 전역 행): 게놈 tape가 있는 스타일(d)만 buildRig가 넘겨준다.
      detuneMod?.connect(sq.detune);
      detuneMod?.connect(saw.detune);

      // 로우패스 고정 2.2kHz. filterEnv 기반 스윕 필터(위 공용 블록)와는 별개로 항상 켜져
      // 있어야 해서, amp 뒤에 직접 끼워 넣는다.
      amp.disconnect(target);
      const fixedLowpass = ctx.createBiquadFilter();
      fixedLowpass.type = "lowpass";
      fixedLowpass.frequency.value = 2200;
      amp.connect(fixedLowpass);
      fixedLowpass.connect(target);

      attack = 0.003;
      release = 0.04;
      peak = 0.2;
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
          const decayAt = time + (t.decayMs !== undefined ? t.decayMs / 1000 : noteDuration * 0.8);
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
      if (click) {
        // 260927 §7.1 organBass 키 클릭: 3ms, −18dB(≈0.126).
        click.gain.setValueAtTime(0.126, time);
        click.gain.setValueAtTime(0.126, time + 0.003);
        click.gain.linearRampToValueAtTime(0, time + 0.006);
      }
      const tail = Math.max(noteDuration, release);
      amp.gain.setValueAtTime(0.0001, time);
      amp.gain.linearRampToValueAtTime(peak * level, time + attack);
      amp.gain.exponentialRampToValueAtTime(0.0001, time + attack + tail);
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

// Karoryfer 오르간 톤(§15.3, "pad 대용")을 신스 패드 위에 겹친다. loop=true로 원본 길이를
// 넘겨 섹션 전체를 채우고, schedulePad와 같은 모양의 attack/release 게인 봉투를 씌운다.
function scheduleSampledPad(
  ctx: BaseAudioContext,
  destination: AudioNode,
  buffer: AudioBuffer,
  start: number,
  length: number
): void {
  const attack = Math.min(2.5, length * 0.3);
  const release = Math.min(3, length * 0.35);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(0.35, start + attack);
  gain.gain.setValueAtTime(0.35, start + length - release);
  gain.gain.linearRampToValueAtTime(0, start + length);
  gain.connect(destination);

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(gain);
  source.start(start);
  source.stop(start + length);
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
  /** 내 소리(§15.4). 슬롯마다 곡 하나 동안 고정으로 쓸 버퍼 하나. 없으면 기본 소리 그대로. */
  userKitBuffers: Partial<Record<UserSlot, AudioBuffer>> | null;
  /** VCSL/Karoryfer 톤(§15.3). track.tonalKit이 null이면 안 채운다. */
  tonalBuffer: AudioBuffer | null;
  /** 260927 §13.6 신규. pattern.blueprintId로 고른 블루프린트 그 자체 — sidechain/kitFamily/
   *  lofi처럼 Pattern이 아니라 Blueprint에만 있는 값을 scheduleStyleBar가 읽을 때 쓴다. */
  blueprint: Blueprint;
  /** 260927 §6.1 신규. 새 블루프린트(d/p/f)의 드럼 중요도·세기표(styleDrumMaps 결과).
   *  open/k는 항상 null — scheduleBar가 이 값의 유무로 옛 경로/scheduleStyleBar를 가른다. */
  styleMaps: Partial<Record<LayerId, DrumMap>> | null;
  /** 260927 §13.6 신규. 새 블루프린트 드럼 원샷(§7.2 tape/house/garage 프리셋). blueprint에
   *  kitFamily가 있을 때만 채운다. */
  styleKit: Partial<Record<DrumRole, AudioBuffer>> | null;
  /** 260927 §13.6 신규. `kitSwap: "sub808"` 섹션 동안 대신 쓰는 킷(f switchUp, 단계 10). */
  sub808Kit: Partial<Record<DrumRole, AudioBuffer>> | null;
  /** 260927 §6.5 신규. 베이스 전용 사이드체인 버스 — blueprint.sidechain이 있을 때만 채운다.
   *  없으면 베이스도 지금처럼 mix.music → mix.sidechain 공유 펌핑을 그대로 탄다. */
  bassSidechain: GainNode | null;
  /** 260927 §7.7 신규. p `chop` 찬트 후크(2마디 고정 패턴). p가 아니면 null. */
  hookPlan: readonly HookNote[] | null;
  /** 260927 §6.4.1/§7.7 신규. f `chop` 목소리 조각 계획(2마디 고정 패턴). f가 아니면 null. */
  chopPlan: readonly ChopNote[] | null;
  /** 260927 §6.4.1 신규. chop이 실제로 자를 소스 풀 — 내 소리 voice 슬롯 1개뿐이다(CC0
   *  말소리 풀은 §8.2 소싱 전). 비어 있으면 formantVox 합성으로 대신한다(로봇 목소리는
   *  일부러 안 쓴다 — k 색이 묻어난다, §11 사용자 청취 피드백). */
  chopPool: readonly AudioBuffer[];
  /** 260927 §7.1/§7.4 신규. p·f `chord` 레이어가 이 마디에 잡을 코드 뿌리(스케일 디그리).
   *  p/f가 아니면 null. */
  chordRootAt: ((barIndex: number, isBreak?: boolean) => number) | null;
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

  // 260927 §13.6 item 6: 새 블루프린트(d/p/f, styleMaps가 있다)는 완전히 분리된 경로를
  // 탄다 — 블루프린트를 9개 늘려도 이 아래 v2 본문은 한 줄도 안 자란다.
  if (rig.styleMaps) {
    scheduleStyleBar(rig, section, barIndex, sectionBar, barStart, swing);
    return;
  }

  const { mix, drums, voices, stabVoices, bank, pattern, track, layers, stepDur } = rig;
  // 내 소리(§15.4): 역할이 매핑되는 슬롯에 사용자가 채워 둔 버퍼가 있으면 그걸 대신 튼다.
  const playHit = (role: DrumRole, sample: AudioBuffer, time: number, level: number, rate?: number) => {
    const slot = ROLE_TO_USER_SLOT[role];
    const override = slot ? rig.userKitBuffers?.[slot] : undefined;
    drums.hit(role, override ?? sample, time, level, rate);
  };
  const intensity = section.intensity;
  const family = blueprintFamily(pattern.blueprintId);
  const isCompute = family === "compute";
  const isMetropolis = family === "metropolis";
  const familyHit =
    isCompute || isMetropolis ? familyDrumHit(section.drumFamily, pattern.genome, barIndex, pattern.blueprintId) : null;
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
  // metropolis 화성 이동(§5.10/§16.4): 블루프린트 harmony의 semitones는 실제 반음 수가
  // 아니라 자리 표시다(0=제자리, 1=metropolisHarmonyShifts()[0], 2=[1]) — 실제 이동 폭은
  // 게놈 mode가 고른다. metropolis 섹션은 transpose를 안 쓰므로 semitoneShift의 반환값이
  // 곧 그 표시값 그대로다.
  const metropolisShifts = isMetropolis ? metropolisHarmonyShifts(pattern.genome) : null;
  const semitones = (step: number) => {
    const raw = semitoneShift(section, sectionBar, step);
    if (!metropolisShifts) return raw;
    if (raw === 1) return metropolisShifts[0];
    if (raw === 2) return metropolisShifts[1];
    return raw;
  };
  const withShift = (freq: number, step: number) => freq * 2 ** (semitones(step) / 12);

  if (sectionBar === 0 && intensity > 0.28) {
    playHit("metal", bank[track.cymbal], barStart, 0.5);
  }

  // 로봇 목소리(§15.2 S1): 마디마다 시드 코드 한 글자씩, 순서대로. 스텝 단위가 아니라
  // 마디당 한 번이라 window/rate 대신 cueFor로만 "이 마디에 켜져 있는가"를 본다.
  if (rig.voiceBank && cueFor(section, "calls", sectionBar)) {
    const code = pattern.seedInput;
    const char = code[barIndex % code.length];
    const buf = rig.voiceBank.get(char);
    if (buf) playHit("calls", buf, barStart, 0.8);
  }

  // 시그니처 사운드(§15.2): 블루프린트가 정한 마디에서 한 번, 곡 전체에서 고른 S2~S6 소리로.
  if (rig.sigBuffer && section.sigSlots?.includes(sectionBar)) {
    playHit("sig", rig.sigBuffer, barStart, 0.7);
  }

  for (let step = 0; step < STEP_COUNT; step++) {
    const time = at(step);
    const accent = track.accent[step] ? 1.3 : 1;
    const downbeat = step % 4 === 0;

    if (familyHit) {
      // compute/metropolis: 드럼 계열이 킥/lowDrum/tick의 on-off를 정한다(§16.4). 소리는
      // 합성 킷(circuit/skyline, §14.2 K)의 킥 원샷을 세 역할 다 재사용한다 — 역할별
      // 음색은 §11 단계 6 청취 후 다듬는다.
      const sample = rig.synthKit ? rig.synthKit.kick : bank[track.kick];
      if (familyHit.mask[step]) {
        playHit(familyHit.role, sample, time, 0.9 + 0.1 * intensity);
        if (familyHit.role !== "tick") {
          const depth = 0.34 + 0.24 * (1 - intensity);
          mix.sidechain.gain.setValueAtTime(depth, time);
          mix.sidechain.gain.linearRampToValueAtTime(1, time + Math.min(0.22, stepDur * 2.4));
        }
      } else if (
        isCompute &&
        section.drumFamily === "fourFloor" &&
        step === fourFloorGhostStep(pattern.genome.drumVariant)
      ) {
        // compute B계열 고스트 킥(§16.4 표 비트7): 정규 스텝보다 낮은 세기로, 사이드체인은
        // 안 건드린다(펌핑까지 하면 정규 킥처럼 들려서 "고스트"라는 뜻이 없어진다).
        playHit(familyHit.role, sample, time, 0.3);
      }
    } else if (cueActiveAtStep(section, "kick", sectionBar, step)) {
      const doubled = section.id.startsWith("build") && isLastBar && step % 2 === 0;
      if (layers.kick[step] || doubled || (intensity > 0.85 && step === 14 && rng() < 0.25)) {
        playHit("kick", bank[track.kick], time, (doubled ? 0.75 : 1) * (0.9 + 0.1 * intensity));
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
      playHit("backbeat", backbeatSample, time, double ? 0.85 : 0.7);
      if (double) playHit("backbeat", backbeatSample, at(14), 0.6);
    }

    const hatCue = cueActiveAtStep(section, "hat", sectionBar, step);
    if (hatCue && step < hatCutFrom && cueStepActive(hatCue, sectionBar, step)) {
      const level = (downbeat ? 0.55 : step % 2 === 0 ? 0.4 : 0.24) * accent;
      playHit("hat", rig.synthKit ? rig.synthKit.hat : bank[track.hat], time, level, 0.95 + rng() * 0.12);
    }

    if (cueActiveAtStep(section, "openHat", sectionBar, step) && step % 4 === 2) {
      playHit("openHat", bank[step % 8 === 6 ? track.hatOpenLong : track.hatOpen], time, 0.42);
    }

    if (cueActiveAtStep(section, "perc", sectionBar, step) && track.percSteps[step]) {
      playHit("perc", bank[track.shaker], time, 0.3 * accent, 0.9 + rng() * 0.25);
    }

    if (cueActiveAtStep(section, "metal", sectionBar, step)) {
      const hit = step === track.metalSteps[0] ? track.metalA : step === track.metalSteps[1] ? track.metalB : null;
      if (hit && rng() < 0.3 + 0.5 * intensity) {
        playHit("metal", bank[hit], time, 0.4 + 0.3 * intensity, 0.85 + rng() * 0.4);
      }
      if (barIndex % 8 === 0 && step === 0) {
        playHit("metal", bank[track.metalA], time, 0.55, 0.8);
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
      // VCSL 톤(§15.3, "stab 대용")을 신스 스탭 위에 겹친다. 시드 1/3만 이 킷을 고른다.
      if (track.tonalKit === "vcsl" && rig.tonalBuffer) {
        playHit("tonal", rig.tonalBuffer, time, 0.4);
      }
    }
  }

  if (legacyFill) {
    if (isFill && fillKind >= 0 && fillKind <= 2) {
      if (fillKind === 0) {
        const toms: SampleId[] = ["tomLow", "tomLow", "tomMid", "tomHigh"];
        toms.forEach((tom, i) => playHit("perc", bank[tom], at(12 + i), 0.6 + i * 0.06));
      } else if (fillKind === 1) {
        for (let i = 0; i < 4; i++) {
          playHit("backbeat", bank.snareTight, at(12 + i), 0.3 + i * 0.12, 1 + i * 0.05);
        }
      } else {
        playHit("metal", bank[track.metalB], at(14), 0.6, 0.7);
      }
    }
  } else {
    // 새 필 메커니즘(§11 단계 3): fill 배열의 주기적 필 + endFill(섹션 마지막 마디 전용).
    // 어느 역할에 꽂을지는 블루프린트별 드럼 계열이 정할 일이라 §11 단계 6 전까지는
    // kick 자리를 빌려 스텝 패턴만 검증한다.
    for (const f of section.fill) {
      if (sectionBar % f.everyBars === f.atBarInCycle) {
        for (const step of fillSteps(f.kind)) playHit("kick", bank[track.kick], at(step), 1);
      }
    }
    if (section.endFill && isLastBar) {
      for (const step of fillSteps(section.endFill)) playHit("kick", bank[track.kick], at(step), 1);
    }
  }
}

const LAYER_TO_DRUM_ROLE: Partial<Record<LayerId, DrumRole>> = {
  kick: "kick",
  hat: "hat",
  openHat: "openHat",
  clap: "clap",
  perc: "perc",
  sub: "sub",
  chop: "chop",
  dialogue: "dialogue",
  clapLayer: "clapLayer",
  texture: "texture",
};

const JITTER_SALT = 0x6a697474; // "jitt"
const BAR_GATE_SALT = 0x62617267; // "barg"

// tape 게놈(d 전용, §7.3) 하위 두 비트 = 마디 흔들림 4단계, 상위 두 비트 = 로파이 로우패스
// 4단계(§6.5 item 2). 16 = 4×4.
export function tapeJitterMs(tape: number): number {
  return [4, 8, 14, 20][tape % 4];
}

export function tapeLowpassHz(tape: number): number {
  return [1500, 3000, 5000, 7500][Math.floor(tape / 4) % 4];
}

/**
 * §6.5 item 3(Delroy 마디 흔들림). tape 게놈이 있는 스타일(d)만 0이 아니다. scheduleBar를
 * 부르기 전에 barStart에 이 값을 더한다 — 스텝 사이 간격 자체는 그대로 두기 위해 마디
 * 단위로만 흔든다(측정이 마디 단위 흔들림이었다).
 */
export function barJitterSeconds(pattern: Pattern, barIndex: number): number {
  const tape = pattern.styleGenome?.tape;
  if (tape === undefined) return 0;
  const j = tapeJitterMs(tape) / 1000;
  const rand = hashRand(pattern.seedHash, JITTER_SALT, barIndex, 0) * 2 - 1;
  return j * (0.6 * rand + 0.4 * Math.sin((2 * Math.PI * barIndex) / 11));
}

/**
 * 마디 시작 절대 시각(초) = 나중값 + 지터. 지터는 음수일 수 있어서(±J) 마디 0에서 그대로
 * 더하면 시각이 음수가 될 수 있다 — Web Audio API(setValueAtTime/start)는 음수 시각을
 * 던지므로(브라우저 콘솔에 "startTime must be a positive value" 같은 에러) 0 밑으로는
 * 못 내려가게 막는다. 맨 첫 히트 하나만 아주 살짝(최대 20ms) 덜 흔들릴 뿐이다.
 */
export function barStartSeconds(pattern: Pattern, barIndex: number, barSeconds: number): number {
  return Math.max(0, barIndex * barSeconds + barJitterSeconds(pattern, barIndex));
}

/**
 * §13.6 item 6: styleMaps가 있는 새 블루프린트(d/p/f) 전용 경로. v2 scheduleBar 본문과
 * 완전히 분리해 둬서 블루프린트를 9개 늘려도 저쪽 함수는 한 줄도 안 자란다.
 *
 * 알고리즘(§6.1): 레이어별 density → priority[step] > 255−density(부분집합 보장,
 * rateStepActive 재사용) → window/barGate/skipBars → drumOverride 있으면 그걸로 대체 →
 * 세기표(velocity) → 스윙·beatShift → 킷(kitSwap) 원샷 → (킥이면) 사이드체인.
 */
function scheduleStyleBar(
  rig: Rig,
  section: Section,
  barIndex: number,
  sectionBar: number,
  barStart: number,
  swing: number
): void {
  const { pattern, drums, styleMaps, blueprint } = rig;
  if (!styleMaps) return;
  const stepsPerBar = pattern.stepsPerBar;
  // 12칸 격자(shuffle12, §6.2) 자체가 셔플이라 스윙은 무시한다.
  const effectiveSwing = stepsPerBar === 12 ? 0 : swing;
  const beatShift = section.beatShift ?? 0;
  const at = (step: number) =>
    barStart + (step + beatShift) * rig.stepDur + (step % 2 === 1 ? effectiveSwing * rig.stepDur : 0);

  // 드럼 버스 게인(§6.1 drumGainDb). 정의 안 된 섹션은 0dB로 매번 되돌려서, 이전 섹션의
  // 보정이 다음 섹션까지 새지 않는다.
  rig.mix.drum.gain.setValueAtTime(10 ** ((section.drumGainDb ?? 0) / 20), barStart);

  const kit = section.kitSwap === "sub808" ? rig.sub808Kit : rig.styleKit;

  const pumpSidechain = (time: number) => {
    if (!blueprint.sidechain) return;
    const { synthDb, bassDb, releaseBeats } = blueprint.sidechain;
    const beat = rig.stepDur * (stepsPerBar / 4);
    rig.mix.sidechain.gain.setValueAtTime(10 ** (synthDb / 20), time);
    rig.mix.sidechain.gain.linearRampToValueAtTime(1, time + Math.min(0.22, releaseBeats * beat * 0.5));
    if (rig.bassSidechain) {
      rig.bassSidechain.gain.setValueAtTime(10 ** (bassDb / 20), time);
      rig.bassSidechain.gain.linearRampToValueAtTime(1, time + releaseBeats * beat);
    }
  };

  for (const cue of section.cues) {
    const map = styleMaps[cue.layer];
    const role = LAYER_TO_DRUM_ROLE[cue.layer];
    if (!map || !role) continue; // 드럼이 아닌 레이어(chord 등)는 다른 경로가 담당한다
    if (cue.barGate !== undefined && hashRand(pattern.seedHash, BAR_GATE_SALT, barIndex, 0) >= cue.barGate) continue;
    if (cue.skipBars?.includes(sectionBar)) continue;

    const rateStep = rateAt(cue, sectionBar);
    if (!rateStep) continue;
    // 블루프린트는 density만 적어 두고(§6.1), priority는 styleDrumMaps가 곡마다 만든 걸 쓴다.
    const effectiveRateStep = rateStep.priority ? rateStep : { ...rateStep, priority: map.priority };
    const override = section.drumOverride?.[cue.layer];
    const sample = kit?.[role];
    if (!sample) continue;

    for (let step = 0; step < stepsPerBar; step++) {
      if (!cueActiveAtStep(section, cue.layer, sectionBar, step)) continue;
      const active = override ? override.includes(step) : rateStepActive(effectiveRateStep, step);
      if (!active) continue;
      const velocity = rateStepVelocity(rateStep, step, map.velocity[step] ?? 0.8);
      const time = at(step);
      drums.hit(role, sample, time, velocity);
      if (role === "kick") pumpSidechain(time);
    }
  }

  // 신스 레이어(베이스·리프): styleMaps에 없어서 위 드럼 루프를 안 타고 따로 처리한다.
  // rig.motifBass/motifRiff는 buildRig가 styleBass/styleRiff로 미리 채워 둔 패턴 — 마디마다
  // 같은 걸 반복한다(§4.1 D1: 드럼 루프는 곡 전체에서 한 가지, 신스도 같은 원칙). beatShift는
  // "신스·베이스는 안 민다"(§6.1)라 여기선 안 쓴다 — 드럼용 at()과 다른 별도 시각 함수를 쓴다.
  const atSynth = (step: number) => barStart + step * rig.stepDur + (step % 2 === 1 ? effectiveSwing * rig.stepDur : 0);
  const synthLayers: {
    layer: LayerId;
    voice: MonoVoice;
    source: readonly StepCell[];
    noteLen: number;
    level: number;
    salt: number;
  }[] = [];
  // rig.motifBass/motifRiff가 null이면(=이 Rig가 신스 없이 드럼 경로만 테스트하는 픽스처거나
  // 아직 지원 안 하는 스타일이면) rig.voices를 아예 안 건드린다.
  if (rig.motifBass) {
    synthLayers.push({
      layer: "bass",
      voice: rig.voices.bass,
      source: rig.motifBass.cells,
      noteLen: (rig.motifBass.gateBeats ?? 2) * rig.stepDur,
      level: 0.8,
      salt: 10,
    });
  }
  if (rig.motifRiff) {
    synthLayers.push({ layer: "seqRiff", voice: rig.voices.seqRiff, source: rig.motifRiff, noteLen: rig.stepDur * 1.5, level: 0.55, salt: 11 });
    synthLayers.push({ layer: "lead", voice: rig.voices.lead, source: rig.motifRiff, noteLen: rig.stepDur * 1.5, level: 0.5, salt: 12 });
  }
  for (const sl of synthLayers) {
    const cue = cueFor(section, sl.layer, sectionBar);
    if (!cue) continue;
    if (cue.skipBars?.includes(sectionBar)) continue;
    if (cue.barGate !== undefined && hashRand(pattern.seedHash, BAR_GATE_SALT, barIndex, sl.salt) >= cue.barGate) continue;
    for (let step = 0; step < stepsPerBar; step++) {
      if (!cueActiveAtStep(section, sl.layer, sectionBar, step)) continue;
      const cell = sl.source[step];
      if (!cell?.on) continue;
      const freq = midiToFrequency(degreeToMidi(pattern.scale, cell.degree));
      sl.voice.note(atSynth(step), freq, sl.noteLen, sl.level);
    }
  }

  // p 찬트 후크(§7.7 chop): 2마디 고정 패턴(rig.hookPlan)을 barIndex%2로 앞/뒷마디 절반을
  // 골라 튼다. formantVox 목소리는 rig.voices.arp가 맡는다(§13.6 위 comment).
  if (rig.hookPlan) {
    const chopCue = cueFor(section, "chop", sectionBar);
    if (
      chopCue &&
      !chopCue.skipBars?.includes(sectionBar) &&
      (chopCue.barGate === undefined || hashRand(pattern.seedHash, BAR_GATE_SALT, barIndex, 13) < chopCue.barGate)
    ) {
      const barParity = barIndex % 2;
      for (const note of rig.hookPlan) {
        if (Math.floor(note.at / 16) !== barParity) continue;
        const step = note.at % 16;
        if (!cueActiveAtStep(section, "chop", sectionBar, step)) continue;
        const freq = midiToFrequency(degreeToMidi(pattern.scale, note.degree));
        rig.voices.arp.note(atSynth(step), freq, rig.stepDur * 3, 0.5);
      }
    }
  }

  // f 목소리 조각(chop, §6.4.1/§7.7): 2마디 고정 패턴(rig.chopPlan)을 barIndex%2로 고른다.
  // 내 소리가 있으면 그 버퍼를 hitSlice로 잘라 친다. 없으면(§8.2 CC0 말소리 풀은 아직
  // 소싱 전) formantVox 합성으로 대신한다 — 로봇 목소리(voiceBank)는 일부러 안 쓴다,
  // k의 "글자를 읽는" 질감이 그대로 묻어나서 f에 크라프트베르크 색이 섞여 버린다.
  if (rig.chopPlan) {
    const chopCue = cueFor(section, "chop", sectionBar);
    if (
      chopCue &&
      !chopCue.skipBars?.includes(sectionBar) &&
      (chopCue.barGate === undefined || hashRand(pattern.seedHash, BAR_GATE_SALT, barIndex, 14) < chopCue.barGate)
    ) {
      const barParity = barIndex % 2;
      const pool = rig.chopPool;
      for (const note of rig.chopPlan) {
        if (Math.floor(note.at / 16) !== barParity) continue;
        const step = note.at % 16;
        if (!cueActiveAtStep(section, "chop", sectionBar, step)) continue;
        const time = atSynth(step);
        if (pool.length > 0) {
          const buffer = pool[note.sliceIndex % pool.length];
          // 조각 풀이 하나뿐이면(내 소리 업로드 1개) 그 버퍼를 4등분해서 구간을 바꾼다.
          const segment = buffer.duration / 4;
          const offset = pool.length === 1 ? (note.sliceIndex % 4) * segment : 0;
          const dur = pool.length === 1 ? segment : buffer.duration;
          drums.hitSlice("chop", buffer, offset, dur, time, 0.7, note.rate);
        } else {
          const freq = midiToFrequency(degreeToMidi(pattern.scale, note.degree));
          rig.voices.arp.note(time, freq, rig.stepDur * 3, 0.45);
        }
      }
    }
  }

  // d·p·f `chord`(§7.1 cheapSynth/fmEPiano/superPad): stabVoices 3개로 코드 3음(근음·3도·
  // 5도)을 맡는다. 코드가 바뀌는 마디(또는 섹션에 새로 들어오는 마디)에서만 다시 친다 —
  // 매 마디 다시 치면 지속되는 코드가 아니라 스타카토처럼 들린다. chordBreak 섹션(halfBeat·
  // breakdown 등, §7.4 "브레이크" 열)은 진행을 순환하지 않고 그 섹션 전용 코드를 잡는다.
  if (rig.chordRootAt) {
    const chordCue = cueFor(section, "chord", sectionBar);
    if (chordCue && !chordCue.skipBars?.includes(sectionBar)) {
      const isBreak = section.chordBreak ?? false;
      const root = rig.chordRootAt(barIndex, isBreak);
      const changed = sectionBar === 0 || root !== rig.chordRootAt(barIndex - 1, isBreak);
      // f(superPad, 곡 내내 배경)·p slowJam(fmEPiano, §7.1 "스탭")은 코드가 하나로 오래
      // 붙어 있는 구간에서도 이따금 다시 숨쉰다 — riffRhythm(12비트)으로 몇 마디에 한 번인지
      // 정한다(창의성 감사 후 추가: 이 필드가 f에서 완전히 안 쓰이고 있었다).
      const breathPeriod = 2 + ((pattern.styleGenome?.riffRhythm ?? 0) % 6);
      const breathes =
        !changed &&
        (pattern.style === "f" || pattern.blueprintId === "slowJam") &&
        barIndex % breathPeriod === 0;
      if (changed || breathes) {
        [root, root + 2, root + 4].forEach((degree, i) => {
          const freq = midiToFrequency(degreeToMidi(pattern.scale, degree));
          rig.stabVoices[i].note(atSynth(0), freq, rig.stepDur * 8, 0.4);
        });
      }
    }
  }

  const applyFill = (kind: FillKind) => {
    // 16칸 전용 필(stepFill/roll13/halfBar8/pickup15)이 실수로 12칸 블루프린트에 붙어도
    // 격자 밖 스텝은 여기서 걸러진다(§6.2) — 이 필터 하나가 그 금지 규칙의 실제 강제 장치다.
    const steps = fillSteps(kind).filter((s) => s < stepsPerBar);
    if (steps.length === 0) return;
    if (kind === "snareRoll16") {
      // 중역 타악 16분 전부, 세기 0.4→1.0 선형(Peggy 빌드, §6.1).
      const clapSample = kit?.clap;
      if (!clapSample) return;
      steps.forEach((step, i) => {
        const velocity = 0.4 + (0.6 * i) / Math.max(1, steps.length - 1);
        drums.hit("clap", clapSample, at(step), velocity);
      });
      return;
    }
    // "cut"(Delroy 끝)을 포함한 나머지는 v2 "stop"과 완전히 같은 방식: 첫 박에 킥 한 번.
    // 뒤가 비는 건 필 메커니즘이 아니라 그 섹션 자체에 다른 큐가 없기 때문이다(compute
    // "stop" 섹션과 같은 설계, §6.3 d-1 end 섹션 참고).
    const kickSample = kit?.kick;
    if (!kickSample) return;
    for (const step of steps) drums.hit("kick", kickSample, at(step), 1);
  };
  const isLastBar = sectionBar === section.bars - 1;
  for (const f of section.fill) {
    if (sectionBar % f.everyBars === f.atBarInCycle) applyFill(f.kind);
  }
  if (section.endFill && isLastBar) applyFill(section.endFill);
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

// 내 소리(§15.4): 슬롯에 파일이 여러 개면 곡 하나 동안 고정으로 쓸 것 하나를 시드로 고른다
// (곡 안에서 안 바뀌게). 슬롯이 비어 있으면 그 슬롯은 결과에서 아예 빠진다(원래 소리 사용).
// slice(0)로 복사해서 넘긴다 — decodeAudioData는 원본 ArrayBuffer를 분리시켜버려서, 같은
// 저장본으로 다시 렌더링(템포 변경 등)하면 두 번째부터 디코딩이 실패한다.
async function resolveUserKitBuffers(
  ctx: BaseAudioContext,
  userKit: Partial<Record<UserSlot, ArrayBuffer[]>> | null | undefined,
  seedHash: number
): Promise<Partial<Record<UserSlot, AudioBuffer>> | null> {
  if (!userKit) return null;
  const result: Partial<Record<UserSlot, AudioBuffer>> = {};
  for (const [index, slot] of USER_SLOTS.entries()) {
    const files = userKit[slot];
    if (files && files.length > 0) {
      const rng = mulberry32((seedHash ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0);
      result[slot] = await ctx.decodeAudioData(pick(rng, files).slice(0));
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

async function buildRig(
  pattern: Pattern,
  options: RenderOptions,
  duration: number
): Promise<{ ctx: OfflineAudioContext; rig: Rig }> {
  const { override, liveControls, onProgress, onChunk, userKit } = options;
  const sampleRate = options.sampleRate || DEFAULT_SAMPLE_RATE;
  const tempo = effectiveTempo(pattern, liveControls ?? null);
  const totalSamples = Math.ceil(duration * sampleRate);
  const ctx = new OfflineAudioContext(2, totalSamples, sampleRate);
  if (onProgress) attachProgress(ctx, duration, onProgress);

  const blueprint = resolvedBlueprintFor(pattern);
  const track = deriveTrack(pattern);
  const bank = await loadSampleBank(ctx, track.kit);
  const mix = buildMix(
    ctx,
    tempo,
    cutoffToFrequency(liveControls?.filterCutoff ?? 1),
    onChunk ? { totalSamples, onChunk } : undefined,
    blueprint.lofi ? { lowpassHz: tapeLowpassHz(pattern.styleGenome?.tape ?? 0) } : undefined
  );
  const noise = makeNoiseBuffer(ctx, pattern.seedHash, 1);

  // §6.5 item 1(베이스 전용 사이드체인 버스). blueprint.sidechain이 있는 새 블루프린트만
  // 베이스를 이 버스로 보낸다 — 없으면 지금처럼 mix.music → mix.sidechain 공유 펌핑 그대로다.
  const bassSidechain = blueprint.sidechain ? ctx.createGain() : null;
  if (bassSidechain) bassSidechain.connect(mix.master);

  // §6.5 item 4(신스 폭). v2 블루프린트는 synthWidth가 없어서 지금처럼 폭 없이 그대로다.
  const strips = Object.fromEntries(
    (Object.keys(SYNTH_STRIPS) as SynthLayer[]).map((id) => [
      id,
      buildStrip(
        ctx,
        mix,
        SYNTH_STRIPS[id],
        id === "bass" ? (bassSidechain ?? undefined) : undefined,
        (id === "pad" || id === "stab") && blueprint.synthWidth !== undefined ? blueprint.synthWidth : undefined
      ),
    ])
  ) as Record<SynthLayer, GainNode>;

  // §7.1 전역 행(테이프 워블). d(tape 게놈 있음)만 만든다. 모든 voices/stabVoices 생성에
  // 넘기지만 실제로 반응하는 건 cheapSynth 케이스뿐이다(다른 보이스는 detuneMod를 안 읽는다)
  // — d의 bassVoice/leadVoice는 이미 cheapSynth로 고정돼 있다(§13.5).
  const tapeWobble = pattern.styleGenome?.tape !== undefined ? createTapeWobble(ctx, duration) : undefined;

  const family = blueprintFamily(pattern.blueprintId);
  const motifScale =
    family === "compute"
      ? computeScale(pattern.genome)
      : family === "metropolis"
        ? metropolisScale(pattern.genome)
        : pattern.scale;
  const motifRiff =
    family === "compute"
      ? computeRiff(pattern.genome)
      : family === "metropolis"
        ? metropolisSeq(pattern.genome)
        : pattern.style === "d" || pattern.style === "p"
          ? styleRiff(pattern.blueprintId, pattern.styleGenome!)
          : null;
  const motifBass =
    family === "compute"
      ? { cells: computeBass(pattern.genome), gateBeats: null }
      : family === "metropolis"
        ? (() => {
            const b = metropolisBass(pattern.genome);
            return { cells: b.cells, gateBeats: b.gateBeats };
          })()
        : pattern.style === "d" || pattern.style === "p" || pattern.style === "f"
          ? (() => {
              const b = styleBass(pattern.blueprintId, pattern.styleGenome!, pattern.scale);
              return { cells: b.cells[0], gateBeats: b.gate };
            })()
          : null;
  // p 찬트 후크(§7.7). 2마디(0~31, 16분 격자) 고정 패턴 — 마디마다 barIndex%2로 어느 마디의
  // 절반을 쓸지 고른다(scheduleStyleBar).
  const hookPlanResult = pattern.style === "p" ? hookPlan(pattern.styleGenome!) : null;
  // f 목소리 조각(§6.4.1/§7.7). 리듬·속도 계획만 여기서 만든다 — 실제 소스(내 소리/로봇
  // 목소리)는 voiceBank·userKitBuffers가 정해진 뒤 chopPool로 고른다.
  const chopPlanResult = pattern.style === "f" ? chopPlan(pattern.styleGenome!) : null;
  // "calls" 큐: 기본 compute + k 스타일(codeRead 섹션, metropolisK는 pulseIntro/breakdown도)만
  // 쓴다(§16.4, kraftwerkK.ts). f의 chop은 일부러 이 로봇 목소리를 안 쓴다(§11 청취 피드백 —
  // "글자를 읽는" k 질감이 그대로 묻어나 스타일이 섞인다). 언어는 게놈 밖 — 곡 정체성과 무관.
  const voiceLang: VoiceLang = pattern.seedHash % 2 === 0 ? "de" : "en";
  const usesCalls =
    pattern.blueprintId === "compute" || pattern.blueprintId === "computeK" || pattern.blueprintId === "metropolisK";
  const voiceBank = usesCalls ? await loadVoiceForCode(ctx, voiceLang, pattern.seedInput) : null;

  // 시그니처 사운드(§15.2): sigSlots가 있는 compute/metropolis 계열만, 곡 하나당 S2~S6 중 하나.
  // (S1 로봇 목소리는 이미 위 voiceBank/"calls" 큐가 맡는다.)
  const usesSig = family !== null;
  let sigBuffer: AudioBuffer | null = null;
  if (usesSig) {
    const sigKinds = ["quindar", "bell", "mech", "modem", "space"] as const;
    const sigRng = mulberry32((pattern.seedHash ^ 0x51617) >>> 0);
    // k(styleGenome.sig, 기수 6 — S1은 로봇 목소리라 여기 5개 풀에 안 들어가서 %5로 접는다)는
    // 게놈이 정하고, open은 지금처럼 seedHash 기반 rng로 고른다(불변, R9 — sigRng를 pick에
    // 먼저 통과시켜야 이어지는 sigRng() 인덱스 추첨이 예전과 같다).
    const kind = pattern.styleGenome ? sigKinds[(pattern.styleGenome.sig ?? 0) % sigKinds.length] : pick(sigRng, sigKinds);
    if (kind === "quindar") sigBuffer = makeQuindarBuffer(ctx);
    else if (kind === "bell") sigBuffer = makeBellBuffer(ctx, pattern.seedHash);
    else sigBuffer = await loadSigSample(ctx, kind as SigSampleKind, Math.floor(sigRng() * 12));
  }

  // 합성 드럼 킷(§14.2 K): compute/metropolis 계열은 legacy 샘플 대신 자기 킷으로 킥·백비트·햇을
  // 낸다. k도 지금은 같은 circuit/skyline 킷을 쓴다 — 게놈별 프리셋(circuitK/skylineK, §7.2)은
  // 단계 6에서 붙인다.
  const synthKit =
    family === "compute"
      ? await loadSynthKit(ctx.sampleRate, "circuit", pattern.seedHash)
      : family === "metropolis"
        ? await loadSynthKit(ctx.sampleRate, "skyline", pattern.seedHash)
        : null;

  // VCSL/Karoryfer 톤(§15.3): track.tonalKit이 골라 둔 킷·인덱스로 파일 하나만 받는다.
  const tonalBuffer = track.tonalKit ? await loadTonalSample(ctx, track.tonalKit, track.tonalIndex) : null;

  // §6.1 새 블루프린트(d/p/f) 전용 드럼 경로. open/k는 family가 채워지거나(k) null이라도
  // pattern.style이 "open"/"k"라서 여기서 항상 null — scheduleBar가 v2 본문을 그대로 탄다.
  const styleMaps = pattern.styleGenome && family === null ? styleDrumMaps(pattern.blueprintId, pattern.styleGenome) : null;
  // 측정: 새 블루프린트(d/p/f)는 드럼이 거의 모노다. k는 v2 compute/metropolis 킷을 그대로
  // 쓰므로 이미 정해진 스테레오 폭을 안 건드린다(styleMaps가 없을 때만 이 분기가 산다).
  const panScale = styleMaps ? 0.15 : 1;

  // §7.2 tape/house/garage 킷(단계 6). 게놈 kit이 결정론적으로 프리셋을 고른다 — 실제
  // 샘플 파일은 아직 없어서(§8) 항상 합성 대체만 쓴다.
  const styleFamily =
    blueprint.kitFamily === "tape" || blueprint.kitFamily === "house" || blueprint.kitFamily === "garage"
      ? blueprint.kitFamily
      : null;
  const styleKit = styleFamily ? await loadStyleKit(ctx.sampleRate, styleFamily, pattern.styleGenome?.kit ?? 0) : null;
  // switchUp의 kitSwap: "sub808"(§6.3 f-3) 전용 킥 하나. kick 큐를 그대로 쓰고 킷만 바꾼다
  // (styleMotifs.ts switchUpMaps 위 comment) — 그래서 kick 자리에도 넣어 둔다.
  const sub808Kit =
    pattern.blueprintId === "switchUp" ? { kick: await loadSub808(ctx.sampleRate) } : null;

  const userKitBuffersResolved = await resolveUserKitBuffers(ctx, userKit, pattern.seedHash);
  // f 목소리 조각(§6.4.1 소스 우선순위): 내 소리 voice 슬롯만 쓴다. CC0 말소리 풀(§8.2)은
  // 아직 소싱 전이고, 로봇 목소리는 일부러 폴백에서 뺐다(위 comment) — 비어 있으면
  // scheduleStyleBar가 formantVox 합성으로 대신한다.
  const chopPool: AudioBuffer[] = userKitBuffersResolved?.voice ? [userKitBuffersResolved.voice] : [];
  // d·p·f `chord`(§7.1/§7.4): 이 마디의 코드 뿌리를 돌려주는 함수 하나로 넘긴다.
  const chordRootAt =
    pattern.style === "p"
      ? (barIndex: number, isBreak?: boolean) => pChordRootAt(pattern.styleGenome!, barIndex, isBreak)
      : pattern.style === "f"
        ? (barIndex: number, isBreak?: boolean) => fChordRootAt(pattern.styleGenome!, barIndex, isBreak)
        : pattern.style === "d"
          ? dChordRootAt
          : null;

  const rig: Rig = {
    ctx,
    mix,
    drums: createDrumMixer(ctx, mix, totalSamples, panScale),
    voices: {
      bass: createVoice(ctx, strips.bass, pattern.bassVoice, noise, duration, 0.6, tapeWobble),
      lead: createVoice(ctx, strips.lead, pattern.leadVoice, noise, duration, 0.25, tapeWobble),
      // p의 chop 찬트, f의 chop 합성 폴백(둘 다 §7.1 formantVox)은 arp 슬롯을 빌려 쓴다 —
      // open/k/d는 arp 레이어 자체가 없어서(§16.7) 이 슬롯이 원래도 비어 있었다.
      arp: createVoice(
        ctx,
        strips.arp,
        pattern.style === "p" || pattern.style === "f" ? "formantVox" : "square",
        noise,
        duration,
        0.45,
        tapeWobble
      ),
      seqRiff: createVoice(ctx, strips.seqRiff, pattern.style === "d" ? "cheapSynth" : "triSub", noise, duration, 0.4, tapeWobble),
      seqRun: createVoice(ctx, strips.seqRun, "sawUnison", noise, duration, 0.35, tapeWobble),
    },
    // d·p·f의 chord(§7.1): d는 cheapSynth(bass/lead/seqRiff와 같은 집안 음색). clubHouse의
    // 브레이크·halfBeat와 f는 곡 내내 배경이라 superPad, slowJam은 fmEPiano. open/k는
    // 여태처럼 sawUnison(stab 원래 용도, compute 계열 화음 채우기).
    stabVoices: [0, 1, 2].map(() =>
      createVoice(
        ctx,
        strips.stab,
        pattern.style === "d"
          ? "cheapSynth"
          : pattern.style === "f" || (pattern.style === "p" && pattern.blueprintId === "clubHouse")
            ? "superPad"
            : pattern.style === "p" && pattern.blueprintId === "slowJam"
              ? "fmEPiano"
              : "sawUnison",
        noise,
        duration,
        0.4,
        tapeWobble
      )
    ),
    strips,
    bank,
    pattern,
    track,
    layers: resolveLayers(pattern, override),
    noise,
    stepDur: secondsPerStep(tempo, pattern.stepsPerBar),
    motifScale,
    motifRiff,
    motifBass,
    voiceBank,
    sigBuffer,
    synthKit,
    userKitBuffers: userKitBuffersResolved,
    tonalBuffer,
    blueprint,
    styleMaps,
    styleKit,
    sub808Kit,
    bassSidechain,
    hookPlan: hookPlanResult,
    chopPlan: chopPlanResult,
    chopPool,
    chordRootAt,
  };

  return { ctx, rig };
}

/** 3분짜리 전체 트랙. 섹션마다 레이어, 음량, 필터가 전부 바뀐다. */
export async function renderArrangement(pattern: Pattern, options: RenderOptions = {}): Promise<AudioBuffer> {
  const tempo = effectiveTempo(pattern, options.liveControls ?? null);
  const arrangement = arrangementFor(pattern, tempo);
  // 리버브/딜레이 꼬리가 잘리지 않게 뒤에 여유를 둔다.
  const duration = arrangement.totalSeconds + 3;
  const { ctx, rig } = await buildRig(pattern, options, duration);

  // §6.5 item 2 / §4.1 D10: 로파이 블루프린트는 섹션과 무관하게 테이프 히스가 곡 내내 깔린다.
  // 사이드체인 버스를 안 거치고 master로 바로 가서 킥에 안 눌린다.
  if (rig.blueprint.lofi) {
    const tape = pattern.styleGenome?.tape ?? 0;
    const lowpassStage = Math.floor(tape / 4) % 4; // 0=가장 어두움(1.5kHz)
    const hissDb = -44 + (3 - lowpassStage); // 어두울수록 히스가 두드러진다(표의 "+4dB" 근사)
    const hiss = ctx.createBufferSource();
    hiss.buffer = makePinkNoiseBuffer(ctx, (pattern.seedHash ^ 0x715510e) >>> 0, 3);
    hiss.loop = true;
    const hissGain = ctx.createGain();
    hissGain.gain.value = 10 ** (hissDb / 20);
    hiss.connect(hissGain);
    hissGain.connect(rig.mix.master);
    hiss.start(0);
    hiss.stop(duration);
  }

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
      // Karoryfer 오르간(§15.3, "pad 대용")을 신스 패드 위에 겹친다. 시드 1/3만 이 킷을 고른다.
      if (rig.track.tonalKit === "karoryfer" && rig.tonalBuffer) {
        scheduleSampledPad(ctx, rig.strips.pad, rig.tonalBuffer, start, length);
      }
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
      const barStart = barStartSeconds(pattern, barIndex, arrangement.barSeconds);
      scheduleBar(rig, section, barIndex, sectionBar, barStart, rng, arrangement.swing);
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

// compute/metropolis는 각자 원곡에서 "피크에 해당하는" 실제 섹션을 미리듣기로 쓴다(§16.4) —
// legacy용 합성 PREVIEW_SECTION 하나로는 두 계열 고유의 드럼 계열·리프·베이스가 전혀
// 안 드러난다. 없으면(legacy 3종) 기존 합성 섹션으로 대체된다.
const PREVIEW_SECTION_ID: Partial<Record<BlueprintId, string>> = {
  compute: "bGroove",
  metropolis: "mainA2",
  computeK: "bGroove",
  metropolisK: "mainA2",
};

export async function renderLoopBuffer(pattern: Pattern, options: RenderOptions = {}): Promise<AudioBuffer> {
  const tempo = effectiveTempo(pattern, options.liveControls ?? null);
  const duration = loopDurationSeconds(tempo, pattern.stepsPerBar);
  const { ctx, rig } = await buildRig(pattern, { ...options, onProgress: undefined }, duration);

  const blueprint = resolvedBlueprintFor(pattern);
  const previewId = PREVIEW_SECTION_ID[pattern.blueprintId];
  const realSection = previewId ? blueprint.sections.find((s) => s.id === previewId) : undefined;
  const section: Section = realSection ? { ...realSection, startBar: 0 } : PREVIEW_SECTION;

  rig.mix.tone.frequency.value = section.filter.from;
  rig.mix.master.gain.value = 0.85;
  const rng = mulberry32((pattern.seedHash ^ 0x9e3779b1) >>> 0);
  scheduleBar(rig, section, 0, 0, 0, rng, blueprint.swing);

  rig.drums.connect();
  return normalize(await ctx.startRendering());
}
