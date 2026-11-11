import { describe, expect, it } from "vitest";

import { createFixedClock } from "./fixed-clock";

describe("createFixedClock", () => {
  it("returns its start time until it is moved", () => {
    const clock = createFixedClock("2026-11-12T09:30:00.000Z");

    expect(clock.now().toISOString()).toBe("2026-11-12T09:30:00.000Z");
    expect(clock.now().toISOString()).toBe("2026-11-12T09:30:00.000Z");
  });

  it("moves forward by the given milliseconds", () => {
    const clock = createFixedClock("2026-11-12T09:30:00.000Z");

    clock.advanceBy(1500);
    clock.advanceBy(0);

    expect(clock.now().toISOString()).toBe("2026-11-12T09:30:01.500Z");
  });

  it("returns a new Date on every call, so changing one does not move the clock", () => {
    const clock = createFixedClock("2026-11-12T09:30:00.000Z");

    clock.now().setUTCFullYear(2000);

    expect(clock.now().toISOString()).toBe("2026-11-12T09:30:00.000Z");
  });

  it("refuses a start that is not a timestamp", () => {
    expect(() => createFixedClock("yesterday")).toThrow("not an ISO 8601 timestamp");
  });

  it.each([-1, 0.5, Number.NaN])("refuses to move by %d milliseconds", (milliseconds) => {
    const clock = createFixedClock("2026-11-12T09:30:00.000Z");

    expect(() => {
      clock.advanceBy(milliseconds);
    }).toThrow("only moves forward by whole milliseconds");
    expect(clock.now().toISOString()).toBe("2026-11-12T09:30:00.000Z");
  });
});
