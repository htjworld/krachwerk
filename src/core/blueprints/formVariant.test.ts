// 창의성 감사(2026-09-27): form 남은 비트가 실제로 구조를 바꾸는지 검증한다(§13.1
// resolvedBlueprintFor). open/k는 R9(고정 스냅샷) 때문에 절대 안 바뀌어야 한다.
import { describe, expect, it } from "vitest";
import { generatePattern } from "../pattern";
import { blueprintFor, resolvedBlueprintFor } from "./index";
import { applyDIntroVariant, tapeJam, fourFloorJam } from "./delroy";
import { applyPFormVariant, clubHouse, slowJam } from "./peggy";
import { applyFFormVariant, garageShuffle, halfStep, switchUp } from "./fred";

describe("open/k는 resolvedBlueprintFor에서도 건드리지 않는다(R9)", () => {
  it("styleGenome이 null이면 blueprintFor와 완전히 같은 참조를 돌려준다", () => {
    const pattern = generatePattern("t000000000"); // t = 테크노(open) 장르
    expect(pattern.styleGenome).toBeNull();
    expect(resolvedBlueprintFor(pattern)).toBe(blueprintFor(pattern.blueprintId));
  });
});

describe("applyDIntroVariant", () => {
  it("tapeJam만 바꾸고 fourFloorJam은 그대로 둔다", () => {
    expect(applyDIntroVariant(fourFloorJam, 1)).toBe(fourFloorJam);
  });

  it("form%3 세 갈래가 서로 다른 첫 섹션을 만든다", () => {
    const variants = [0, 1, 2].map((form) => applyDIntroVariant(tapeJam, form).sections[0]);
    const cueLayers = variants.map((s) => s.cues.map((c) => c.layer).sort().join(","));
    expect(new Set(cueLayers).size).toBe(3);
  });

  it("나머지 섹션은 안 바뀐다", () => {
    const mutated = applyDIntroVariant(tapeJam, 1);
    expect(mutated.sections.slice(1)).toEqual(tapeJam.sections.slice(1));
  });
});

describe("applyPFormVariant", () => {
  it("clubHouse: 비트0=0이면 break2/build가 빠진다", () => {
    const mutated = applyPFormVariant(clubHouse, 0);
    const ids = mutated.sections.map((s) => s.id);
    expect(ids).not.toContain("break2");
    expect(ids).not.toContain("build");
  });

  it("clubHouse: 비트0=1이면 break2/build가 남는다", () => {
    const mutated = applyPFormVariant(clubHouse, 1);
    const ids = mutated.sections.map((s) => s.id);
    expect(ids).toContain("break2");
    expect(ids).toContain("build");
  });

  it("clubHouse: 비트1이 synthIn/chant1 순서를 바꾼다", () => {
    const a = applyPFormVariant(clubHouse, 1).sections.map((s) => s.id);
    const b = applyPFormVariant(clubHouse, 3).sections.map((s) => s.id);
    expect(a.indexOf("synthIn")).toBeLessThan(a.indexOf("chant1"));
    expect(b.indexOf("chant1")).toBeLessThan(b.indexOf("synthIn"));
  });

  it("slowJam: 비트0이 intro/drumsIn 순서를, 비트1이 turn 유무를 바꾼다", () => {
    const base = applyPFormVariant(slowJam, 8).sections.map((s) => s.id);
    const swapped = applyPFormVariant(slowJam, 9).sections.map((s) => s.id);
    expect(base.indexOf("intro")).toBeLessThan(base.indexOf("drumsIn"));
    expect(swapped.indexOf("drumsIn")).toBeLessThan(swapped.indexOf("intro"));

    const noTurn = applyPFormVariant(slowJam, 8).sections.map((s) => s.id);
    const withTurn = applyPFormVariant(slowJam, 10).sections.map((s) => s.id);
    expect(noTurn).not.toContain("turn");
    expect(withTurn).toContain("turn");
  });
});

describe("applyFFormVariant", () => {
  it("garageShuffle: 비트0이 voiceStop 유무를, 비트1이 voiceOnly 마무리를 바꾼다", () => {
    const withStop = applyFFormVariant(garageShuffle, 3).sections.map((s) => s.id);
    const withoutStop = applyFFormVariant(garageShuffle, 2).sections.map((s) => s.id);
    expect(withStop).toContain("voiceStop");
    expect(withoutStop).not.toContain("voiceStop");

    const kept = applyFFormVariant(garageShuffle, 3).sections.map((s) => s.id);
    expect(kept).not.toContain("voiceOnly");
    const replaced = applyFFormVariant(garageShuffle, 1).sections.map((s) => s.id);
    expect(replaced).toContain("voiceOnly");
  });

  it("halfStep: 비트0이 dropOut3을, 비트1이 strip을 뺀다", () => {
    const ids = applyFFormVariant(halfStep, 0).sections.map((s) => s.id);
    expect(ids).not.toContain("dropOut3");
    expect(ids).not.toContain("strip");
    const full = applyFFormVariant(halfStep, 3).sections.map((s) => s.id);
    expect(full).toContain("dropOut3");
    expect(full).toContain("strip");
  });

  it("switchUp은 비트와 무관하게 그대로다", () => {
    expect(applyFFormVariant(switchUp, 0)).toBe(switchUp);
    expect(applyFFormVariant(switchUp, 3)).toBe(switchUp);
  });
});
