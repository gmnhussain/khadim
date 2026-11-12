import type { Sleep } from "../agent.types";

/** Options of `createFakeSleep`. */
export interface FakeSleepOptions {
  /** Moves the test clock: a wait that is not cancelled advances it by the whole delay. */
  readonly advanceBy: (milliseconds: number) => void;
  /** Called at the start of every wait, for example to cancel the run during it. */
  readonly onSleep?: ((delayMs: number) => void) | undefined;
}

/** A sleep that returns at once and the delays it was asked to wait, in order. */
export interface FakeSleep {
  readonly sleep: Sleep;
  readonly delays: readonly number[];
  /** The delays that ran to their end; a cancelled wait is not among them. */
  readonly completedDelays: readonly number[];
}

/** Creates a sleep for tests: no real waiting, and a cancel ends the wait without moving the clock. */
export function createFakeSleep(options: FakeSleepOptions): FakeSleep {
  const delays: number[] = [];
  const completedDelays: number[] = [];
  return {
    delays,
    completedDelays,
    sleep(delayMs, signal) {
      delays.push(delayMs);
      options.onSleep?.(delayMs);
      if (!signal.aborted) {
        options.advanceBy(delayMs);
        completedDelays.push(delayMs);
      }
      return Promise.resolve();
    },
  };
}
