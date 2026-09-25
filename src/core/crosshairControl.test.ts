import { describe, expect, it } from "vitest";
import { decodeCrosshairControl, encodeCrosshairControl } from "./crosshairControl";

describe("crosshair control encoding", () => {
  it("round-trips tempo and filter cutoff through the URL-safe encoding", () => {
    const control = { tempo: 118, filterCutoff: 0.42 };
    const encoded = encodeCrosshairControl(control);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    const decoded = decodeCrosshairControl(encoded);
    expect(decoded?.tempo).toBe(118);
    expect(decoded?.filterCutoff).toBeCloseTo(0.42, 2);
  });

  it("clamps tempo to the 104-132 BPM range on decode", () => {
    const encoded = encodeCrosshairControl({ tempo: 132, filterCutoff: 1 });
    expect(decodeCrosshairControl(encoded)).toEqual({ tempo: 132, filterCutoff: 1 });
  });

  it("returns null for malformed input", () => {
    expect(decodeCrosshairControl("!!!")).toBeNull();
  });
});
