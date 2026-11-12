import type Anthropic from "@anthropic-ai/sdk";

import { buildUsage } from "../../testing/anthropic-shapes";
import { COUNT_TO_FIVE_BODY, streamed, TEXT_BODY } from "./request-bodies";
import {
  buildSyntheticMessage,
  errorFixture,
  messageEndEvents,
  messageFixture,
  messageStartEvents,
  streamFixture,
} from "./synthetic-fixture";

/**
 * Hand-built exchanges that cannot be recorded on demand, or should not be provoked: errors
 * by HTTP status, an error in mid-stream and a refusal (owner, 2026-11-12). The error types
 * and statuses are the documented ones; the messages are synthetic, except the documented
 * wording of an oversized prompt (pitfall KP-20).
 */

const STATUS_BAD_REQUEST = 400;
const STATUS_UNAUTHORIZED = 401;
const STATUS_RATE_LIMITED = 429;
const STATUS_SERVER_ERROR = 500;
const STATUS_OVERLOADED = 529;

/** The delay the rate-limit fixtures ask for, in the seconds form of `retry-after`. */
const RETRY_AFTER_HEADERS = { "retry-after": "12" };

const RATE_LIMIT_ERROR: Anthropic.ErrorObject = {
  type: "rate_limit_error",
  message: "Synthetic: the rate limit was reached.",
};

const OVERLOADED_ERROR: Anthropic.ErrorObject = { type: "overloaded_error", message: "Overloaded" };

const REFUSAL_DETAILS: Anthropic.RefusalStopDetails = {
  type: "refusal",
  category: null,
  explanation: null,
};

/** A rate limit with a retry delay. */
export const RATE_LIMITED_GENERATE = errorFixture(
  "rate-limited-generate",
  TEXT_BODY,
  STATUS_RATE_LIMITED,
  RATE_LIMIT_ERROR,
  RETRY_AFTER_HEADERS,
);

/** A rate limit that answers a streamed call before any event. */
export const RATE_LIMITED_STREAM = errorFixture(
  "rate-limited-stream",
  streamed(COUNT_TO_FIVE_BODY),
  STATUS_RATE_LIMITED,
  RATE_LIMIT_ERROR,
  RETRY_AFTER_HEADERS,
);

/** The API is overloaded. */
export const OVERLOADED_GENERATE = errorFixture(
  "overloaded-generate",
  TEXT_BODY,
  STATUS_OVERLOADED,
  OVERLOADED_ERROR,
);

/** The API is overloaded, for a streamed call. */
export const OVERLOADED_STREAM = errorFixture(
  "overloaded-stream",
  streamed(COUNT_TO_FIVE_BODY),
  STATUS_OVERLOADED,
  OVERLOADED_ERROR,
);

/** An internal error of the API. */
export const API_ERROR_GENERATE = errorFixture(
  "api-error-generate",
  TEXT_BODY,
  STATUS_SERVER_ERROR,
  { type: "api_error", message: "Synthetic: internal server error." },
);

/** A request the API rejects as invalid. */
export const INVALID_REQUEST_GENERATE = errorFixture(
  "invalid-request-generate",
  TEXT_BODY,
  STATUS_BAD_REQUEST,
  { type: "invalid_request_error", message: "Synthetic: the request is not valid." },
);

/** A key the API does not accept. */
export const NOT_AUTHORIZED_GENERATE = errorFixture(
  "not-authorized-generate",
  TEXT_BODY,
  STATUS_UNAUTHORIZED,
  { type: "authentication_error", message: "Synthetic: the key was not accepted." },
);

/** A prompt over the context limit: an invalid request told apart only by its message. */
export const PROMPT_TOO_LONG_GENERATE = errorFixture(
  "prompt-too-long-generate",
  TEXT_BODY,
  STATUS_BAD_REQUEST,
  {
    type: "invalid_request_error",
    message: "prompt is too long: 1000001 tokens > 1000000 maximum",
  },
);

/** A refusal: status 200, no content, and the tokens the call used. */
export const REFUSAL_GENERATE = messageFixture(
  "refusal-generate",
  TEXT_BODY,
  buildSyntheticMessage("msg_synthetic_refusal_generate", {
    content: [],
    stop_reason: "refusal",
    stop_details: REFUSAL_DETAILS,
    usage: buildUsage({ input_tokens: 27, output_tokens: 3 }),
  }),
);

/** A refusal of a streamed call, before any content. */
export const REFUSAL_STREAM = streamFixture("refusal-stream", streamed(COUNT_TO_FIVE_BODY), [
  ...messageStartEvents("msg_synthetic_refusal_stream", 31),
  ...messageEndEvents("refusal", { inputTokens: 31, outputTokens: 3 }, REFUSAL_DETAILS),
]);

/** A stream that fails after its start, before any content. */
export const STREAM_ERROR_BEFORE_CONTENT = streamFixture(
  "stream-error-before-content",
  streamed(COUNT_TO_FIVE_BODY),
  [
    ...messageStartEvents("msg_synthetic_stream_error_early", 31),
    { type: "error", error: OVERLOADED_ERROR },
  ],
);

/**
 * A stream whose body ends after some text, with no error event and no `message_stop`: what a
 * dropped connection looks like once the bytes stop. The SDK raises a plain `AnthropicError`,
 * not an `APIError` (I1).
 */
export const STREAM_CUT_OFF_AFTER_TEXT = streamFixture(
  "stream-cut-off-after-text",
  streamed(COUNT_TO_FIVE_BODY),
  [
    ...messageStartEvents("msg_synthetic_stream_cut_off", 31),
    {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "", citations: null },
    },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "one, two" } },
  ],
);

/** A stream that fails after some text arrived. */
export const STREAM_ERROR_AFTER_TEXT = streamFixture(
  "stream-error-after-text",
  streamed(COUNT_TO_FIVE_BODY),
  [
    ...messageStartEvents("msg_synthetic_stream_error_late", 31),
    {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "", citations: null },
    },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "one, two" } },
    { type: "error", error: OVERLOADED_ERROR },
  ],
);
