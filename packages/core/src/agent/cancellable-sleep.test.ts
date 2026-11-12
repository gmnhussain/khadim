import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCancellableSleep } from "./cancellable-sleep";

describe("createCancellableSleep", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function track(promise: Promise<void>) {
    const state = { isDone: false };
    void promise.then(() => {
      state.isDone = true;
    });
    return state;
  }

  it("waits the whole delay and not a millisecond less", async () => {
    const sleep = createCancellableSleep();
    const state = track(sleep(1000, new AbortController().signal));

    await vi.advanceTimersByTimeAsync(999);
    expect(state.isDone).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(state.isDone).toBe(true);
  });

  it("ends at once when the run is cancelled during the wait (plan D-9 rule 5)", async () => {
    const sleep = createCancellableSleep();
    const controller = new AbortController();
    const state = track(sleep(60_000, controller.signal));

    await vi.advanceTimersByTimeAsync(10);
    expect(state.isDone).toBe(false);

    controller.abort();
    await vi.advanceTimersByTimeAsync(0);

    expect(state.isDone).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not wait at all when the run was already cancelled", async () => {
    const sleep = createCancellableSleep();
    const controller = new AbortController();
    controller.abort();

    const state = track(sleep(60_000, controller.signal));
    await vi.advanceTimersByTimeAsync(0);

    expect(state.isDone).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops listening for a cancel once the wait is over", async () => {
    const sleep = createCancellableSleep();
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");

    const state = track(sleep(100, controller.signal));
    await vi.advanceTimersByTimeAsync(100);

    expect(state.isDone).toBe(true);
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("never rejects, cancelled or not", async () => {
    const sleep = createCancellableSleep();
    const controller = new AbortController();
    const waiting = sleep(100, controller.signal);

    controller.abort();

    await expect(waiting).resolves.toBeUndefined();
  });
});
