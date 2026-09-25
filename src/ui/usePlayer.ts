import { useCallback, useEffect, useRef, useState } from "react";
import { renderLoopBuffer, type Pattern } from "../core";
import type { PatternOverride } from "../core";

export interface Player {
  isPlaying: boolean;
  isRendering: boolean;
  toggle: () => void;
  getElapsedSeconds: () => number;
}

// 한 루프 버퍼를 렌더링해서 loop=true로 반복 재생한다. iOS는 사용자 제스처 안에서
// AudioContext를 시작/재개해야 하므로 toggle()이 그 역할을 겸한다.
export function usePlayer(pattern: Pattern, override: PatternOverride | null): Player {
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startedAtRef = useRef<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRendering, setIsRendering] = useState(false);

  const stopSource = useCallback(() => {
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch {
        // 이미 멈춘 소스일 수 있다.
      }
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
  }, []);

  const playLoop = useCallback(async () => {
    if (!ctxRef.current) ctxRef.current = new AudioContext();
    const ctx = ctxRef.current;
    if (ctx.state === "suspended") await ctx.resume();

    setIsRendering(true);
    const buffer = await renderLoopBuffer(pattern, override);
    setIsRendering(false);

    stopSource();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(ctx.destination);
    source.start();
    sourceRef.current = source;
    startedAtRef.current = ctx.currentTime;
  }, [pattern, override, stopSource]);

  const toggle = useCallback(() => {
    if (isPlaying) {
      stopSource();
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      void playLoop();
    }
  }, [isPlaying, playLoop, stopSource]);

  // 매트릭스 편집으로 pattern/override가 바뀌면, 재생 중일 때만 즉시 다시 렌더링해서 이어붙인다.
  const seedHash = pattern.seedHash;
  useEffect(() => {
    if (isPlaying) void playLoop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedHash, override]);

  useEffect(() => stopSource, [stopSource]);

  const getElapsedSeconds = useCallback(() => {
    if (!ctxRef.current || !isPlaying) return 0;
    return ctxRef.current.currentTime - startedAtRef.current;
  }, [isPlaying]);

  return { isPlaying, isRendering, toggle, getElapsedSeconds };
}
