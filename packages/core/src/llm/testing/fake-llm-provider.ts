import type { LlmError } from "../llm.errors";
import type { LlmProvider } from "../llm.port";
import type { LlmCapabilities, LlmRequest, LlmResponse, LlmStreamEvent } from "../llm.types";

/** One scripted model call: a completed response, or a failure after some stream events. */
export type FakeLlmStep =
  | { readonly kind: "response"; readonly response: LlmResponse }
  | {
      readonly kind: "failure";
      readonly error: LlmError;
      /** Events a streamed call reports before it fails. Default: none. */
      readonly eventsBeforeFailure?: readonly LlmStreamEvent[] | undefined;
    };

/** Options of `createFakeLlmProvider`. */
export interface FakeLlmProviderOptions {
  /** The calls the provider answers, in order. One more call than steps is a test bug. */
  readonly steps: readonly FakeLlmStep[];
  readonly providerId?: string | undefined;
  readonly capabilities?: LlmCapabilities | undefined;
}

/** A scripted provider and the requests it received, in order. */
export interface FakeLlmProvider {
  readonly provider: LlmProvider;
  readonly requests: readonly LlmRequest[];
}

const DEFAULT_PROVIDER_ID = "fake";

const DEFAULT_CAPABILITIES: LlmCapabilities = {
  supportsTools: true,
  supportsStreaming: true,
  supportsImages: false,
  supportsStructuredOutput: false,
  supportsPromptCaching: true,
  maxContextTokens: 200_000,
};

/** The events a real stream would report for a completed response. */
function eventsOf(response: LlmResponse): LlmStreamEvent[] {
  const events: LlmStreamEvent[] = [{ type: "started" }];
  for (const part of response.content) {
    switch (part.type) {
      case "reasoning":
        events.push({ type: "reasoning" });
        break;
      case "text":
        events.push({ type: "text_delta", text: part.text });
        break;
      case "tool_call":
        events.push({
          type: "tool_call_started",
          toolCallId: part.toolCallId,
          toolName: part.toolName,
        });
        break;
    }
  }
  events.push({ type: "completed", response });
  return events;
}

function iterate(
  events: readonly LlmStreamEvent[],
  failure: LlmError | undefined,
): AsyncIterable<LlmStreamEvent> {
  return {
    [Symbol.asyncIterator]() {
      let index = 0;
      return {
        next(): Promise<IteratorResult<LlmStreamEvent, undefined>> {
          const event = events[index];
          if (event !== undefined) {
            index += 1;
            return Promise.resolve({ done: false, value: event });
          }
          return failure === undefined
            ? Promise.resolve({ done: true, value: undefined })
            : Promise.reject(failure);
        },
      };
    },
  };
}

/** Creates a provider that replays a script, so the loop is tested without a model (ADR-0005). */
export function createFakeLlmProvider(options: FakeLlmProviderOptions): FakeLlmProvider {
  const requests: LlmRequest[] = [];
  let nextStepIndex = 0;

  function takeStep(request: LlmRequest): FakeLlmStep {
    requests.push(request);
    const step = options.steps[nextStepIndex];
    if (step === undefined) {
      throw new Error(`fake LLM provider has no step for call ${nextStepIndex + 1}`);
    }
    nextStepIndex += 1;
    return step;
  }

  const provider: LlmProvider = {
    providerId: options.providerId ?? DEFAULT_PROVIDER_ID,
    capabilities: options.capabilities ?? DEFAULT_CAPABILITIES,
    generate(request) {
      const step = takeStep(request);
      return step.kind === "response" ? Promise.resolve(step.response) : Promise.reject(step.error);
    },
    stream(request) {
      const step = takeStep(request);
      return step.kind === "response"
        ? iterate(eventsOf(step.response), undefined)
        : iterate(step.eventsBeforeFailure ?? [], step.error);
    },
  };

  return { provider, requests };
}
