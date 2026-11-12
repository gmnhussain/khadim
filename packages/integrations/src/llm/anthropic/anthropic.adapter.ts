import Anthropic from "@anthropic-ai/sdk";
import type { LlmProvider } from "@khadim/core/llm/llm.port";
import type {
  LlmCapabilities,
  LlmRequest,
  LlmResponse,
  LlmStreamEvent,
} from "@khadim/core/llm/llm.types";

import { mapError } from "./error-mapper";
import { ANTHROPIC_PROVIDER_ID, mapRequest } from "./request-mapper";
import { mapResponse, mapStreamEvent } from "./response-mapper";

/** Options of `createAnthropicProvider`. */
export interface AnthropicProviderOptions {
  /** The API key, read from validated env by the composition root; never logged. */
  readonly apiKey: string;
  /** Another base URL, for tests that replay recorded fixtures. */
  readonly baseUrl?: string | undefined;
  /** Another `fetch`, for tests and for recording fixtures. */
  readonly fetch?: typeof fetch | undefined;
}

/** What this adapter maps today; each model's own capabilities are in the catalog. */
const CAPABILITIES: LlmCapabilities = {
  supportsTools: true,
  supportsStreaming: true,
  supportsImages: false,
  supportsStructuredOutput: false,
  supportsPromptCaching: true,
  maxContextTokens: 1_000_000,
};

/** Core decides every retry (plan D-9); the SDK's own retries would double them. */
const SDK_MAX_RETRIES = 0;

/**
 * Creates the Anthropic adapter of the `LlmProvider` port (ADR-0009). It maps requests,
 * responses, stream events and errors, and holds no rules of its own.
 */
export function createAnthropicProvider(options: AnthropicProviderOptions): LlmProvider {
  const client = new Anthropic({
    apiKey: options.apiKey,
    maxRetries: SDK_MAX_RETRIES,
    // The SDK must never log a request or a response (conventions §14).
    logLevel: "off",
    ...(options.baseUrl === undefined ? {} : { baseURL: options.baseUrl }),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });

  /** The SDK's timeout covers connecting; the signal ends a stream that runs past the limit. */
  function requestOptions(request: LlmRequest) {
    const timeoutSignal = AbortSignal.timeout(request.timeoutMs);
    return {
      timeout: request.timeoutMs,
      signal:
        request.signal === undefined
          ? timeoutSignal
          : AbortSignal.any([timeoutSignal, request.signal]),
    };
  }

  function rethrowMapped(error: unknown): never {
    throw mapError(error) ?? error;
  }

  async function generate(request: LlmRequest): Promise<LlmResponse> {
    try {
      const message = await client.messages.create(mapRequest(request), requestOptions(request));
      return mapResponse(message);
    } catch (error) {
      return rethrowMapped(error);
    }
  }

  async function* stream(request: LlmRequest): AsyncGenerator<LlmStreamEvent, void, undefined> {
    try {
      const messageStream = client.messages.stream(mapRequest(request), requestOptions(request));
      try {
        for await (const event of messageStream) {
          const mapped = mapStreamEvent(event);
          if (mapped !== undefined) {
            yield mapped;
          }
        }
        yield { type: "completed", response: mapResponse(await messageStream.finalMessage()) };
      } finally {
        // Ends the HTTP call when the consumer stops early; a no-op once the stream is done.
        messageStream.abort();
      }
    } catch (error) {
      rethrowMapped(error);
    }
  }

  return { providerId: ANTHROPIC_PROVIDER_ID, capabilities: CAPABILITIES, generate, stream };
}
