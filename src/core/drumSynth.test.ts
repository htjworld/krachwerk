// §11 단계 6: drumSynth.ts의 새 킷 표(§7.2)는 실제 오디오 렌더 없이는(OfflineAudioContext가
// 이 테스트 환경에 없다 — vitest.config.ts environment: "node") 여기서 못 듣는다. 그건
// 브라우저에서 직접 확인한다(§12 단계 6 증거: "원샷 전부 무음·NaN 없음"). 여기서는 손으로
// 옮겨 적은 §7.2 표 자체가 게놈 kit 분해(§7.3, 8×8×6=384 / 6×6=36)와 어긋나지 않는지만 본다 —
// 숫자를 옮기다 배열 길이를 틀리는 것 같은 실수를 잡는 테스트다.
import { describe, expect, it } from "vitest";
import { HATS, KICKS, SNARES, kraftwerkKitIndices, styleKitIndices, type StyleFamily } from "./drumSynth";

const FAMILIES: StyleFamily[] = ["tape", "house", "garage"];

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

describe("§7.2 스타일 킷 표", () => {
  it.each(FAMILIES)("%s: 킥 8개·스네어 8개·햇 6개 (게놈 kit 384 = 8×8×6)", (family) => {
    expect(KICKS[family]).toHaveLength(8);
    expect(SNARES[family]).toHaveLength(8);
    expect(HATS[family]).toHaveLength(6);
  });

  it.each(FAMILIES)("%s: 킥 프리셋 수치가 전부 유한하고, 시작Hz > 본체Hz > 0", (family) => {
    for (const k of KICKS[family]) {
      expect(isFiniteNumber(k.startHz)).toBe(true);
      expect(isFiniteNumber(k.bodyHz)).toBe(true);
      expect(k.startHz).toBeGreaterThan(k.bodyHz);
      expect(k.bodyHz).toBeGreaterThan(0);
      expect(k.pitchDecayMs).toBeGreaterThan(0);
      expect(k.ampDecayMs).toBeGreaterThan(0);
      expect(k.click).toBeGreaterThanOrEqual(0);
      expect(k.click).toBeLessThanOrEqual(1);
      expect(k.drive).toBeGreaterThanOrEqual(1);
      expect(k.lowpassHz).toBeGreaterThan(0);
    }
  });

  it("styleKitIndices: kit 0~383이 kickIdx 0~7 · snareIdx 0~7 · hatIdx 0~5 조합 384개를 정확히 한 번씩 덮는다", () => {
    const seen = new Set<string>();
    for (let kit = 0; kit < 384; kit++) {
      const { kickIdx, snareIdx, hatIdx } = styleKitIndices(kit);
      expect(kickIdx).toBeGreaterThanOrEqual(0);
      expect(kickIdx).toBeLessThan(8);
      expect(snareIdx).toBeGreaterThanOrEqual(0);
      expect(snareIdx).toBeLessThan(8);
      expect(hatIdx).toBeGreaterThanOrEqual(0);
      expect(hatIdx).toBeLessThan(6);
      seen.add(`${kickIdx}:${snareIdx}:${hatIdx}`);
    }
    expect(seen.size).toBe(384);
  });

  it("kraftwerkKitIndices: kit 0~35가 j 0~5 · m 0~5 조합 36개를 정확히 한 번씩 덮는다 (게놈 kit 36)", () => {
    const seen = new Set<string>();
    for (let kit = 0; kit < 36; kit++) {
      const { j, m } = kraftwerkKitIndices(kit);
      expect(j).toBeGreaterThanOrEqual(0);
      expect(j).toBeLessThan(6);
      expect(m).toBeGreaterThanOrEqual(0);
      expect(m).toBeLessThan(6);
      seen.add(`${j}:${m}`);
    }
    expect(seen.size).toBe(36);
  });
});
