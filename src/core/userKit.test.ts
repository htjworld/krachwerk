import { describe, expect, it } from "vitest";
import { classifySample, ROLE_TO_USER_SLOT } from "./userKit";

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
