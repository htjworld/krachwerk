import { describe, expect, it } from "vitest";
import {
  blueprintIdFor,
  burst16Mask,
  computeBass,
  computeRiff,
  computeScale,
  familyDrumHit,
  fourFloorGhostStep,
  fourFloorMask,
  halfBar8FillSteps,
  halfTimeMask,
  legacyDrumVariantFor,
  legacyKickPattern,
  legacyPercSteps,
  lowSeq16Mask,
  metropolisBass,
  metropolisFourFloorKick,
  metropolisHarmonyShifts,
  metropolisRiffDegrees,
  metropolisScale,
  metropolisSeq,
  metropolisSeqAccent,
  pulse2Steps,
} from "./motifs";
import { euclideanPattern } from "./blueprint";
import { RADICES, indexToGenome, type Genome } from "./genome";

describe("blueprintIdFor (§8.1)", () => {
  it("15개 값 전부 유효한 블루프린트 id를 낸다", () => {
    for (let g1 = 0; g1 < RADICES[0]; g1++) {
      expect(["compute", "metropolis", "classicBuild", "slowBurn", "doubleDrop"]).toContain(blueprintIdFor(g1));
    }
  });

  it("0–5는 compute, 6–11은 metropolis, 12/13/14는 legacy 3종이다 (40/40/20 비중)", () => {
    for (let g1 = 0; g1 <= 5; g1++) expect(blueprintIdFor(g1)).toBe("compute");
    for (let g1 = 6; g1 <= 11; g1++) expect(blueprintIdFor(g1)).toBe("metropolis");
    expect(blueprintIdFor(12)).toBe("classicBuild");
    expect(blueprintIdFor(13)).toBe("slowBurn");
    expect(blueprintIdFor(14)).toBe("doubleDrop");
  });
});

describe("legacyDrumVariantFor (§16.4 표, legacy 열, §11 단계 5)", () => {
  it("256개 값 전부 유효한 범위 안에서 나온다", () => {
    for (let g8 = 0; g8 < 256; g8++) {
      const v = legacyDrumVariantFor(g8);
      expect([3, 5, 7, 9]).toContain(v.percHits);
      expect([0, 1, 2, 3]).toContain(v.percRotation);
      expect([3, 4, 5, 6]).toContain(v.metalStart);
      expect([4, 8]).toContain(v.fillPeriodBars);
      expect(typeof v.kickStep14).toBe("boolean");
    }
  });

  it("8비트 전부가 결과에 반영된다 (각 필드가 실제로 갈린다)", () => {
    const samples = Array.from({ length: 256 }, (_, g8) => legacyDrumVariantFor(g8));
    expect(new Set(samples.map((v) => v.percHits)).size).toBe(4);
    expect(new Set(samples.map((v) => v.percRotation)).size).toBe(4);
    expect(new Set(samples.map((v) => v.metalStart)).size).toBe(4);
    expect(new Set(samples.map((v) => v.fillPeriodBars)).size).toBe(2);
    expect(new Set(samples.map((v) => v.kickStep14)).size).toBe(2);
  });
});

describe("legacyKickPattern / legacyPercSteps", () => {
  it("킥은 0·4·8·12가 항상 켜져 있고, 14는 kickStep14를 따른다", () => {
    const on = legacyKickPattern(legacyDrumVariantFor(0b10000000)); // kickStep14 = true
    const off = legacyKickPattern(legacyDrumVariantFor(0b00000000)); // kickStep14 = false
    for (const step of [0, 4, 8, 12]) {
      expect(on[step]).toBe(true);
      expect(off[step]).toBe(true);
    }
    expect(on[14]).toBe(true);
    expect(off[14]).toBe(false);
    // 그 외 스텝은 항상 꺼져 있다.
    for (const step of [1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 15]) {
      expect(on[step]).toBe(false);
    }
  });

  it("perc 패턴은 정확히 percHits개 스텝만 켜져 있다", () => {
    for (let g8 = 0; g8 < 256; g8 += 17) {
      const variant = legacyDrumVariantFor(g8);
      const steps = legacyPercSteps(variant);
      expect(steps.filter(Boolean).length).toBe(variant.percHits);
    }
  });
});

