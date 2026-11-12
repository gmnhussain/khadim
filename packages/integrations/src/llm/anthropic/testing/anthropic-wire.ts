import { expect } from "vitest";

import type { LlmHttpFixture } from "../../../testing/contract/llm-contract.types";

/** What the contract suite needs to know about Anthropic's wire format. */

/**
 * Fields the adapter never sends (plan P-5). The current API version or models reject the
 * sampling parameters and a forced tool choice. A `thinking` setting is not rejected: it is
 * left out because the catalog controls reasoning depth through effort.
 */
const UNSENT_REQUEST_FIELDS = ["temperature", "top_p", "top_k", "tool_choice", "thinking"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** The JSON objects of a response: one message, or the data of each server-sent event. */
function readResponseObjects(fixture: LlmHttpFixture): unknown[] {
  const { headers, body } = fixture.response;
  if (!(headers["content-type"] ?? "").startsWith("text/event-stream")) {
    return [JSON.parse(body) as unknown];
  }
  return body
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => JSON.parse(line.slice("data:".length)) as unknown);
}

function readStrings(values: readonly unknown[]): string[] {
  return values.filter((value): value is string => typeof value === "string" && value !== "");
}

/** The signature of a thinking block, or the data of a redacted one. */
function readBlockValues(block: unknown): string[] {
  if (!isRecord(block)) {
    return [];
  }
  if (block.type === "thinking") {
    return readStrings([block.signature]);
  }
  return block.type === "redacted_thinking" ? readStrings([block.data]) : [];
}

/**
 * The opaque reasoning values in a fixture's response: signatures and redacted data, from a
 * finished message or from the events of a stream.
 */
export function readReasoningWireValues(fixture: LlmHttpFixture): string[] {
  return readResponseObjects(fixture).flatMap((value) => {
    if (!isRecord(value)) {
      return [];
    }
    if (Array.isArray(value.content)) {
      return value.content.flatMap(readBlockValues);
    }
    if (value.type === "content_block_start") {
      return readBlockValues(value.content_block);
    }
    return isRecord(value.delta) && value.delta.type === "signature_delta"
      ? readStrings([value.delta.signature])
      : [];
  });
}

/**
 * Fails when a request body holds what the adapter must never send: a sampling parameter, a
 * forced tool choice or an assistant message at the end (a prefill), which the API rejects,
 * or a thinking setting, which is the catalog's to control through effort.
 */
export function checkRequestBody(body: unknown): void {
  for (const field of UNSENT_REQUEST_FIELDS) {
    expect(body).not.toHaveProperty(field);
  }
  const messages = isRecord(body) && Array.isArray(body.messages) ? body.messages : [];
  expect(messages.at(-1)).toMatchObject({ role: "user" });
}
