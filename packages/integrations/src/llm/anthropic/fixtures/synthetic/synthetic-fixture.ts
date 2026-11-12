import type Anthropic from "@anthropic-ai/sdk";

import type { LlmHttpFixture } from "../../../../testing/contract/llm-contract.types";
import { buildMessage, buildUsage, sseEvent } from "../../testing/anthropic-shapes";

/**
 * Builders of the hand-built fixtures. Every request body, message, stream event and error is
 * typed with the SDK's own types, so a shape the pinned SDK does not know fails typecheck.
 * The fixtures follow Anthropic's documentation; none was recorded from the live API.
 */

/** The model every fixture names: the cheapest current one (plan D-1). */
export const SYNTHETIC_MODEL = "claude-haiku-5-5";

const JSON_HEADERS = { "content-type": "application/json" };
const STREAM_HEADERS = { "content-type": "text/event-stream" };

/** A stream event as the API sends it: an SDK event, a ping, or an error in mid-stream. */
export type SyntheticStreamEvent =
  | Anthropic.RawMessageStreamEvent
  | { readonly type: "ping" }
  | { readonly type: "error"; readonly error: Anthropic.ErrorObject };

/** The token counts of a stream's last `message_delta`; they are cumulative. */
export interface SyntheticStreamUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheWriteTokens?: number;
  readonly cacheReadTokens?: number;
}

/** A finished message with the fields every response carries. */
export function buildSyntheticMessage(
  id: string,
  fields: Pick<Anthropic.Message, "content" | "stop_reason" | "usage"> &
    Partial<Pick<Anthropic.Message, "stop_details">>,
): Anthropic.Message {
  // The Message skeleton lives in one place, the shape helpers (finding I12).
  return buildMessage({ id, model: SYNTHETIC_MODEL, ...fields });
}

/** The exchange of a call that is not streamed: a JSON message with status 200. */
export function messageFixture(
  name: string,
  requestBody: Anthropic.MessageCreateParamsNonStreaming,
  message: Anthropic.Message,
): LlmHttpFixture {
  return {
    name,
    model: SYNTHETIC_MODEL,
    request: { body: requestBody },
    response: { status: 200, headers: JSON_HEADERS, body: JSON.stringify(message) },
  };
}

/** The exchange of a streamed call: server-sent events with status 200. */
export function streamFixture(
  name: string,
  requestBody: Anthropic.MessageCreateParamsStreaming,
  events: readonly SyntheticStreamEvent[],
): LlmHttpFixture {
  return {
    name,
    model: SYNTHETIC_MODEL,
    request: { body: requestBody },
    response: {
      status: 200,
      headers: STREAM_HEADERS,
      // One SSE framing for fixtures and mapping tests alike (finding I12). The spread gives the
      // SDK's event interfaces the index signature `sseEvent` takes.
      body: events.map((event) => sseEvent({ ...event })).join(""),
    },
  };
}

/** The exchange of a call the API rejects: an error body with its HTTP status. */
export function errorFixture(
  name: string,
  requestBody: Anthropic.MessageCreateParams,
  status: number,
  error: Anthropic.ErrorObject,
  headers: Readonly<Record<string, string>> = {},
): LlmHttpFixture {
  const body: Anthropic.ErrorResponse = {
    type: "error",
    error,
    request_id: "req_synthetic_0001",
  };
  return {
    name,
    model: SYNTHETIC_MODEL,
    request: { body: requestBody },
    response: { status, headers: { ...JSON_HEADERS, ...headers }, body: JSON.stringify(body) },
  };
}

/** The first events of a stream: the empty message, then a ping. */
export function messageStartEvents(id: string, inputTokens: number): SyntheticStreamEvent[] {
  return [
    {
      type: "message_start",
      message: buildSyntheticMessage(id, {
        content: [],
        stop_reason: null,
        usage: buildUsage({ input_tokens: inputTokens, output_tokens: 1 }),
      }),
    },
    { type: "ping" },
  ];
}

/** A text block that arrives in the given deltas. */
export function textBlockEvents(
  index: number,
  deltas: readonly string[],
): Anthropic.RawMessageStreamEvent[] {
  return [
    {
      type: "content_block_start",
      index,
      content_block: { type: "text", text: "", citations: null },
    },
    ...deltas.map((text): Anthropic.RawContentBlockDeltaEvent => ({
      type: "content_block_delta",
      index,
      delta: { type: "text_delta", text },
    })),
    { type: "content_block_stop", index },
  ];
}

/**
 * A thinking block as current models stream it by default: no thinking text, and the
 * signature in one delta just before the block ends.
 */
export function thinkingBlockEvents(
  index: number,
  signature: string,
): Anthropic.RawMessageStreamEvent[] {
  return [
    {
      type: "content_block_start",
      index,
      content_block: { type: "thinking", thinking: "", signature: "" },
    },
    { type: "content_block_delta", index, delta: { type: "signature_delta", signature } },
    { type: "content_block_stop", index },
  ];
}

/** A tool call whose input arrives as pieces of JSON text. */
export function toolUseBlockEvents(
  index: number,
  id: string,
  name: string,
  inputJsonPieces: readonly string[],
): Anthropic.RawMessageStreamEvent[] {
  return [
    {
      type: "content_block_start",
      index,
      content_block: { type: "tool_use", id, name, input: {}, caller: { type: "direct" } },
    },
    ...inputJsonPieces.map((partialJson): Anthropic.RawContentBlockDeltaEvent => ({
      type: "content_block_delta",
      index,
      delta: { type: "input_json_delta", partial_json: partialJson },
    })),
    { type: "content_block_stop", index },
  ];
}

/** The last events of a stream: the stop reason with the cumulative token counts. */
export function messageEndEvents(
  stopReason: Anthropic.StopReason,
  usage: SyntheticStreamUsage,
  stopDetails: Anthropic.RefusalStopDetails | null = null,
): Anthropic.RawMessageStreamEvent[] {
  return [
    {
      type: "message_delta",
      delta: {
        container: null,
        stop_details: stopDetails,
        stop_reason: stopReason,
        stop_sequence: null,
      },
      usage: {
        cache_creation_input_tokens: usage.cacheWriteTokens ?? 0,
        cache_read_input_tokens: usage.cacheReadTokens ?? 0,
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        output_tokens_details: null,
        server_tool_use: null,
      },
    },
    { type: "message_stop" },
  ];
}
