import { describe, expect, it } from "vitest";

import { createSystemClock } from "./clock";

describe("createSystemClock", () => {
  it("returns the current time", () => {
    const clock = createSystemClock();

    const before = Date.now();
    const now = clock.now().getTime();
    const after = Date.now();

    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(after);
  });

  it("returns a new Date on every call, so a caller cannot change another caller's time", () => {
    const clock = createSystemClock();

    expect(clock.now()).not.toBe(clock.now());
  });
});
