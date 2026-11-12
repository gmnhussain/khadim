import type { LlmProblem } from "@khadim/core/llm/llm.errors";
import type { LlmProvider } from "@khadim/core/llm/llm.port";
import type { LlmRequest, LlmResponse, LlmUsage } from "@khadim/core/llm/llm.types";

/**
 * One HTTP exchange with a provider, in the shape the recording script writes. A hand-built
 * fixture has the same shape, so a recording can replace it without any change to the suite.
 */
export interface LlmHttpFixture {
  readonly name: string;
  readonly model: string;
  readonly request: { readonly body: unknown };
  readonly response: {
    readonly status: number;
    readonly headers: Readonly<Record<string, string>>;
    readonly body: string;
  };
}

/** How a case calls the provider. */
export type LlmContractMode = "generate" | "stream";

/** A tool call the model is expected to ask for. */
export interface ExpectedToolCall {
  readonly toolName: string;
  readonly input: unknown;
}

/**
 * What a completed call must map to. The stop reason is always checked; the exact values are
 * checked when given, so a recording whose wording or counts differ only changes these values.
 */
export interface ExpectedCompletion {
  readonly outcome: "completed";
  readonly stopReason: LlmResponse["stopReason"];
  readonly text?: string | undefined;
  readonly toolCalls?: readonly ExpectedToolCall[] | undefined;
  readonly usage?: LlmUsage | undefined;
  /** The call must report tokens written to, or read from, the prompt cache. */
  readonly cache?: "write" | "read" | undefined;
}

/** What a failed call must map to. */
export interface ExpectedFailure {
  readonly outcome: "failed";
  readonly problem: LlmProblem;
  readonly retryAfterMs?: number | undefined;
  readonly usage?: LlmUsage | undefined;
  /** Text a streamed call reported before it failed; checked when given. */
  readonly emittedText?: string | undefined;
}

/** One case: a request, the exchange that answers it, and what the adapter must make of it. */
export interface LlmContractCase {
  readonly fixture: LlmHttpFixture;
  readonly mode: LlmContractMode;
  readonly request: LlmRequest;
  readonly expected: ExpectedCompletion | ExpectedFailure;
}

/** A tool call and the turn that follows it, which replays the model's own parts. */
export interface LlmContractToolTurn {
  /** The streamed call in which the model reasons and asks for the tool. */
  readonly call: LlmContractCase;
  /** Builds the next request from what the adapter returned for `call`. */
  readonly buildResultRequest: (toolCallResponse: LlmResponse) => LlmRequest;
  /** The exchange that answers the replayed turn. */
  readonly result: {
    readonly fixture: LlmHttpFixture;
    readonly mode: LlmContractMode;
    readonly expected: ExpectedCompletion;
  };
}

/** What an adapter gives the shared contract suite. */
export interface LlmContractOptions {
  readonly providerName: string;
  /** The URL the adapter posts model calls to; the suite answers it from the fixtures. */
  readonly endpointUrl: string;
  readonly createProvider: () => LlmProvider;
  readonly cases: readonly LlmContractCase[];
  readonly toolTurn: LlmContractToolTurn;
  /**
   * The opaque values of the reasoning the provider returned in a fixture, as they appear on
   * the wire. Each must be found, character for character, in the request that replays them.
   */
  readonly readReasoningWireValues: (fixture: LlmHttpFixture) => readonly string[];
  /** Fails when a request body holds a field the provider rejects. Runs on every request. */
  readonly checkRequestBody: (body: unknown) => void;
}
