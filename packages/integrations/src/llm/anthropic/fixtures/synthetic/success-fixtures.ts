import { buildTextBlock, buildUsage } from "../../testing/anthropic-shapes";
import {
  CACHED_BODY,
  COUNT_TO_FIVE_BODY,
  PARALLEL_TOOLS_BODY,
  SYNTHETIC_SIGNATURE,
  SYNTHETIC_TOOL_CALL_ID,
  streamed,
  TEXT_BODY,
  TOOL_CALL_BODY,
  TOOL_RESULT_BODY,
  TRUNCATED_BODY,
} from "./request-bodies";
import {
  buildSyntheticMessage,
  messageEndEvents,
  messageFixture,
  messageStartEvents,
  streamFixture,
  textBlockEvents,
  thinkingBlockEvents,
  toolUseBlockEvents,
} from "./synthetic-fixture";

/**
 * Hand-built stand-ins for the eight exchanges the recording script records (phase-1 plan, D-6), under
 * the same names. They follow Anthropic's documentation for the pinned SDK and prove only our
 * reading of it, not the live API; the recordings replace them (pitfall KP-20).
 */

const CACHED_PREFIX_TOKENS = 6412;

/** A one-word answer, not streamed. */
export const TEXT_GENERATE = messageFixture(
  "text-generate",
  TEXT_BODY,
  buildSyntheticMessage("msg_synthetic_text_generate", {
    content: [buildTextBlock("pong")],
    stop_reason: "end_turn",
    usage: buildUsage({ input_tokens: 27, output_tokens: 5 }),
  }),
);

/** A short answer in three deltas. */
export const TEXT_STREAM = streamFixture("text-stream", streamed(COUNT_TO_FIVE_BODY), [
  ...messageStartEvents("msg_synthetic_text_stream", 31),
  ...textBlockEvents(0, ["one", ", two, three", ", four, five"]),
  ...messageEndEvents("end_turn", { inputTokens: 31, outputTokens: 14 }),
]);

/** The model reasons, then asks for the tool; the tool input arrives as pieces of JSON. */
export const TOOL_CALL_STREAM = streamFixture("tool-call-stream", streamed(TOOL_CALL_BODY), [
  ...messageStartEvents("msg_synthetic_tool_call", 412),
  ...thinkingBlockEvents(0, SYNTHETIC_SIGNATURE),
  ...toolUseBlockEvents(1, SYNTHETIC_TOOL_CALL_ID, "get_current_time", [
    "",
    '{"timeZone"',
    ': "UTC"}',
  ]),
  ...messageEndEvents("tool_use", { inputTokens: 412, outputTokens: 58 }),
]);

/** The answer after the tool result was sent back. */
export const TOOL_RESULT_STREAM = streamFixture("tool-result-stream", streamed(TOOL_RESULT_BODY), [
  ...messageStartEvents("msg_synthetic_tool_result", 498),
  ...textBlockEvents(0, ["It is 00:00:00 UTC", " on 2026-01-01."]),
  ...messageEndEvents("end_turn", { inputTokens: 498, outputTokens: 21 }),
]);

/** Some text, then two tool calls in one step. */
export const PARALLEL_TOOLS_STREAM = streamFixture(
  "parallel-tools-stream",
  streamed(PARALLEL_TOOLS_BODY),
  [
    ...messageStartEvents("msg_synthetic_parallel_tools", 421),
    ...textBlockEvents(0, ["I will check both zones."]),
    ...toolUseBlockEvents(1, "toolu_synthetic_0002", "get_current_time", ['{"timeZone": "UTC"}']),
    ...toolUseBlockEvents(2, "toolu_synthetic_0003", "get_current_time", [
      '{"timeZone": ',
      '"Asia/Dhaka"}',
    ]),
    ...messageEndEvents("tool_use", { inputTokens: 421, outputTokens: 97 }),
  ],
);

/** The first call with a long system prompt writes it to the cache. */
export const CACHE_WRITE = messageFixture(
  "cache-write",
  CACHED_BODY,
  buildSyntheticMessage("msg_synthetic_cache_write", {
    content: [buildTextBlock("cached")],
    stop_reason: "end_turn",
    usage: buildUsage({
      input_tokens: 14,
      output_tokens: 5,
      cache_creation_input_tokens: CACHED_PREFIX_TOKENS,
      cache_creation: {
        ephemeral_5m_input_tokens: CACHED_PREFIX_TOKENS,
        ephemeral_1h_input_tokens: 0,
      },
    }),
  }),
);

/** The same call again reads the prompt from the cache. */
export const CACHE_READ = messageFixture(
  "cache-read",
  CACHED_BODY,
  buildSyntheticMessage("msg_synthetic_cache_read", {
    content: [buildTextBlock("cached")],
    stop_reason: "end_turn",
    usage: buildUsage({
      input_tokens: 14,
      output_tokens: 5,
      cache_read_input_tokens: CACHED_PREFIX_TOKENS,
    }),
  }),
);

/** An answer cut off at its maximum output, after some text was streamed. */
export const MAX_OUTPUT_STREAM = streamFixture("max-output-stream", streamed(TRUNCATED_BODY), [
  ...messageStartEvents("msg_synthetic_max_output", 29),
  ...textBlockEvents(0, ["Rivers begin as small streams", " in high ground and"]),
  ...messageEndEvents("max_tokens", { inputTokens: 29, outputTokens: 64 }),
]);
