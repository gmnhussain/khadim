/** Source of the current time, injected so no rule or service reads the system clock (conventions §7). */
export interface Clock {
  readonly now: () => Date;
}

/** The real clock, created once in a composition root. */
export function createSystemClock(): Clock {
  return { now: () => new Date() };
}
