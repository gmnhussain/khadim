import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { LlmError } from "@khadim/core/llm/llm.errors";
import type {
  LlmMessage,
  LlmRequest,
  LlmResponse,
  LlmToolDefinition,
} from "@khadim/core/llm/llm.types";
import { describe, expect, it } from "vitest";

import { createAnthropicProvider } from "../../llm/anthropic/anthropic.adapter";

/**
 * Records the Anthropic fixtures of the adapter contract suite (phase-1 plan, D-6). The owner runs it by
 * hand with a low-limit test key: `pnpm --filter @khadim/integrations record:anthropic`.
 * It calls the real API through the real adapter, so each fixture holds exactly the request the
 * adapter sends and the raw response it must map. Every prompt is synthetic.
 *
 * It keeps the request body, and the response status, three headers and body. It never keeps a
 * request header, so the key is never written; it also refuses to write a fixture that contains it.
 */

const KEY_FILE = fileURLToPath(new URL("../../../.env.recording", import.meta.url));
const FIXTURE_DIRECTORY = fileURLToPath(new URL("../../llm/anthropic/fixtures/", import.meta.url));
const KEY_LINE_PATTERN = /^\s*ANTHROPIC_API_KEY\s*=\s*["']?([^"'\s]+)["']?\s*$/m;

/** The cheapest current model, at the lowest effort (plan D-1). */
const MODEL = "claude-haiku-5-5";
const MAX_OUTPUT_TOKENS = 1024;
/** Small enough to cut the answer off. */
const TRUNCATING_MAX_OUTPUT_TOKENS = 64;
const TIMEOUT_MS = 120_000;

/** Response headers the adapter reads or a replay needs; nothing that names the account. */
const RECORDED_RESPONSE_HEADERS = ["content-type", "retry-after", "retry-after-ms"] as const;

const SYSTEM_PROMPT = "You are a test assistant. Follow the instruction exactly and briefly.";

/** Long enough to be cached: one synthetic sentence, numbered, many times. */
const CACHEABLE_SYSTEM_PROMPT = [
  SYSTEM_PROMPT,
  ...Array.from(
    { length: 400 },
    (_unused, index) => `Reference line ${index + 1}: this sentence only fills the prompt.`,
  ),
].join("\n");

const TIME_TOOL: LlmToolDefinition = {
  name: "get_current_time",
  description:
    "Returns the current date and time. Use it whenever an answer depends on today's date or the time now.",
  inputJsonSchema: {
    type: "object",
    properties: {
      timeZone: { type: "string", description: "IANA time zone name, for example Europe/Berlin." },
    },
    additionalProperties: false,
  },
};

const FIXED_TOOL_OUTPUT = JSON.stringify({
  utc: "2026-01-01T00:00:00.000Z",
  timeZone: "UTC",
  localDate: "2026-01-01",
  localTime: "00:00:00",
});

interface RecordedExchange {
  readonly requestBody: unknown;
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: string;
}

function readApiKey(): string {
  if (!existsSync(KEY_FILE)) {
    throw new Error(`no key file: create ${KEY_FILE} with one line, ANTHROPIC_API_KEY=<test key>`);
  }
  const match = KEY_LINE_PATTERN.exec(readFileSync(KEY_FILE, "utf8"));
  const apiKey = match?.[1];
  if (apiKey === undefined) {
    throw new Error(`${KEY_FILE} has no ANTHROPIC_API_KEY=<test key> line`);
  }
  return apiKey;
}

/** A `fetch` that passes every call through and keeps the last exchange, without its headers. */
function createRecordingFetch() {
  let lastExchange: RecordedExchange | undefined;
  const recordingFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const requestText = await request.clone().text();
    const response = await fetch(request);
    const body = await response.clone().text();
    const headers: Record<string, string> = {};
    for (const name of RECORDED_RESPONSE_HEADERS) {
      const value = response.headers.get(name);
      if (value !== null) {
        headers[name] = value;
      }
    }
    lastExchange = {
      requestBody: JSON.parse(requestText) as unknown,
      status: response.status,
      headers,
      body,
    };
    return response;
  };
  return {
    fetch: recordingFetch,
    takeExchange(): RecordedExchange {
      if (lastExchange === undefined) {
        throw new Error("no HTTP exchange was recorded");
      }
      const exchange = lastExchange;
      lastExchange = undefined;
      return exchange;
    },
  };
}

const apiKey = readApiKey();
const recorder = createRecordingFetch();
const provider = createAnthropicProvider({ apiKey, fetch: recorder.fetch });

