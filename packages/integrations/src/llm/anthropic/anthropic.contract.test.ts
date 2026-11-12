import { createContractRequests } from "../../testing/contract/contract-requests";
import type { LlmContractCase } from "../../testing/contract/llm-contract.types";
import { describeLlmProviderContract } from "../../testing/contract/llm-provider-contract";
import { createAnthropicProvider } from "./anthropic.adapter";
import {
  API_ERROR_GENERATE,
  INVALID_REQUEST_GENERATE,
  NOT_AUTHORIZED_GENERATE,
  OVERLOADED_GENERATE,
  OVERLOADED_STREAM,
  PROMPT_TOO_LONG_GENERATE,
  RATE_LIMITED_GENERATE,
  RATE_LIMITED_STREAM,
  REFUSAL_GENERATE,
  REFUSAL_STREAM,
  STREAM_ERROR_AFTER_TEXT,
  STREAM_ERROR_BEFORE_CONTENT,
} from "./fixtures/synthetic/failure-fixtures";
import {
  CACHE_READ,
  CACHE_WRITE,
  MAX_OUTPUT_STREAM,
  PARALLEL_TOOLS_STREAM,
  TEXT_GENERATE,
  TEXT_STREAM,
  TOOL_CALL_STREAM,
  TOOL_RESULT_STREAM,
} from "./fixtures/synthetic/success-fixtures";
import { SYNTHETIC_MODEL } from "./fixtures/synthetic/synthetic-fixture";
import { checkRequestBody, readReasoningWireValues } from "./testing/anthropic-wire";

/**
 * The Anthropic adapter against the shared contract suite. Every fixture is hand-built from
 * Anthropic's documentation (plan D-6, recording deferred). When the recordings exist, the
 * eight success fixtures below are replaced by them and the exact values expected here are
 * set to what was recorded; the suite itself does not change.
 */

/** A key-shaped placeholder; MSW answers every call, so it is never sent anywhere. */
const FAKE_API_KEY = "test-key-not-real";

const RETRY_AFTER_MS = 12_000;

const requests = createContractRequests(SYNTHETIC_MODEL);

const NO_CACHE = { cacheWriteTokens: 0, cacheReadTokens: 0 };

