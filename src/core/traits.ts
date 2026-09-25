import { generatePattern, type Pattern } from "./pattern";
import { VOICES } from "./voices";

export type MelodyStyle = "minimal" | "elaborate" | null;

export interface TraitSelection {
  bassEmphasis: boolean;
  unusualTimbre: boolean;
  melodyStyle: MelodyStyle;
}

export const NO_TRAITS: TraitSelection = {
  bassEmphasis: false,
  unusualTimbre: false,
  melodyStyle: null,
};

function isUnusual(voiceId: string): boolean {
  return VOICES.find((v) => v.id === voiceId)?.unusual ?? false;
}

export function traitsMatch(pattern: Pattern, traits: TraitSelection): boolean {
  if (traits.bassEmphasis) {
    const density = pattern.bass.filter((s) => s.on).length;
    if (density <= 8) return false;
  }
  if (traits.unusualTimbre) {
    if (!isUnusual(pattern.bassVoice) && !isUnusual(pattern.leadVoice)) return false;
  }
  if (traits.melodyStyle) {
    const active = pattern.lead.filter((s) => s.on).length;
    if (traits.melodyStyle === "minimal" && active > 5) return false;
    if (traits.melodyStyle === "elaborate" && active < 10) return false;
  }
  return true;
}

export function randomSeedCandidate(): string {
  return Math.random().toString(36).slice(2, 10);
}

// 성향 태그에 맞는 결과가 나올 때까지 무작위 후보 시드를 계속 뽑는다 (4.2).
// 반환된 시드 문자열만으로 이 트랙은 완전히 재현된다. traits는 검색 필터일 뿐 결과에 저장되지 않는다.
export function findSeedForTraits(traits: TraitSelection, maxAttempts = 300): string {
  if (!traits.bassEmphasis && !traits.unusualTimbre && !traits.melodyStyle) {
    return randomSeedCandidate();
  }
  let candidate = randomSeedCandidate();
  for (let i = 0; i < maxAttempts; i++) {
    candidate = randomSeedCandidate();
    if (traitsMatch(generatePattern(candidate), traits)) return candidate;
  }
  return candidate;
}