describe("euclideanPattern (§14.2 H)", () => {
  it("정확히 k개 스텝을 n개 중에 고르게 편다", () => {
    for (const k of [0, 1, 3, 5, 7, 9, 16]) {
      const pattern = euclideanPattern(k, 16, 0);
      expect(pattern.filter(Boolean).length).toBe(k);
    }
  });

  it("회전은 순서만 돌리고 타격 개수는 그대로 유지한다", () => {
    const base = euclideanPattern(5, 16, 0);
    for (let r = 1; r < 4; r++) {
      const rotated = euclideanPattern(5, 16, r);
      expect(rotated.filter(Boolean).length).toBe(base.filter(Boolean).length);
    }
  });

  it("rotation번째 타격이 스텝 0에 온다", () => {
    for (let rotation = 0; rotation < 3; rotation++) {
      const pattern = euclideanPattern(3, 16, rotation);
      expect(pattern[0]).toBe(true);
    }
  });
});

// 필드 몇 개만 지정하고 나머지는 0으로 채운 게놈. indexToGenome(0)이 전부 0인 게놈을
// 주므로 그 위에 override만 얹는다 — 순서 상관없이 항상 유효한 게놈이 나온다.
function fakeGenome(override: Partial<Genome>): Genome {
  return { ...indexToGenome(0), ...override };
}

describe("compute 조성·리프·베이스 (§16.4)", () => {
  it("computeScale이 게놈 key/mode로 이름이 다른 스케일을 만든다", () => {
    const a = computeScale(fakeGenome({ key: 0, mode: 0 }));
    const b = computeScale(fakeGenome({ key: 3, mode: 0 }));
    const c = computeScale(fakeGenome({ key: 0, mode: 2 }));
    expect(a.rootMidi).not.toBe(b.rootMidi);
    expect(a.intervals).not.toEqual(c.intervals);
  });

  it("computeRiff: 스텝 0·14·15는 항상 on, 13은 항상 off, 나머지는 riffRhythm 비트를 따른다", () => {
    const riff = computeRiff(fakeGenome({ riffRhythm: 0b000000000101, mode: 0 })); // 스텝 1,3만 on
    expect(riff[0].on).toBe(true);
    expect(riff[13].on).toBe(false);
    expect(riff[14].on).toBe(true);
    expect(riff[15].on).toBe(true);
    expect(riff[1].on).toBe(true);
    expect(riff[3].on).toBe(true);
    expect(riff[2].on).toBe(false);
  });

  it("computeBass: 리듬 템플릿 4종이 각기 다른 스텝 집합을 켠다", () => {
    const sets = [0, 1, 2, 3].map((bits) => computeBass(fakeGenome({ bassShape: bits })).flatMap((c, i) => (c.on ? [i] : [])));
    expect(new Set(sets.map((s) => s.join(","))).size).toBe(4);
  });

  it("lowSeq16Mask: 필수 스텝 0·4·8·12는 항상 켜져 있다", () => {
    for (let g8 = 0; g8 < 256; g8 += 23) {
      const mask = lowSeq16Mask(g8, 0);
      for (const step of [0, 4, 8, 12]) expect(mask[step]).toBe(true);
    }
  });

  it("fourFloorMask: 0·4·8·12 필수 + 픽업 주기(2/4마디)마다 스텝15", () => {
    const every2 = fourFloorMask(0b01000000, 1); // 비트6=1 → 2마디 주기, barIndex=1(홀수)→마지막 마디
    const every4 = fourFloorMask(0b00000000, 1); // 비트6=0 → 4마디 주기, barIndex=1은 마지막 아님
    expect(every2[15]).toBe(true);
    expect(every4[15]).toBe(false);
    for (const step of [0, 4, 8, 12]) {
      expect(every2[step]).toBe(true);
      expect(every4[step]).toBe(true);
    }
  });

  it("fourFloorGhostStep은 비트7에 따라 6 또는 9다", () => {
    expect(fourFloorGhostStep(0)).toBe(9);
    expect(fourFloorGhostStep(0b10000000)).toBe(6);
  });

  it("burst16Mask는 스텝 10~15가 비어 있다", () => {
    const mask = burst16Mask();
    for (let i = 10; i < 16; i++) expect(mask[i]).toBe(false);
    expect(mask.filter(Boolean).length).toBeGreaterThan(0);
  });
});

