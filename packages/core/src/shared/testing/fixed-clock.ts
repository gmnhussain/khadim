import type { Clock } from "../clock";

/** A clock that only moves when a test moves it. */
export interface FixedClock extends Clock {
  readonly advanceBy: (milliseconds: number) => void;
}

/**
 * An ISO 8601 date and time with `Z` or an offset. Without a zone, `Date.parse` reads the time as
 * local, so the same test would see another instant on another machine (finding #4).
 */
const ISO_TIMESTAMP_WITH_ZONE_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

/** Creates a clock fixed at `start` (an ISO 8601 timestamp) until `advanceBy` moves it. */
export function createFixedClock(start: string): FixedClock {
  let currentMs = ISO_TIMESTAMP_WITH_ZONE_PATTERN.test(start) ? Date.parse(start) : Number.NaN;
  if (Number.isNaN(currentMs)) {
    throw new Error(`fixed clock start is not an ISO 8601 timestamp with a zone: ${start}`);
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
