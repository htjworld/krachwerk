import type { Pattern } from "./pattern";

// 4.5 크로스헤어 컨트롤: 가로 드래그는 템포(104-132 BPM), 세로 드래그는 톤(로우패스 필터
// 컷오프, 0=어둡게 걸림 ~ 1=필터 없이 열림)을 실시간으로 조정한다.
export interface CrosshairControl {
  tempo: number;
  filterCutoff: number;
}

export function defaultCrosshairControl(pattern: Pattern): CrosshairControl {
  return { tempo: pattern.tempo, filterCutoff: 1 };
}

export function effectiveTempo(pattern: Pattern, control: CrosshairControl | null): number {
  return control?.tempo ?? pattern.tempo;
}

export function encodeCrosshairControl(control: CrosshairControl): string {
  const bytes = new Uint8Array([
    Math.max(0, Math.min(255, Math.round(control.tempo - 104))),
    Math.max(0, Math.min(255, Math.round(control.filterCutoff * 255))),
  ]);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeCrosshairControl(encoded: string): CrosshairControl | null {
  try {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    const binary = atob(base64);
    if (binary.length < 2) return null;
    return {
      tempo: Math.min(132, Math.max(104, 104 + binary.charCodeAt(0))),
      filterCutoff: Math.min(1, Math.max(0, binary.charCodeAt(1) / 255)),
    };
  } catch {
    return null;
  }
}
