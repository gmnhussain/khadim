import type { PendingActionRequest, RequestPendingAction } from "../agent.types";

/** A fake approvals module: it hands out ids and remembers what it was asked. */
export interface FakePendingActions {
  readonly requestPendingAction: RequestPendingAction;
  readonly requests: readonly PendingActionRequest[];
}

/** Creates a fake that answers `pending_1`, `pending_2`, … (the real one arrives in Phase 3). */
export function createFakePendingActions(): FakePendingActions {
  const requests: PendingActionRequest[] = [];
  return {
    requests,
    requestPendingAction(request) {
      requests.push(request);
      return Promise.resolve({ pendingActionId: `pending_${requests.length}` });
    },
  };
}
