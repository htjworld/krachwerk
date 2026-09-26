export interface Scale {
  id: string;
  name: string;
  rootMidi: number;
  // 루트로부터의 반음 간격 (한 옥타브 안)
  intervals: number[];
}

export const SCALES: readonly Scale[] = [
  { id: "aMinor", name: "A Minor", rootMidi: 57, intervals: [0, 2, 3, 5, 7, 8, 10] },
  { id: "dDorian", name: "D Dorian", rootMidi: 50, intervals: [0, 2, 3, 5, 7, 9, 10] },
  { id: "gMinorPentatonic", name: "G Minor Pentatonic", rootMidi: 55, intervals: [0, 3, 5, 7, 10] },
  { id: "ePhrygian", name: "E Phrygian", rootMidi: 52, intervals: [0, 1, 3, 5, 7, 8, 10] },
];

const PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

/** compute/metropolis용: 게놈 key(반음 0~11)·mode가 고른 음계 간격으로 Scale을 짓는다
 *  (§16.4). rootMidi는 48(C3) + rootPc로, legacy의 고정 SCALES와 같은 중저역대에 놓는다. */
export function makeScale(rootPc: number, intervals: readonly number[], modeName: string): Scale {
  const pc = ((rootPc % 12) + 12) % 12;
  return {
    id: `${PITCH_NAMES[pc]}${modeName}`.replace(/\s/g, ""),
    name: `${PITCH_NAMES[pc]} ${modeName}`,
    rootMidi: 48 + pc,
    intervals: [...intervals],
  };
}

// scaleDegree: 스케일 내 임의의 인덱스(음수/양수 모두 허용, 옥타브를 넘나든다)를 MIDI 노트로 변환.
export function degreeToMidi(scale: Scale, degree: number): number {
  const len = scale.intervals.length;
  const octave = Math.floor(degree / len);
  const index = ((degree % len) + len) % len;
  return scale.rootMidi + octave * 12 + scale.intervals[index];
}

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
