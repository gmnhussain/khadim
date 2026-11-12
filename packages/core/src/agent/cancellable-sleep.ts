import type { Sleep } from "./agent.types";

/** Creates the real sleep: a timer that a cancel ends at once (plan D-9 rule 5). */
export function createCancellableSleep(): Sleep {
  return (delayMs, signal) =>
    new Promise<void>((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }
      const onAbort = (): void => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, delayMs);
      signal.addEventListener("abort", onAbort, { once: true });
    });
}
