import { LlmError } from "@khadim/core/llm/llm.errors";
import type { LlmProvider } from "@khadim/core/llm/llm.port";
import type { LlmRequest, LlmResponse, LlmStreamEvent, LlmUsage } from "@khadim/core/llm/llm.types";
import { http } from "msw/http";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type {
  ExpectedCompletion,
  ExpectedFailure,
  LlmContractCase,
  LlmContractMode,
  LlmContractOptions,
  LlmHttpFixture,
} from "./llm-contract.types";

/** A request the adapter sent: its exact text and the JSON in it. No header is kept. */
interface SentRequest {
  readonly text: string;
  readonly body: unknown;
}

/** What one call to the provider produced. */
interface CallResult {
  readonly events: readonly LlmStreamEvent[];
  readonly response: LlmResponse | undefined;
  readonly failure: unknown;
}

async function callProvider(
  provider: LlmProvider,
  mode: LlmContractMode,
  request: LlmRequest,
): Promise<CallResult> {
  const events: LlmStreamEvent[] = [];
  try {
    if (mode === "generate") {
      return { events, response: await provider.generate(request), failure: undefined };
    }
    let response: LlmResponse | undefined;
    for await (const event of provider.stream(request)) {
      events.push(event);
      if (event.type === "completed") {
        response = event.response;
      }
    }
    return { events, response, failure: undefined };
  } catch (error) {
    return { events, response: undefined, failure: error };
  }
}

function textOf(response: LlmResponse): string {
  return response.content.map((part) => (part.type === "text" ? part.text : "")).join("");
}

function toolCallsOf(response: LlmResponse) {
  return response.content.flatMap((part) =>
    part.type === "tool_call" ? [{ toolName: part.toolName, input: part.input }] : [],
  );
}

function deltaTextOf(events: readonly LlmStreamEvent[]): string {
  return events.map((event) => (event.type === "text_delta" ? event.text : "")).join("");
}

function expectValidUsage(usage: LlmUsage): void {
  const counts = [
    usage.inputTokens,
    usage.outputTokens,
    usage.cacheWriteTokens,
    usage.cacheReadTokens,
  ];
  expect(counts.every((count) => Number.isInteger(count) && count >= 0)).toBe(true);
  expect(usage.inputTokens + usage.cacheWriteTokens + usage.cacheReadTokens).toBeGreaterThan(0);
  expect(usage.outputTokens).toBeGreaterThan(0);
}

function expectCompletion(result: CallResult, expected: ExpectedCompletion): LlmResponse {
  expect(result.failure).toBeUndefined();
  const response = result.response;
  if (response === undefined) {
    throw new Error("the call completed without a response");
  }
  expect(response.stopReason).toBe(expected.stopReason);
  expectValidUsage(response.usage);
  if (expected.text !== undefined) {
    expect(textOf(response)).toBe(expected.text);
  }
  if (expected.toolCalls !== undefined) {
    expect(toolCallsOf(response)).toEqual(expected.toolCalls);
  }
  if (expected.usage !== undefined) {
    expect(response.usage).toEqual(expected.usage);
  }
  if (expected.cache === "write") {
    expect(response.usage.cacheWriteTokens).toBeGreaterThan(0);
  }
  if (expected.cache === "read") {
    expect(response.usage.cacheReadTokens).toBeGreaterThan(0);
  }
  return response;
}

function expectFailure(result: CallResult, expected: ExpectedFailure): void {
  expect(result.response).toBeUndefined();
  expect(result.failure).toBeInstanceOf(LlmError);
  expect(result.failure).toMatchObject({ problem: expected.problem });
  expect(result.failure).toHaveProperty("retryAfterMs", expected.retryAfterMs);
  if (expected.usage !== undefined) {
    expect(result.failure).toHaveProperty("usage", expected.usage);
  }
}

/** A completed stream starts, reports its content in order and ends with the whole response. */
function expectOrderedStream(result: CallResult, response: LlmResponse): void {
  const { events } = result;
  expect(events[0]).toEqual({ type: "started" });
  expect(events.at(-1)).toEqual({ type: "completed", response });
  expect(events.filter((event) => event.type === "completed")).toHaveLength(1);
  expect(deltaTextOf(events)).toBe(textOf(response));
  expect(
    events.flatMap((event) =>
      event.type === "tool_call_started"
        ? [{ toolCallId: event.toolCallId, toolName: event.toolName }]
        : [],
    ),
  ).toEqual(
    response.content.flatMap((part) =>
      part.type === "tool_call" ? [{ toolCallId: part.toolCallId, toolName: part.toolName }] : [],
    ),
  );
}

/**
 * The contract every `LlmProvider` adapter keeps (ADR-0009), run over HTTP fixtures with MSW
 * (plan D-2). An adapter's own test calls it with its fixtures; the fixtures are recordings or
 * hand-built exchanges of the same shape. No case reaches a real provider: a request to any
 * URL but the adapter's endpoint fails the test.
 */
