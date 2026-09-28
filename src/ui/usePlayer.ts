import { useCallback, useEffect, useRef, useState } from "react";
import { encodeWav, renderArrangement, renderLoopBuffer, type Pattern } from "../core";
import type { PatternOverride, CrosshairControl, UserSlot } from "../core";

/**
 * arrangement: 3분짜리 전체 트랙. 시드가 정해지면 바로 렌더링을 시작해두고, 재생 버튼은
 *              다 만들어진 버퍼를 틀기만 한다.
 * loop: 매트릭스 에디터/크로스헤어를 열었을 때 쓰는 한 마디 미리듣기. 편집할 때마다 3분을
 *       다시 렌더링하면 반응이 2초를 훌쩍 넘기므로 이쪽으로 갈아탄다.
 *
 * 재생은 두 갈래다. 렌더 중(앞부분 미리보기)과 loop는 Web Audio 버퍼 소스를 스트림 <audio>로
 * 흘려 틀고, 전체 트랙이 다 만들어지면 WAV로 굳혀 <audio>로 갈아탄다. 맥 화면이 꺼지면 실시간
 * 스트림은 제때 못 채워 마지막 버퍼가 되풀이되는데, 파일을 트는 <audio>는 브라우저가
 * 넉넉히 미리 버퍼링한다.
 */
export type PlayerMode = "arrangement" | "loop";

export interface Player {
  isPlaying: boolean;
  isRendering: boolean;
  /** 0~1. 전체 트랙 렌더링 진행률 */
  progress: number;
  /** 렌더링된 버퍼 길이(초). 아직 렌더링 전이면 0 */
  duration: number;
  /** 렌더링이 실패했을 때의 사유. 조용히 무음이 되는 것보다 화면에 띄우는 게 낫다. */
  error: string | null;
  toggle: () => void;
  /** 재생바를 잡는 순간 부른다. 재생 상태는 그대로 두고 소리만 멈춘다 — 끄는 동안 seek를
   *  계속 부르면 소스를 매번 새로 걸어서 지지직 소리가 난다. 다음 seek가 그 자리부터 다시 튼다. */
  hold: () => void;
  seek: (seconds: number) => void;
  getPosition: () => number;
}

// 시드를 연달아 바꿀 때 3분짜리 렌더링이 매번 도는 걸 막는다.
const RENDER_DEBOUNCE_MS = 250;

// 브라우저는 동시에 열 수 있는 AudioContext 수가 제한적이라 앱 전체가 하나를 공유한다.
// 만들어만 두면 suspended 상태라 소리가 나지 않고, 첫 사용자 제스처에서 resume한다.
// 렌더링 전에 이 컨텍스트의 샘플레이트를 알아야 해서 재생 시점보다 먼저 만든다.
// "playback": 다 만든 버퍼를 틀기만 하니 지연은 상관없다. 기본값(interactive)은 버퍼가 아주
// 작아서, 맥 화면이 꺼져 크롬이 페이지 우선순위를 낮추면 제때 못 채워 소리가 되풀이된다.
let sharedContext: AudioContext | null = null;

// 사파리/iOS는 AudioContext를 destination에 직접 물려서 내는 소리는 화면이 잠기거나 앱이
// 백그라운드로 가면 끊어버린다. <audio> 엘리먼트로 재생 중인 소리만 백그라운드에서 살려주므로,
// 실제 출력은 MediaStreamDestination을 거쳐 숨겨진 <audio> 태그로 흘려보낸다.
let sharedSink: AudioNode | null = null;
let sharedAudioEl: HTMLAudioElement | null = null;

function audioContext(): AudioContext | null {
  if (!sharedContext) {
    try {
      sharedContext = new AudioContext({ latencyHint: "playback" });
      const dest = sharedContext.createMediaStreamDestination();
      sharedAudioEl = new Audio();
      sharedAudioEl.srcObject = dest.stream;
      sharedSink = dest;
    } catch {
      return null;
    }
  }
  return sharedContext;
}

function outputSink(): AudioNode | null {
  return sharedSink;
}

// 사파리/iOS는 첫 소리가 사용자 제스처 안에서 시작돼야 그 뒤로 오디오를 열어준다.
// 길이 1프레임짜리 무음을 제스처 안에서 한 번 흘려보내 잠금을 푼다.
let unlocked = false;

function unlockAudio(ctx: AudioContext): void {
  if (unlocked) return;
  unlocked = true;
  try {
    const source = ctx.createBufferSource();
    source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    source.connect(outputSink() ?? ctx.destination);
    source.start(0);
    void sharedAudioEl?.play();
  } catch {
    // 잠금 해제는 실패해도 재생 자체를 막지 않는다.
  }
}

