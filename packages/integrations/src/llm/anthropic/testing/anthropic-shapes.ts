import type Anthropic from "@anthropic-ai/sdk";

/** Hand-built Anthropic shapes for mapping tests. Recorded responses live in `fixtures/`. */

/** Usage with every field the API returns; a test overrides the counts it cares about. */
export function buildUsage(overrides: Partial<Anthropic.Usage> = {}): Anthropic.Usage {
  return {
    cache_creation: null,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    inference_geo: null,
    input_tokens: 100,
    output_tokens: 20,
    output_tokens_details: null,
    server_tool_use: null,
    service_tier: "standard",
    speed: null,
    ...overrides,
  };
}

/** A finished message; the default is a short final answer. */
export function buildMessage(overrides: Partial<Anthropic.Message> = {}): Anthropic.Message {
  return {
    id: "msg_synthetic_0001",
    container: null,
    content: [buildTextBlock("pong")],
    diagnostics: null,
    model: "claude-haiku-5-5",
    role: "assistant",
    stop_details: null,
    stop_reason: "end_turn",
    stop_sequence: null,
    type: "message",
    usage: buildUsage(),
    ...overrides,
  };
}

/** A text block. */
export function buildTextBlock(text: string): Anthropic.TextBlock {
  return { type: "text", text, citations: null };
}

/** A tool call block. */
export function buildToolUseBlock(
  id: string,
  name: string,
  input: unknown,
): Anthropic.ToolUseBlock {
  return { type: "tool_use", id, name, input, caller: { type: "direct" } };
}

/** A thinking block as current models return it by default: empty text and a signature. */
export function buildThinkingBlock(signature: string, thinking = ""): Anthropic.ThinkingBlock {
  return { type: "thinking", thinking, signature };
}

/** A JSON response, as the Messages API returns a finished message or an error. */
export function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** An error body in the documented shape. */
export function errorBody(type: string, message = "Synthetic error.") {
  return { type: "error", error: { type, message }, request_id: "req_synthetic_0001" };
}

/** One server-sent event. */
export function sseEvent(
  event: Readonly<Record<string, unknown>> & { readonly type: string },
): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

/** A streaming response from server-sent events already written as text. */
export function sseResponse(events: readonly string[]): Response {
  return new Response(events.join(""), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

/** The events the API streams for a finished message, one content block at a time. */
export function sseEventsOf(message: Anthropic.Message): string[] {
  const events: string[] = [
    sseEvent({
      type: "message_start",
      message: {
        ...message,
        content: [],
        stop_reason: null,
        usage: { ...message.usage, output_tokens: 1 },
      },
    }),
    sseEvent({ type: "ping" }),
  ];
  message.content.forEach((block, index) => {
    if (block.type === "text") {
      events.push(
        sseEvent({ type: "content_block_start", index, content_block: { ...block, text: "" } }),
        sseEvent({
          type: "content_block_delta",
          index,
          delta: { type: "text_delta", text: block.text },
        }),
      );
    } else if (block.type === "tool_use") {
      events.push(
        sseEvent({ type: "content_block_start", index, content_block: { ...block, input: {} } }),
        sseEvent({
          type: "content_block_delta",
          index,
          delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input) },
        }),
      );
    } else if (block.type === "thinking") {
      events.push(
        sseEvent({
          type: "content_block_start",
          index,
          content_block: { ...block, thinking: "", signature: "" },
        }),
        sseEvent({
          type: "content_block_delta",
          index,
          delta: { type: "thinking_delta", thinking: block.thinking },
        }),
        sseEvent({
          type: "content_block_delta",
          index,
          delta: { type: "signature_delta", signature: block.signature },
        }),
      );
    } else {
      throw new Error(`no synthetic stream for a ${block.type} block`);
    }
    events.push(sseEvent({ type: "content_block_stop", index }));
  });
  events.push(
    sseEvent({
      type: "message_delta",
      delta: {
        container: null,
        stop_details: message.stop_details,
        stop_reason: message.stop_reason,
        stop_sequence: null,
      },
      usage: {
        cache_creation_input_tokens: message.usage.cache_creation_input_tokens,
        cache_read_input_tokens: message.usage.cache_read_input_tokens,
        input_tokens: message.usage.input_tokens,
        output_tokens: message.usage.output_tokens,
        output_tokens_details: null,
        server_tool_use: null,
      },
    }),
    sseEvent({ type: "message_stop" }),
  );
  return events;
}

/** One HTTP call the adapter made: where it went and the JSON it sent. No headers are kept. */
export interface CapturedCall {
  readonly url: string;
  readonly method: string;
  readonly body: unknown;
  readonly headerNames: readonly string[];
  readonly apiVersion: string | null;
}

/** A `fetch` that answers from a script and records each call, so no test touches the network. */
export function createScriptedFetch(responses: readonly (() => Response)[]) {
  const calls: CapturedCall[] = [];
  const scriptedFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const text = await request.text();
    calls.push({
      url: request.url,
      method: request.method,
      body: text === "" ? undefined : (JSON.parse(text) as unknown),
      headerNames: [...request.headers.keys()],
      apiVersion: request.headers.get("anthropic-version"),
    });
    const respond = responses[calls.length - 1];
    if (respond === undefined) {
      throw new Error(`scripted fetch has no response for call ${calls.length}`);
    }
    return respond();
  };
  return { fetch: scriptedFetch, calls };
}
