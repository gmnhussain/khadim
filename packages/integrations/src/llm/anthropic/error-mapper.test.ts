import Anthropic from "@anthropic-ai/sdk";
import { LlmError } from "@khadim/core/llm/llm.errors";
import { describe, expect, it } from "vitest";

import { mapError, readRetryAfterMs } from "./error-mapper";
import { errorBody } from "./testing/anthropic-shapes";

/** Builds the error the SDK raises for a response, the same way the SDK does. */
function apiError(status: number, type: string, headers: Record<string, string> = {}) {
  return Anthropic.APIError.generate(
    status,
    errorBody(type, `Synthetic ${type}.`),
    undefined,
    new Headers(headers),
  );
}

describe("readRetryAfterMs", () => {
  it("reads retry-after in seconds", () => {
    expect(readRetryAfterMs(new Headers({ "retry-after": "20" }))).toBe(20_000);
  });

  it("reads a fraction of a second, rounded up to a whole millisecond", () => {
    expect(readRetryAfterMs(new Headers({ "retry-after": "0.2505" }))).toBe(251);
  });

  it("prefers retry-after-ms, which is already in milliseconds", () => {
    expect(readRetryAfterMs(new Headers({ "retry-after-ms": "1500", "retry-after": "20" }))).toBe(
      1500,
    );
  });

  it.each([
    ["no headers", undefined],
    ["no retry header", new Headers()],
    ["zero", new Headers({ "retry-after": "0" })],
    ["a negative number", new Headers({ "retry-after": "-5" })],
    ["text", new Headers({ "retry-after": "soon" })],
  ])("returns nothing for %s", (_, headers) => {
    expect(readRetryAfterMs(headers)).toBeUndefined();
  });
});

describe("mapError", () => {
  it("maps a 429 to LLM_RATE_LIMITED with the provider's retry delay (plan D-9 rule 1)", () => {
    const mapped = mapError(apiError(429, "rate_limit_error", { "retry-after": "20" }));

    expect(mapped).toBeInstanceOf(LlmError);
    expect(mapped?.problem).toBe("LLM_RATE_LIMITED");
    expect(mapped?.retryAfterMs).toBe(20_000);
  });

  it("maps a 429 without a retry header to LLM_RATE_LIMITED with no delay", () => {
    const mapped = mapError(apiError(429, "rate_limit_error"));

    expect(mapped?.problem).toBe("LLM_RATE_LIMITED");
    expect(mapped?.retryAfterMs).toBeUndefined();
  });

  it.each([
    [529, "overloaded_error"],
    [500, "api_error"],
    [504, "timeout_error"],
    [503, "api_error"],
  ])("maps a %i %s to LLM_UNAVAILABLE", (status, type) => {
    expect(mapError(apiError(status, type))?.problem).toBe("LLM_UNAVAILABLE");
  });

  it.each([
    [401, "authentication_error"],
    [402, "billing_error"],
    [403, "permission_error"],
  ])("maps a %i %s to LLM_NOT_AUTHORIZED: the owner fixes it", (status, type) => {
    expect(mapError(apiError(status, type))?.problem).toBe("LLM_NOT_AUTHORIZED");
  });

  it.each([
    [400, "invalid_request_error"],
    [404, "not_found_error"],
    [409, "conflict_error"],
    [422, "invalid_request_error"],
  ])("maps a %i %s to LLM_REQUEST_REJECTED: a bug in Khadim", (status, type) => {
    expect(mapError(apiError(status, type))?.problem).toBe("LLM_REQUEST_REJECTED");
  });

  it("maps an oversized prompt to LLM_CONTEXT_EXCEEDED", () => {
    const error = Anthropic.APIError.generate(
      400,
      errorBody("invalid_request_error", "prompt is too long: 1000001 tokens > 1000000 maximum"),
      undefined,
      new Headers(),
    );

    expect(mapError(error)?.problem).toBe("LLM_CONTEXT_EXCEEDED");
  });

  it("maps a 413 request_too_large to LLM_CONTEXT_EXCEEDED (fix 4.5, KP-20)", () => {
    expect(mapError(apiError(413, "request_too_large"))?.problem).toBe("LLM_CONTEXT_EXCEEDED");
  });

  it("maps a 413 by its status alone, as Cloudflare sends it before the API (fix 4.5)", () => {
    const error = Anthropic.APIError.generate(
      413,
      undefined,
      "Request Entity Too Large",
      new Headers(),
    );

    expect(mapError(error)?.problem).toBe("LLM_CONTEXT_EXCEEDED");
  });

  it("reads retry-after from a headers object that is not the global Headers (I10)", () => {
    const headers = { get: (name: string) => (name === "retry-after" ? "7" : null) };
    const error = Anthropic.APIError.generate(
      429,
      errorBody("rate_limit_error", "Synthetic rate_limit_error."),
      undefined,
      headers as unknown as Headers,
    );

    expect(mapError(error)?.retryAfterMs).toBe(7_000);
  });

  it.each([
    ["a stream cut off mid-body", new Anthropic.AnthropicError("terminated")],
    [
      "a stream without a final message",
      new Anthropic.AnthropicError("stream ended without producing a Message"),
    ],
  ])("maps %s, a plain SDK error, to LLM_UNAVAILABLE (I1)", (_, error) => {
    const mapped = mapError(error);

    expect(mapped).toBeInstanceOf(LlmError);
    expect(mapped?.problem).toBe("LLM_UNAVAILABLE");
    expect(mapped?.cause).toBe(error);
  });

  it("maps an error in the middle of a stream by its type: it has no status", () => {
    const overloaded = Anthropic.APIError.generate(
      undefined,
      errorBody("overloaded_error", "Overloaded"),
      undefined,
      undefined,
    );

    expect(mapError(overloaded)?.problem).toBe("LLM_UNAVAILABLE");
  });

  it.each([
    ["a dropped connection", new Anthropic.APIConnectionError({ message: "socket hang up" })],
    ["a connection timeout", new Anthropic.APIConnectionTimeoutError()],
    ["an aborted call", new Anthropic.APIUserAbortError()],
  ])("maps %s to LLM_UNAVAILABLE", (_, error) => {
    expect(mapError(error)?.problem).toBe("LLM_UNAVAILABLE");
  });

  it("keeps the vendor error as the cause only: its type and message stay out (conventions §12.1)", () => {
    const vendorError = apiError(429, "rate_limit_error");

    const mapped = mapError(vendorError);

    expect(mapped?.cause).toBe(vendorError);
    expect(mapped?.message).toBe("The model provider is rate limiting requests.");
    expect(mapped?.message).not.toContain("Synthetic");
    expect(mapped).not.toBeInstanceOf(Anthropic.APIError);
  });

  it("returns an LlmError as it is", () => {
    const error = new LlmError("LLM_REFUSED");

    expect(mapError(error)).toBe(error);
  });

  it.each([new TypeError("bug"), "text", undefined])(
    "maps nothing for %s, which is not the SDK's error",
    (error) => {
      expect(mapError(error)).toBeUndefined();
    },
  );
});