const cases: readonly LlmContractCase[] = [
  {
    fixture: TEXT_GENERATE,
    mode: "generate",
    request: requests.text,
    expected: {
      outcome: "completed",
      stopReason: "end_turn",
      text: "pong",
      usage: { inputTokens: 27, outputTokens: 5, ...NO_CACHE },
    },
  },
  {
    fixture: TEXT_STREAM,
    mode: "stream",
    request: requests.countToFive,
    expected: {
      outcome: "completed",
      stopReason: "end_turn",
      text: "one, two, three, four, five",
      usage: { inputTokens: 31, outputTokens: 14, ...NO_CACHE },
    },
  },
  {
    fixture: PARALLEL_TOOLS_STREAM,
    mode: "stream",
    request: requests.parallelTools,
    expected: {
      outcome: "completed",
      stopReason: "tool_calls",
      text: "I will check both zones.",
      toolCalls: [
        { toolName: "get_current_time", input: { timeZone: "UTC" } },
        { toolName: "get_current_time", input: { timeZone: "Asia/Dhaka" } },
      ],
      usage: { inputTokens: 421, outputTokens: 97, ...NO_CACHE },
    },
  },
  {
    fixture: CACHE_WRITE,
    mode: "generate",
    request: requests.cached,
    expected: {
      outcome: "completed",
      stopReason: "end_turn",
      text: "cached",
      cache: "write",
      usage: { inputTokens: 14, outputTokens: 5, cacheWriteTokens: 6412, cacheReadTokens: 0 },
    },
  },
  {
    fixture: CACHE_READ,
    mode: "generate",
    request: requests.cached,
    expected: {
      outcome: "completed",
      stopReason: "end_turn",
      text: "cached",
      cache: "read",
      usage: { inputTokens: 14, outputTokens: 5, cacheWriteTokens: 0, cacheReadTokens: 6412 },
    },
  },
  {
    fixture: MAX_OUTPUT_STREAM,
    mode: "stream",
    request: requests.truncated,
    expected: {
      outcome: "failed",
      problem: "LLM_OUTPUT_TRUNCATED",
      emittedText: "Rivers begin as small streams in high ground and",
      usage: { inputTokens: 29, outputTokens: 64, ...NO_CACHE },
    },
  },
  {
    fixture: RATE_LIMITED_GENERATE,
    mode: "generate",
    request: requests.text,
    expected: { outcome: "failed", problem: "LLM_RATE_LIMITED", retryAfterMs: RETRY_AFTER_MS },
  },
  {
    fixture: RATE_LIMITED_STREAM,
    mode: "stream",
    request: requests.countToFive,
    expected: { outcome: "failed", problem: "LLM_RATE_LIMITED", retryAfterMs: RETRY_AFTER_MS },
  },
  {
    fixture: OVERLOADED_GENERATE,
    mode: "generate",
    request: requests.text,
    expected: { outcome: "failed", problem: "LLM_UNAVAILABLE" },
  },
  {
    fixture: OVERLOADED_STREAM,
    mode: "stream",
    request: requests.countToFive,
    expected: { outcome: "failed", problem: "LLM_UNAVAILABLE" },
  },
  {
    fixture: API_ERROR_GENERATE,
    mode: "generate",
    request: requests.text,
    expected: { outcome: "failed", problem: "LLM_UNAVAILABLE" },
  },
  {
    fixture: INVALID_REQUEST_GENERATE,
    mode: "generate",
    request: requests.text,
    expected: { outcome: "failed", problem: "LLM_REQUEST_REJECTED" },
  },
  {
    fixture: NOT_AUTHORIZED_GENERATE,
    mode: "generate",
    request: requests.text,
    expected: { outcome: "failed", problem: "LLM_NOT_AUTHORIZED" },
  },
  {
    fixture: PROMPT_TOO_LONG_GENERATE,
    mode: "generate",
    request: requests.text,
    expected: { outcome: "failed", problem: "LLM_CONTEXT_EXCEEDED" },
  },
  {
    fixture: REFUSAL_GENERATE,
    mode: "generate",
    request: requests.text,
    expected: {
      outcome: "failed",
      problem: "LLM_REFUSED",
      usage: { inputTokens: 27, outputTokens: 3, ...NO_CACHE },
    },
  },
  {
    fixture: REFUSAL_STREAM,
    mode: "stream",
    request: requests.countToFive,
    expected: {
      outcome: "failed",
      problem: "LLM_REFUSED",
      usage: { inputTokens: 31, outputTokens: 3, ...NO_CACHE },
    },
  },
  {
    fixture: STREAM_ERROR_BEFORE_CONTENT,
    mode: "stream",
    request: requests.countToFive,
    expected: { outcome: "failed", problem: "LLM_UNAVAILABLE", emittedText: "" },
  },
  {
    fixture: STREAM_ERROR_AFTER_TEXT,
    mode: "stream",
    request: requests.countToFive,
    expected: { outcome: "failed", problem: "LLM_UNAVAILABLE", emittedText: "one, two" },
  },
];

describeLlmProviderContract({
  providerName: "anthropic",
  endpointUrl: "https://api.anthropic.com/v1/messages",
  createProvider: () => createAnthropicProvider({ apiKey: FAKE_API_KEY }),
  cases,
  toolTurn: {
    call: {
      fixture: TOOL_CALL_STREAM,
      mode: "stream",
      request: requests.toolCall,
      expected: {
        outcome: "completed",
        stopReason: "tool_calls",
        text: "",
        toolCalls: [{ toolName: "get_current_time", input: { timeZone: "UTC" } }],
        usage: { inputTokens: 412, outputTokens: 58, ...NO_CACHE },
      },
    },
    buildResultRequest: (toolCallResponse) => requests.toolResult(toolCallResponse),
    result: {
      fixture: TOOL_RESULT_STREAM,
      mode: "stream",
      expected: {
        outcome: "completed",
        stopReason: "end_turn",
        text: "It is 00:00:00 UTC on 2026-01-01.",
        usage: { inputTokens: 498, outputTokens: 21, ...NO_CACHE },
      },
    },
  },
  readReasoningWireValues,
  checkRequestBody,
});
