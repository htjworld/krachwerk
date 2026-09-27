// scheduleBar가 실제로 만드는 사운드 이벤트(drums.hit / voice.note 호출)를 AudioContext
// 없이 기록하는 테스트 전용 헬퍼. pad/riser는 scheduleBar가 아니라 renderArrangement가
// createOscillator로 직접 스케줄해서 이 헬퍼가 잡지 않는다(§11 단계 2).
//
// 이걸로 "블루프린트/rateAt 리팩터 전후에 같은 시드가 같은 이벤트 목록을 내는지"를 검증한다
// (schedulingSnapshot.test.ts).

import type { DrumMixer, DrumRole, MonoVoice, Rig } from "./audioEngine";
import type { SampleBank } from "./samples";

export interface LoggedEvent {
  kind: "hit" | "note" | "hitSlice";
  layer: string;
  time: number;
  level: number;
  freq?: number;
  duration?: number;
  rate?: number;
  offset?: number;
}

function round(n: number): number {
  // 부동소수 오차로 인한 가짜 diff를 없앤다. 6자리면 오디오 타이밍엔 넘치게 충분하다.
  return Math.round(n * 1e6) / 1e6;
}

export function createEventLog(): { events: LoggedEvent[]; drums: DrumMixer; voice(layer: string): MonoVoice } {
  const events: LoggedEvent[] = [];
  const drums: DrumMixer = {
    hit(role: DrumRole, _sample, time, level, rate = 1) {
      events.push({ kind: "hit", layer: role, time: round(time), level: round(level), rate: round(rate) });
    },
    hitSlice(role: DrumRole, _buffer, offsetSec, _durSec, time, level, rate = 1) {
      events.push({
        kind: "hitSlice",
        layer: role,
        time: round(time),
        level: round(level),
        rate: round(rate),
        offset: round(offsetSec),
      });
    },
    connect() {
      // 렌더링 단계 전용. 이벤트 캡처엔 안 쓴다.
    },
    // §11 단계 5. 이벤트 캡처는 kickLowCut 오토메이션 자체를 검사하지 않으니 더미로 충분하다.
    kickHighpass: { frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, value: 20 } } as unknown as BiquadFilterNode,
  };
  return {
    events,
    drums,
    voice(layer: string): MonoVoice {
      return {
        note(time, freq, duration, level) {
          events.push({
            kind: "note",
            layer,
            time: round(time),
            level: round(level),
            freq: round(freq),
            duration: round(duration),
          });
        },
      };
    },
  };
}

// scheduleBar 하나를 실제 AudioContext 없이 돌리는 데 필요한 최소 가짜 Rig 조각.
// scheduleBar는 rig.ctx/strips/noise를 안 읽으므로 채우지 않는다.

function noopParam() {
  return { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, value: 0 };
}

export interface RecordedAutomation {
  method: "setValueAtTime" | "linearRampToValueAtTime" | "exponentialRampToValueAtTime";
  value: number;
  time: number;
}

/** 사이드체인처럼 "이 GainNode에 실제로 오토메이션이 찍혔는가"를 검사해야 하는 테스트용
 *  가짜 GainNode. AudioContext 없이도 setValueAtTime 등 호출을 그대로 기록한다. */
export function fakeRecordingGain(): { node: GainNode; calls: RecordedAutomation[] } {
  const calls: RecordedAutomation[] = [];
  const gain = {
    value: 1,
    setValueAtTime(value: number, time: number) {
      calls.push({ method: "setValueAtTime", value, time });
    },
    linearRampToValueAtTime(value: number, time: number) {
      calls.push({ method: "linearRampToValueAtTime", value, time });
    },
    exponentialRampToValueAtTime(value: number, time: number) {
      calls.push({ method: "exponentialRampToValueAtTime", value, time });
    },
  };
  return { node: { gain } as unknown as GainNode, calls };
}

export function fakeSampleBank(): SampleBank {
  // 어떤 SampleId로 읽어도 더미 객체를 돌려준다. 이벤트 비교엔 샘플 내용이 안 쓰인다.
  return new Proxy({}, { get: () => ({}) }) as SampleBank;
}

export function fakeMix(): Rig["mix"] {
  const gainNode = { gain: noopParam() } as unknown as GainNode;
  return {
    drum: gainNode,
    music: gainNode,
    sidechain: gainNode,
    reverbSend: gainNode,
    delaySend: gainNode,
    tone: { frequency: noopParam() } as unknown as BiquadFilterNode,
    master: gainNode,
  };
}