describe("metropolis 조성·리프·베이스 (§16.4)", () => {
  it("metropolisScale이 게놈 key/mode로 이름이 다른 스케일을 만든다", () => {
    const a = metropolisScale(fakeGenome({ key: 0, mode: 0 }));
    const b = metropolisScale(fakeGenome({ key: 0, mode: 1 }));
    expect(a.intervals).not.toEqual(b.intervals);
  });

  it("metropolisHarmonyShifts가 mode마다 다른 이동 폭을 낸다", () => {
    const shifts = [0, 1, 2, 3].map((mode) => metropolisHarmonyShifts(fakeGenome({ mode })).join("/"));
    expect(new Set(shifts).size).toBe(4);
  });

  it("metropolisRiffDegrees는 8개 디그리를 낸다 (1·4·5·6·8도 중에서)", () => {
    const degrees = metropolisRiffDegrees(fakeGenome({}));
    expect(degrees).toHaveLength(8);
    for (const d of degrees) expect([0, 3, 4, 5, 7]).toContain(d);
  });

  it("metropolisSeq: 짝수 스텝(8분 자리)마다 음이 있고, riffRhythm 비트로 다음 16분이 겹쳐진다", () => {
    const seq = metropolisSeq(fakeGenome({ riffRhythm: 0b1 })); // 비트0=1 → 스텝0 더블링
    expect(seq[0].on).toBe(true);
    expect(seq[1].on).toBe(true); // 더블링
    expect(seq[2].on).toBe(true);
    expect(seq[3].on).toBe(false); // 더블링 안 됨(비트1=0)
  });

  it("metropolisSeqAccent: 강세가 리프 비트 8~11에 따라 1.0/0.8이다", () => {
    expect(metropolisSeqAccent(fakeGenome({ riffRhythm: 0b1_0000_0000 }), 0)).toBe(1);
    expect(metropolisSeqAccent(fakeGenome({ riffRhythm: 0 }), 0)).toBe(0.8);
  });

  it("metropolisBass: 쉼표 패턴(bassShape 비트4~5)에 해당하는 스텝이 꺼진다", () => {
    const withRests = metropolisBass(fakeGenome({ bassShape: 0b010000 })); // 비트4~5=01 → 스텝6 쉼
    expect(withRests.cells[6].on).toBe(false);
    const noRests = metropolisBass(fakeGenome({ bassShape: 0 }));
    expect(noRests.cells[6].on).toBe(true);
  });

  it("metropolisFourFloorKick은 0·4·8·12만 켜져 있다", () => {
    const kick = metropolisFourFloorKick();
    expect(kick.map((v, i) => (v ? i : null)).filter((v) => v !== null)).toEqual([0, 4, 8, 12]);
  });

  it("halfBar8FillSteps는 기본 0·2·4·6에 g8이 고른 스텝을 더한다", () => {
    const steps = halfBar8FillSteps(0b10); // 비트0~1=10=2 → {2,6,7} 추가
    expect(steps).toContain(7);
  });

  it("halfTimeMask는 0·8이 필수고 세 번째 킥 자리가 갈린다", () => {
    const a = halfTimeMask(0);
    const b = halfTimeMask(0b1000);
    expect(a[0]).toBe(true);
    expect(a[8]).toBe(true);
    expect(a).not.toEqual(b);
  });

  it("pulse2Steps는 비트7에 따라 [0,8] 또는 [2,10]이다", () => {
    expect(pulse2Steps(0)).toEqual([0, 8]);
    expect(pulse2Steps(0b10000000)).toEqual([2, 10]);
  });

  it("familyDrumHit: metropolis의 fourFloor는 항상 0·4·8·12뿐이다 (compute처럼 픽업 스텝15가 없다)", () => {
    // 픽업 주기가 걸리는 조합(비트6=1 → 2마디 주기, barIndex 홀수 → 마지막 마디)을 일부러
    // 골라도, compute였다면 스텝15가 켜졌을 자리인데 metropolis는 그대로 0·4·8·12뿐이어야 한다.
    const genome = fakeGenome({ drumVariant: 0b01000000 });
    const metro = familyDrumHit("fourFloor", genome, 1, "metropolis")!;
    expect(metro.mask).toEqual(metropolisFourFloorKick());
    expect(metro.mask[15]).toBe(false);

    const comp = familyDrumHit("fourFloor", genome, 1, "compute")!;
    expect(comp.mask[15]).toBe(true); // compute는 같은 게놈·마디에서 픽업이 걸린다
  });
});
