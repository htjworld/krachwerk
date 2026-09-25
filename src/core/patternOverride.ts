import { STEP_COUNT, type Pattern, type StepCell } from "./pattern";

// 매트릭스 에디터에서 편집 가능한 두 레이어(DRUM=킥, MELO=리드)의 on/off 상태 전체를
// 16비트씩 담아 32비트 정수 하나로 압축하고 base64url로 인코딩한다.
export interface PatternOverride {
  kick: boolean[];
  lead: boolean[];
}

function stepsToBits(steps: boolean[]): number {
  let bits = 0;
  for (let i = 0; i < STEP_COUNT; i++) {
    if (steps[i]) bits |= 1 << i;
  }
  return bits;
}

function bitsToSteps(bits: number): boolean[] {
  return Array.from({ length: STEP_COUNT }, (_, i) => (bits & (1 << i)) !== 0);
}

export function encodePatternOverride(override: PatternOverride): string {
  const packed = (stepsToBits(override.kick) | (stepsToBits(override.lead) << STEP_COUNT)) >>> 0;
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, packed, false);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodePatternOverride(encoded: string): PatternOverride | null {
  try {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    const binary = atob(base64);
    if (binary.length < 4) return null;
    const bytes = new Uint8Array(4);
    for (let i = 0; i < 4; i++) bytes[i] = binary.charCodeAt(i);
    const packed = new DataView(bytes.buffer).getUint32(0, false);
    return {
      kick: bitsToSteps(packed & 0xffff),
      lead: bitsToSteps((packed >>> STEP_COUNT) & 0xffff),
    };
  } catch {
    return null;
  }
}

export function overrideFromLayers(kick: boolean[], lead: boolean[]): PatternOverride {
  return { kick: kick.slice(0, STEP_COUNT), lead: lead.slice(0, STEP_COUNT) };
}

export interface ResolvedLayers {
  kick: boolean[];
  hihat: boolean[];
  bass: StepCell[];
  lead: StepCell[];
}

// 시드가 만든 기본 패턴 위에 pattern 파라미터(override)를 덮어씌운 최종 재생 상태.
// override가 없으면 기본 패턴 그대로다 (4.4).
export function resolveLayers(pattern: Pattern, override?: PatternOverride | null): ResolvedLayers {
  if (!override) {
    return { kick: pattern.drum.kick, hihat: pattern.drum.hihat, bass: pattern.bass, lead: pattern.lead };
  }
  return {
    kick: override.kick,
    hihat: pattern.drum.hihat,
    bass: pattern.bass,
    lead: pattern.lead.map((cell, i) => ({ degree: cell.degree, on: override.lead[i] })),
  };
}
