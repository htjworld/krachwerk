import { describe, expect, it } from "vitest";
import { classifySample, ROLE_TO_USER_SLOT, sliceUserSound } from "./userKit";

const SAMPLE_RATE = 44100;

function sine(freq: number, seconds: number, sampleRate = SAMPLE_RATE): Float32Array {
  const data = new Float32Array(Math.round(sampleRate * seconds));
  for (let i = 0; i < data.length; i++) data[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate);
  return data;
}

// 결정론적 "잡음"(테스트 전용): 진짜 무작위가 아니라 여러 배음을 섞어서 광대역 신호를 낸다.
function noise(seconds: number, sampleRate = SAMPLE_RATE): Float32Array {
  const data = new Float32Array(Math.round(sampleRate * seconds));
  let x = 0x2545f491;
  for (let i = 0; i < data.length; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    data[i] = ((x >>> 0) / 0xffffffff) * 2 - 1;
  }
  return data;
}

// 대역통과 잡음 근사: 실제 필터 대신 중심 주파수 근처 사인 몇 개를 섞어 좁은 대역 신호를 낸다
// (영점 교차율은 진짜 대역통과 잡음과 비슷하게 나온다 — 광대역 잡음처럼 매 샘플 안 뒤집힌다).
function bandpassNoise(centerFreq: number, seconds: number, sampleRate = SAMPLE_RATE): Float32Array {
  const data = new Float32Array(Math.round(sampleRate * seconds));
  const freqs = [centerFreq - 30, centerFreq, centerFreq + 30, centerFreq + 60];
  for (const f of freqs) {
    const s = sine(f, seconds, sampleRate);
    for (let i = 0; i < data.length; i++) data[i] += s[i] / freqs.length;
  }
  return data;
}

describe("classifySample (§15.4)", () => {
  it("60Hz 사인 0.3초 → kick (저음 위주)", () => {
    expect(classifySample(sine(60, 0.3), SAMPLE_RATE)).toBe("kick");
  });

  it("광대역 잡음 0.08초 → hat (영점 교차가 많다)", () => {
    expect(classifySample(noise(0.08), SAMPLE_RATE)).toBe("hat");
  });

  it("1kHz 사인 1초 → sig (길다)", () => {
    expect(classifySample(sine(1000, 1), SAMPLE_RATE)).toBe("sig");
  });

  it("대역통과 잡음 0.2초 → snare (짧고 저음도 고음 교차도 아니다)", () => {
    expect(classifySample(bandpassNoise(1200, 0.2), SAMPLE_RATE)).toBe("snare");
  });
});

describe("ROLE_TO_USER_SLOT (§15.4 표)", () => {
  it("kick/lowDrum은 kick 슬롯, backbeat는 snare, hat/openHat은 hat, perc/metal은 perc, sig는 sig", () => {
    expect(ROLE_TO_USER_SLOT.kick).toBe("kick");
    expect(ROLE_TO_USER_SLOT.lowDrum).toBe("kick");
    expect(ROLE_TO_USER_SLOT.backbeat).toBe("snare");
    expect(ROLE_TO_USER_SLOT.hat).toBe("hat");
    expect(ROLE_TO_USER_SLOT.openHat).toBe("hat");
    expect(ROLE_TO_USER_SLOT.perc).toBe("perc");
    expect(ROLE_TO_USER_SLOT.metal).toBe("perc");
    expect(ROLE_TO_USER_SLOT.sig).toBe("sig");
  });

  it("tick/calls처럼 표에 없는 역할은 매핑이 없다(사용자 소리로 안 바뀐다)", () => {
    expect(ROLE_TO_USER_SLOT.tick).toBeUndefined();
    expect(ROLE_TO_USER_SLOT.calls).toBeUndefined();
  });
});

describe("sliceUserSound", () => {
  const peakOf = (d: Float32Array) => d.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

  it("3초 이하 소리는 원 샷 하나로, 슬롯은 자동 분류하고 피크를 −1dBFS로 맞춘다", () => {
    const quiet = sine(60, 0.3).map((v) => v * 0.1);
    const slices = sliceUserSound(quiet, SAMPLE_RATE);
    expect(slices).toHaveLength(1);
    expect(slices[0].slot).toBe("kick");
    expect(peakOf(slices[0].data)).toBeCloseTo(0.89, 2);
  });

  it("긴 소리(곡)는 짧은 타격 조각 2개와 2초 목소리 조각 1개로 줄인다", () => {
    // 30초짜리 조용한 바탕 위에 센 타격 셋과 큰 소리 구간 하나.
    const song = sine(220, 30).map((v) => v * 0.05);
    const burst = noise(0.2);
    for (const at of [3, 12, 25]) song.set(burst, Math.round(at * SAMPLE_RATE));
    const loud = sine(440, 2.5);
    song.set(loud, Math.round(17 * SAMPLE_RATE));

    const slices = sliceUserSound(song, SAMPLE_RATE);
    expect(slices).toHaveLength(3);
    const [hitA, hitB, phrase] = slices;
    for (const hit of [hitA, hitB]) {
      expect(hit.slot).not.toBe("voice");
      expect(hit.data.length / SAMPLE_RATE).toBeLessThanOrEqual(0.35 + 1e-9);
    }
    expect(phrase.slot).toBe("voice");
    expect(phrase.data.length / SAMPLE_RATE).toBeLessThanOrEqual(2 + 1e-9);
    // 조각 끝은 페이드로 0에 닿아 딸깍거리지 않는다.
    for (const { data } of slices) expect(Math.abs(data[data.length - 1])).toBeLessThan(0.01);
  });
});
