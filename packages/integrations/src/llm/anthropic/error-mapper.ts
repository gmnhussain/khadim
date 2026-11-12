import Anthropic from "@anthropic-ai/sdk";
import { LlmError, type LlmProblem } from "@khadim/core/llm/llm.errors";

type AnthropicErrorType = NonNullable<InstanceType<typeof Anthropic.APIError>["type"]>;

/** The problem of each documented error type. A mid-stream error has a type but no status. */
const PROBLEM_BY_ERROR_TYPE: Record<AnthropicErrorType, LlmProblem> = {
  rate_limit_error: "LLM_RATE_LIMITED",
  overloaded_error: "LLM_UNAVAILABLE",
  api_error: "LLM_UNAVAILABLE",
  timeout_error: "LLM_UNAVAILABLE",
  authentication_error: "LLM_NOT_AUTHORIZED",
  permission_error: "LLM_NOT_AUTHORIZED",
  billing_error: "LLM_NOT_AUTHORIZED",
  invalid_request_error: "LLM_REQUEST_REJECTED",
  not_found_error: "LLM_REQUEST_REJECTED",
};

const STATUS_RATE_LIMITED = 429;
const STATUS_REQUEST_TIMEOUT = 408;
const STATUS_SERVER_ERROR_MIN = 500;
const NOT_AUTHORIZED_STATUS_SET: ReadonlySet<number> = new Set([401, 402, 403]);

/**
 * An oversized prompt is a 400 `invalid_request_error` with no code of its own, so its
 * documented message is the only signal that tells it from any other invalid request.
 */
const PROMPT_TOO_LONG_PATTERN = /prompt is too long/i;

const MS_PER_SECOND = 1000;

/**
 * The API may return an error type newer than the SDK lists, such as `request_too_large`, so
 * the lookup is checked at runtime; an unknown type falls back to the HTTP status.
 */
function problemOfType(type: string | null): LlmProblem | undefined {
  return type !== null && Object.hasOwn(PROBLEM_BY_ERROR_TYPE, type)
    ? PROBLEM_BY_ERROR_TYPE[type as AnthropicErrorType]
    : undefined;
}

function problemOfStatus(status: number | undefined): LlmProblem {
  if (status === STATUS_RATE_LIMITED) {
    return "LLM_RATE_LIMITED";
  }
  if (
    status === undefined ||
    status === STATUS_REQUEST_TIMEOUT ||
    status >= STATUS_SERVER_ERROR_MIN
  ) {
    return "LLM_UNAVAILABLE";
  }
  return NOT_AUTHORIZED_STATUS_SET.has(status) ? "LLM_NOT_AUTHORIZED" : "LLM_REQUEST_REJECTED";
}

function parsePositiveNumber(value: string | null | undefined): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/** The provider's retry delay: `retry-after-ms` in milliseconds, or `retry-after` in seconds. */
export function readRetryAfterMs(headers: Headers | undefined): number | undefined {
  const milliseconds = parsePositiveNumber(headers?.get("retry-after-ms"));
  if (milliseconds !== undefined) {
    return Math.ceil(milliseconds);
  }
  const seconds = parsePositiveNumber(headers?.get("retry-after"));
  return seconds === undefined ? undefined : Math.ceil(seconds * MS_PER_SECOND);
}

/**
 * Maps an SDK error to a core problem, or returns nothing for an error that is not the SDK's
 * (a bug, which the adapter lets through). The vendor error travels only as `cause`, for logs:
 * its type and message never cross the port any other way (conventions §12.1).
 */
export function mapError(error: unknown): LlmError | undefined {
  if (error instanceof LlmError) {
    return error;
  }
  if (!(error instanceof Anthropic.APIError)) {
    return undefined;
  }
  // An aborted or dropped call, or one that timed out, never reached a verdict: an outage.
  if (
    error instanceof Anthropic.APIUserAbortError ||
    error instanceof Anthropic.APIConnectionError
  ) {
    return new LlmError("LLM_UNAVAILABLE", { cause: error });
  }
  // The SDK types `status` and `headers` loosely, so both are checked before use.
  const status: unknown = error.status;
  const headers: unknown = error.headers;
  const problem =
    problemOfType(error.type) ?? problemOfStatus(typeof status === "number" ? status : undefined);
  if (problem === "LLM_REQUEST_REJECTED" && PROMPT_TOO_LONG_PATTERN.test(error.message)) {
    return new LlmError("LLM_CONTEXT_EXCEEDED", { cause: error });
  }
  if (problem === "LLM_RATE_LIMITED") {
    return new LlmError(problem, {
      retryAfterMs: readRetryAfterMs(headers instanceof Headers ? headers : undefined),
      cause: error,
    });
  }
  return new LlmError(problem, { cause: error });
}