export function usePlayer(
  pattern: Pattern,
  override: PatternOverride | null,
  liveControls: CrosshairControl | null = null,
  mode: PlayerMode = "arrangement",
  userKit: Partial<Record<UserSlot, ArrayBuffer[]>> | null = null
): Player {
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const playingBufferRef = useRef<AudioBuffer | null>(null);
  const startedAtRef = useRef(0);
  const offsetRef = useRef(0);
  const runRef = useRef(0);
  const holdRef = useRef(false);
  const mediaRef = useRef<HTMLAudioElement | null>(null);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRendering, setIsRendering] = useState(true);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const stopSource = useCallback(() => {
    const source = sourceRef.current;
    sourceRef.current = null;
    if (!source) return;
    source.onended = null;
    try {
      source.stop();
    } catch {
      // 이미 멈춘 소스일 수 있다.
    }
    source.disconnect();
  }, []);

  const dropMedia = useCallback(() => {
    const media = mediaRef.current;
    mediaRef.current = null;
    if (!media) return;
    media.onended = null;
    media.pause();
    URL.revokeObjectURL(media.src);
  }, []);

  // Web Audio 소스나 <audio>가 돌고 있으면 그 시각, 둘 다 아니면 멈춘 상태(일시정지, 끌기,
  // 끝남)라 offsetRef가 기준이다. isPlaying을 안 봐서 렌더 콜백 같은 옛 클로저에서도 맞다.
  const getPosition = useCallback(() => {
    const ctx = sharedContext;
    if (ctx && sourceRef.current) return ctx.currentTime - startedAtRef.current;
    const media = mediaRef.current;
    if (media && !media.paused) return media.currentTime;
    return offsetRef.current;
  }, []);

  const startFrom = useCallback(
    function start(offset: number) {
      const media = mediaRef.current;
      if (media) {
        stopSource();
        // WAV로 트는 동안 스트림 <audio>까지 돌면 빈 스트림을 계속 소비해 마지막 버퍼가 되풀이된다.
        sharedAudioEl?.pause();
        media.currentTime = offset;
        // 사용자 제스처 밖(렌더 완료 순간 갈아탈 때)이라 사파리 등이 막으면 Web Audio로 되돌린다.
        // 재생 직후 pause가 불리면 AbortError가 나는데, 그건 사용자가 멈춘 것이라 그대로 둔다.
        media.play().catch((cause: unknown) => {
          if (mediaRef.current !== media || (cause as DOMException).name !== "NotAllowedError") return;
          dropMedia();
          start(offset);
        });
        return;
      }
      const ctx = audioContext();
      const rendered = bufferRef.current;
      if (!ctx || !rendered) return;
      stopSource();
      const at = Math.max(0, Math.min(offset, Math.max(0, rendered.duration - 0.05)));
      const source = ctx.createBufferSource();
      source.buffer = rendered;
      source.loop = mode === "loop";
      source.connect(outputSink() ?? ctx.destination);
      // 스트림 싱크로 낼 땐 <audio>가 재생 중이어야 소리가 나간다. play()는 이미 재생 중이면
      // no-op라, 렌더 중 프리뷰가 이 함수를 반복 호출해도 안전하다.
      void sharedAudioEl?.play();
      source.onended = () => {
        if (sourceRef.current !== source) return;
        sourceRef.current = null;
        offsetRef.current = 0;
        setIsPlaying(false);
        // 곡이 끝나면 무한 스트림을 소비하는 <audio>도 멈춰야 스피커 표시가 꺼지고,
        // 사파리가 마지막 버퍼를 반복 재생(띡띡띡)하지 않는다.
        sharedAudioEl?.pause();
      };
      source.start(0, at);
      sourceRef.current = source;
      playingBufferRef.current = rendered;
      startedAtRef.current = ctx.currentTime - at;
    },
    [mode, stopSource, dropMedia]
  );

  const seedHash = pattern.seedHash;
  const lastChunkAtRef = useRef(0);
  useEffect(() => {
    const run = ++runRef.current;
    // 옛 트랙의 <audio>를 버리고, 재생 중이었으면 같은 자리에서 Web Audio로 이어 틀어둔다.
    // 새 버퍼가 나오면 아래 이어붙이기 이펙트가 지금까지처럼 갈아 끼운다.
    const media = mediaRef.current;
    const wasPlaying = !!media && !media.paused;
    const position = getPosition();
    dropMedia();
    if (wasPlaying) startFrom(position);
    setIsRendering(true);
    setProgress(0);
    setError(null);
    offsetRef.current = 0;
    lastChunkAtRef.current = 0;
    const timer = setTimeout(() => {
      // 재생에 쓸 컨텍스트와 같은 샘플레이트로 렌더링한다. 어긋나면 사파리에서 무음이 난다.
      const options = {
        override,
        liveControls,
        userKit,
        sampleRate: audioContext()?.sampleRate,
      };
      const rendering =
        mode === "loop"
          ? renderLoopBuffer(pattern, options)
          : renderArrangement(pattern, {
              ...options,
              onProgress: (ratio) => {
                if (run === runRef.current) setProgress(ratio);
              },
              // 3분 전체가 끝나길 기다리지 않고, 지금까지 렌더된 앞부분만으로도 바로
              // 재생/이동할 수 있게 미리보기 버퍼를 계속 갱신한다.
              // ponytail: 버퍼가 바뀔 때마다 재생 중이면 소스를 새로 걸어야 해서(아래
              // 이어붙이기 이펙트) 짧은 끊김(클릭)이 한 번씩 난다. 렌더는 실시간보다
              // 훨씬 빨리 끝나 프리뷰가 초당 여러 번 도착할 수 있어서, 재생 중 재시작을
              // 500ms에 한 번으로 묶어 끊김을 줄인다. 완전히 안 끊기게 하려면 재시작
              // 대신 새 오디오 구간만 잘라 뒤이어 스케줄링하는 방식으로 바꿔야 한다.
              onChunk: (preview) => {
                if (run !== runRef.current) return;
                const now = performance.now();
                if (lastChunkAtRef.current !== 0 && now - lastChunkAtRef.current < 500) return;
                lastChunkAtRef.current = now;
                bufferRef.current = preview;
                setBuffer(preview);
              },
            });
      rendering
        .then((rendered) => {
          if (run !== runRef.current) return;
          bufferRef.current = rendered;
          setBuffer(rendered);
          setIsRendering(false);
          setProgress(1);
          if (mode !== "arrangement") return;
          const url = URL.createObjectURL(encodeWav(rendered));
          const next = new Audio(url);
          next.onended = () => {
            if (mediaRef.current !== next) return;
            offsetRef.current = 0;
            setIsPlaying(false);
          };
          next.addEventListener(
            "canplay",
            () => {
              if (run !== runRef.current) return URL.revokeObjectURL(url);
              mediaRef.current = next;
              // 재생 중이면 지금 자리에서 넘겨받는다. 멈춰 있으면 다음 재생부터 이걸로 튼다.
              if (sourceRef.current) startFrom(getPosition());
            },
            { once: true }
          );
        })
        .catch((cause: unknown) => {
          if (run !== runRef.current) return;
          setIsRendering(false);
          setError(cause instanceof Error ? cause.message : String(cause));
        });
    }, mode === "loop" ? 0 : RENDER_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedHash, override, liveControls, mode, userKit]);

  // 렌더링 중에 재생을 눌러뒀거나 편집/진행 중인 프리뷰로 버퍼가 새로 나왔으면 여기서
  // 이어 붙인다. offsetRef.current가 아니라 getPosition()을 써야 한다 — offsetRef는
  // 일시정지/탐색 때만 갱신되므로, 재생 중 프리뷰 버퍼가 계속 바뀌는 동안(진행률 갱신마다)
  // 그대로 쓰면 매번 마지막으로 멈췄던 지점(보통 0)으로 되감겨 버린다.
  useEffect(() => {
    if (!isPlaying || !buffer || holdRef.current || mediaRef.current) return;
    if (playingBufferRef.current === buffer && sourceRef.current) return;
    startFrom(getPosition());
  }, [buffer, isPlaying, startFrom, getPosition]);

  const toggle = useCallback(() => {
    holdRef.current = false;
    if (isPlaying) {
      offsetRef.current = getPosition();
      stopSource();
      sharedAudioEl?.pause();
      mediaRef.current?.pause();
      setIsPlaying(false);
      return;
    }
    // iOS/사파리는 사용자 제스처 안에서 AudioContext를 만들고 재개해야 한다. 버퍼가 이미
    // 준비돼 있으면 이펙트를 기다리지 않고 이 클릭 안에서 바로 소스를 건다.
    const ctx = audioContext();
    if (ctx) {
      void ctx.resume();
      unlockAudio(ctx);
    }
    setIsPlaying(true);
    startFrom(offsetRef.current); // 여기서 <audio>.play()까지 해준다
  }, [isPlaying, getPosition, startFrom, stopSource]);

  const hold = useCallback(() => {
    if (holdRef.current) return;
    if (isPlaying) offsetRef.current = getPosition();
    holdRef.current = true;
    stopSource();
    // 재생바를 잡는 동안에도 스트림 소비를 멈춘다. seek가 startFrom으로 다시 틀어준다.
    sharedAudioEl?.pause();
    mediaRef.current?.pause();
  }, [isPlaying, getPosition, stopSource]);

  const seek = useCallback(
    (seconds: number) => {
      holdRef.current = false;
      offsetRef.current = Math.max(0, seconds);
      if (isPlaying) startFrom(offsetRef.current);
    },
    [isPlaying, startFrom]
  );

  useEffect(
    () => () => {
      runRef.current++;
      stopSource();
      sharedAudioEl?.pause();
      dropMedia();
    },
    [stopSource, dropMedia]
  );

  return {
    isPlaying,
    isRendering,
    progress,
    duration: buffer?.duration ?? 0,
    error,
    toggle,
    hold,
    seek,
    getPosition,
  };
}