function writeFixture(name: string): void {
  const exchange = recorder.takeExchange();
  const text = `${JSON.stringify(
    {
      name,
      model: MODEL,
      request: { body: exchange.requestBody },
      response: { status: exchange.status, headers: exchange.headers, body: exchange.body },
    },
    null,
    2,
  )}\n`;
  if (text.includes(apiKey)) {
    throw new Error(`fixture ${name} contains the API key; nothing was written`);
  }
  mkdirSync(FIXTURE_DIRECTORY, { recursive: true });
  writeFileSync(`${FIXTURE_DIRECTORY}${name}.json`, text, "utf8");
}

function request(overrides: Partial<LlmRequest>): LlmRequest {
  return {
    model: MODEL,
    system: [{ text: SYSTEM_PROMPT, isStable: true }],
    tools: [],
    messages: [],
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    timeoutMs: TIMEOUT_MS,
    effort: "low",
    ...overrides,
  };
}

function userMessage(text: string): LlmMessage {
  return { role: "user", content: [{ type: "text", text }] };
}

async function streamToResponse(llmRequest: LlmRequest): Promise<LlmResponse> {
  let completed: LlmResponse | undefined;
  for await (const event of provider.stream(llmRequest)) {
    if (event.type === "completed") {
      completed = event.response;
    }
  }
  if (completed === undefined) {
    throw new Error("the stream ended without a completed response");
  }
  return completed;
}

describe("record Anthropic fixtures (owner only, phase-1 plan, D-6)", () => {
  let toolCallTurn: { readonly messages: readonly LlmMessage[]; readonly response: LlmResponse };

  it("text-generate", async () => {
    const response = await provider.generate(
      request({ messages: [userMessage("Reply with exactly the word: pong")] }),
    );
    writeFixture("text-generate");

    expect(response.stopReason).toBe("end_turn");
  });

  it("text-stream", async () => {
    const response = await streamToResponse(
      request({
        messages: [userMessage("Count from one to five in words, separated by commas.")],
      }),
    );
    writeFixture("text-stream");

    expect(response.stopReason).toBe("end_turn");
  });

  it("tool-call-stream", async () => {
    const messages = [userMessage("What time is it right now in UTC? Use the tool.")];
    const response = await streamToResponse(request({ tools: [TIME_TOOL], messages }));
    writeFixture("tool-call-stream");
    toolCallTurn = { messages, response };

    expect(response.stopReason).toBe("tool_calls");
  });

  it("tool-result-stream", async () => {
    const { messages, response: toolCallResponse } = toolCallTurn;
    const toolResults = toolCallResponse.content.flatMap((part) =>
      part.type === "tool_call"
        ? [
            {
              type: "tool_result" as const,
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              isError: false,
              output: FIXED_TOOL_OUTPUT,
            },
          ]
        : [],
    );
    const response = await streamToResponse(
      request({
        tools: [TIME_TOOL],
        messages: [
          ...messages,
          { role: "assistant", content: toolCallResponse.content },
          { role: "tool", content: toolResults },
        ],
      }),
    );
    writeFixture("tool-result-stream");

    expect(response.stopReason).toBe("end_turn");
  });

  it("parallel-tools-stream", async () => {
    const response = await streamToResponse(
      request({
        tools: [TIME_TOOL],
        messages: [
          userMessage(
            "Give me the current time in UTC and in Asia/Dhaka. Call the tool once for each zone.",
          ),
        ],
      }),
    );
    writeFixture("parallel-tools-stream");

    expect(response.content.filter((part) => part.type === "tool_call")).toHaveLength(2);
  });

  it("cache-write, then cache-read", async () => {
    const cachedRequest = request({
      system: [{ text: CACHEABLE_SYSTEM_PROMPT, isStable: true }],
      messages: [userMessage("Reply with exactly the word: cached")],
    });

    const first = await provider.generate(cachedRequest);
    writeFixture("cache-write");
    const second = await provider.generate(cachedRequest);
    writeFixture("cache-read");

    expect(first.usage.cacheWriteTokens).toBeGreaterThan(0);
    expect(second.usage.cacheReadTokens).toBeGreaterThan(0);
  });

  it("max-output-stream", async () => {
    const failure = await streamToResponse(
      request({
        maxOutputTokens: TRUNCATING_MAX_OUTPUT_TOKENS,
        messages: [userMessage("Write three paragraphs about rivers.")],
      }),
    ).catch((error: unknown) => error);
    writeFixture("max-output-stream");

    expect(failure).toBeInstanceOf(LlmError);
    expect(failure).toMatchObject({ problem: "LLM_OUTPUT_TRUNCATED" });
  });
});
