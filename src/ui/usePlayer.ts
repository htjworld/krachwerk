import { useCallback, useEffect, useRef, useState } from "react";
import { renderArrangement, renderLoopBuffer, type Pattern } from "../core";
import type { PatternOverride, CrosshairControl, UserSlot } from "../core";

/**
 * arrangement: 3분짜리 전체 트랙. 시드가 정해지면 바로 렌더링을 시작해두고, 재생 버튼은
 *              다 만들어진 버퍼를 틀기만 한다.
 * loop: 매트릭스 에디터/크로스헤어를 열었을 때 쓰는 한 마디 미리듣기. 편집할 때마다 3분을
 *       다시 렌더링하면 반응이 2초를 훌쩍 넘기므로 이쪽으로 갈아탄다.
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
  seek: (seconds: number) => void;
  getPosition: () => number;
}

// 시드를 연달아 바꿀 때 3분짜리 렌더링이 매번 도는 걸 막는다.
const RENDER_DEBOUNCE_MS = 250;

// 브라우저는 동시에 열 수 있는 AudioContext 수가 제한적이라 앱 전체가 하나를 공유한다.
// 만들어만 두면 suspended 상태라 소리가 나지 않고, 첫 사용자 제스처에서 resume한다.
// 렌더링 전에 이 컨텍스트의 샘플레이트를 알아야 해서 재생 시점보다 먼저 만든다.
let sharedContext: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (!sharedContext) {
    try {
      sharedContext = new AudioContext();
    } catch {
      return null;
    }
  }
  return sharedContext;
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
    source.connect(ctx.destination);
    source.start(0);
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

  const getPosition = useCallback(() => {
    const ctx = sharedContext;
    if (!isPlaying || !ctx || !sourceRef.current) return offsetRef.current;
    return ctx.currentTime - startedAtRef.current;
  }, [isPlaying]);

  const startFrom = useCallback(
    (offset: number) => {
      const ctx = audioContext();
      const rendered = bufferRef.current;
      if (!ctx || !rendered) return;
      stopSource();
      const at = Math.max(0, Math.min(offset, Math.max(0, rendered.duration - 0.05)));
      const source = ctx.createBufferSource();
      source.buffer = rendered;
      source.loop = mode === "loop";
      source.connect(ctx.destination);
      source.onended = () => {
        if (sourceRef.current !== source) return;
        sourceRef.current = null;
        offsetRef.current = 0;
        setIsPlaying(false);
      };
      source.start(0, at);
      sourceRef.current = source;
      playingBufferRef.current = rendered;
      startedAtRef.current = ctx.currentTime - at;
    },
    [mode, stopSource]
  );

  const seedHash = pattern.seedHash;
  useEffect(() => {
    const run = ++runRef.current;
    setIsRendering(true);
    setProgress(0);
    setError(null);
    offsetRef.current = 0;
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
            });
      rendering
        .then((rendered) => {
          if (run !== runRef.current) return;
          bufferRef.current = rendered;
          setBuffer(rendered);
          setIsRendering(false);
          setProgress(1);
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

  // 렌더링 중에 재생을 눌러뒀거나 편집으로 버퍼가 새로 나왔으면 여기서 이어 붙인다.
  useEffect(() => {
    if (!isPlaying || !buffer) return;
    if (playingBufferRef.current === buffer && sourceRef.current) return;
    startFrom(offsetRef.current);
  }, [buffer, isPlaying, startFrom]);

  const toggle = useCallback(() => {
    if (isPlaying) {
      offsetRef.current = getPosition();
      stopSource();
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
    startFrom(offsetRef.current);
  }, [isPlaying, getPosition, startFrom, stopSource]);

  const seek = useCallback(
    (seconds: number) => {
      offsetRef.current = Math.max(0, seconds);
      if (isPlaying) startFrom(offsetRef.current);
    },
    [isPlaying, startFrom]
  );

  useEffect(() => stopSource, [stopSource]);

  return {
    isPlaying,
    isRendering,
    progress,
    duration: buffer?.duration ?? 0,
    error,
    toggle,
    seek,
    getPosition,
  };
}
