import type { Clock } from "../clock";

/** A clock that only moves when a test moves it. */
export interface FixedClock extends Clock {
  readonly advanceBy: (milliseconds: number) => void;
}

/** Creates a clock fixed at `start` (an ISO 8601 timestamp) until `advanceBy` moves it. */
export function createFixedClock(start: string): FixedClock {
  let currentMs = Date.parse(start);
  if (Number.isNaN(currentMs)) {
    throw new Error(`fixed clock start is not an ISO 8601 timestamp: ${start}`);
  }
  return {
    now: () => new Date(currentMs),
    advanceBy(milliseconds) {
      if (!Number.isInteger(milliseconds) || milliseconds < 0) {
        throw new Error(`a fixed clock only moves forward by whole milliseconds: ${milliseconds}`);
      }
      currentMs += milliseconds;
    },
  };
}
