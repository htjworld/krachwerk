import { describe, expect, it } from "vitest";
import { decodePatternOverride, encodePatternOverride, overrideFromLayers, resolveLayers } from "./patternOverride";
import { generatePattern, STEP_COUNT } from "./pattern";

describe("pattern override encoding", () => {
  it("round-trips an arbitrary on/off grid through the URL-safe encoding", () => {
    const kick = Array.from({ length: STEP_COUNT }, (_, i) => i % 3 === 0);
    const lead = Array.from({ length: STEP_COUNT }, (_, i) => i % 5 === 0);
    const override = overrideFromLayers(kick, lead);
    const encoded = encodePatternOverride(override);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodePatternOverride(encoded)).toEqual(override);
  });

  it("replaces the base kick/lead grid but keeps bass and hihat untouched", () => {
    const pattern = generatePattern("override-test");
    const override = overrideFromLayers(
      pattern.drum.kick.map((v) => !v),
      pattern.lead.map((cell) => !cell.on)
    );
    const resolved = resolveLayers(pattern, override);
    expect(resolved.kick).toEqual(override.kick);
    expect(resolved.lead.map((c) => c.on)).toEqual(override.lead);
    expect(resolved.hihat).toEqual(pattern.drum.hihat);
    expect(resolved.bass).toEqual(pattern.bass);
  });

  it("falls back to the base pattern when there is no override", () => {
    const pattern = generatePattern("no-override");
    const resolved = resolveLayers(pattern, null);
    expect(resolved.kick).toEqual(pattern.drum.kick);
    expect(resolved.lead).toEqual(pattern.lead);
  });
});
