import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ageLabel, ageLevel, daysSince } from "@/lib/age-color";

const thresholds = { green: 3, yellow: 7, orange: 14 };

describe("daysSince", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null for missing or invalid dates", () => {
    expect(daysSince(null)).toBeNull();
    expect(daysSince(undefined)).toBeNull();
    expect(daysSince("not-a-date")).toBeNull();
  });

  it("returns whole days elapsed", () => {
    expect(daysSince(new Date("2026-07-21T11:00:00Z"))).toBe(0);
    expect(daysSince(new Date("2026-07-20T12:00:00Z"))).toBe(1);
    expect(daysSince("2026-07-14T12:00:00Z")).toBe(7);
  });
});

describe("ageLevel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns unknown when never dried/cleaned", () => {
    expect(ageLevel(null, thresholds)).toBe("unknown");
  });

  it("ramps green -> yellow -> orange -> red", () => {
    expect(ageLevel(new Date("2026-07-20T12:00:00Z"), thresholds)).toBe(
      "green",
    );
    expect(ageLevel(new Date("2026-07-16T12:00:00Z"), thresholds)).toBe(
      "yellow",
    );
    expect(ageLevel(new Date("2026-07-10T12:00:00Z"), thresholds)).toBe(
      "orange",
    );
    expect(ageLevel(new Date("2026-07-01T12:00:00Z"), thresholds)).toBe("red");
  });
});

describe("ageLabel", () => {
  it("formats human-readable labels", () => {
    expect(ageLabel(null)).toBe("Never");
    expect(ageLabel(0)).toBe("Today");
    expect(ageLabel(1)).toBe("1 day ago");
    expect(ageLabel(12)).toBe("12 days ago");
  });
});