export function describeLlmProviderContract(options: LlmContractOptions): void {
  const server = setupServer();
  const sentRequests: SentRequest[] = [];

  /** Answers every call to the endpoint with one fixture, and keeps what was sent. */
  function answerWith(fixture: LlmHttpFixture): void {
    server.use(
      http.post(options.endpointUrl, async ({ request }) => {
        const text = await request.text();
        sentRequests.push({ text, body: JSON.parse(text) as unknown });
        return new Response(fixture.response.body, {
          status: fixture.response.status,
          headers: fixture.response.headers,
        });
      }),
    );
  }

  async function runCase(contractCase: LlmContractCase): Promise<CallResult> {
    answerWith(contractCase.fixture);
    return callProvider(options.createProvider(), contractCase.mode, contractCase.request);
  }

  function expectSentOnce(fixture: LlmHttpFixture): void {
    expect(sentRequests).toHaveLength(1);
    expect(sentRequests[0]?.body).toEqual(fixture.request.body);
    options.checkRequestBody(sentRequests[0]?.body);
  }

  describe(`LlmProvider contract: ${options.providerName}`, () => {
    beforeAll(() => {
      server.listen({ onUnhandledFrame: "error" });
    });

    afterEach(() => {
      server.resetHandlers();
      sentRequests.length = 0;
    });

    afterAll(() => {
      server.close();
    });

    const allCases = [...options.cases, options.toolTurn.call];
    const completedCases = allCases.flatMap((contractCase) =>
      contractCase.expected.outcome === "completed"
        ? [{ ...contractCase, expected: contractCase.expected }]
        : [],
    );
    const failedCases = allCases.flatMap((contractCase) =>
      contractCase.expected.outcome === "failed"
        ? [{ ...contractCase, expected: contractCase.expected }]
        : [],
    );

    describe.each(completedCases)("$fixture.name ($mode)", (contractCase) => {
      it("sends the fixture's request, once, with no field the provider rejects", async () => {
        await runCase(contractCase);

        expectSentOnce(contractCase.fixture);
      });

      it("maps the answer, its stop reason and its token counts", async () => {
        const result = await runCase(contractCase);

        expectCompletion(result, contractCase.expected);
      });

      if (contractCase.mode === "stream") {
        it("reports the stream in order and ends with the whole response", async () => {
          const result = await runCase(contractCase);

          expectOrderedStream(result, expectCompletion(result, contractCase.expected));
        });
      }
    });

    describe.each(failedCases)("$fixture.name ($mode)", (contractCase) => {
      it(`fails with ${contractCase.expected.problem}`, async () => {
        const result = await runCase(contractCase);

        expectFailure(result, contractCase.expected);
      });

      it("sends the fixture's request once: the adapter never retries (plan D-9)", async () => {
        await runCase(contractCase);

        expectSentOnce(contractCase.fixture);
      });

      if (contractCase.mode === "stream") {
        it("reports nothing after the failure, and only the text that arrived before it", async () => {
          const result = await runCase(contractCase);

          expect(result.events.some((event) => event.type === "completed")).toBe(false);
          expect(deltaTextOf(result.events)).toBe(contractCase.expected.emittedText ?? "");
        });
      }
    });

    describe("a tool call and the turn after it", () => {
      const { call, buildResultRequest, result: resultTurn } = options.toolTurn;

      async function runToolTurn() {
        const callResult = await runCase(call);
        if (callResult.response === undefined) {
          throw new Error("the tool call did not complete");
        }
        const toolCallResponse = callResult.response;
        server.resetHandlers();
        answerWith(resultTurn.fixture);
        const result = await callProvider(
          options.createProvider(),
          resultTurn.mode,
          buildResultRequest(toolCallResponse),
        );
        return { toolCallResponse, result, replay: sentRequests[1] };
      }

      it("replays the model's own parts and the tool result as the fixture's request", async () => {
        const { replay } = await runToolTurn();

        expect(sentRequests).toHaveLength(2);
        expect(replay?.body).toEqual(resultTurn.fixture.request.body);
        options.checkRequestBody(replay?.body);
      });

      it("sends a reasoning part back unchanged, character for character", async () => {
        const wireValues = options.readReasoningWireValues(call.fixture);

        const { toolCallResponse, replay } = await runToolTurn();

        expect(wireValues.length).toBeGreaterThan(0);
        expect(toolCallResponse.content.filter((part) => part.type === "reasoning")).toHaveLength(
          wireValues.length,
        );
        for (const wireValue of wireValues) {
          expect(replay?.text).toContain(JSON.stringify(wireValue));
        }
      });

      it("maps the answer that follows the tool result", async () => {
        const { result } = await runToolTurn();

        expectCompletion(result, resultTurn.expected);
      });
    });
  });
}
