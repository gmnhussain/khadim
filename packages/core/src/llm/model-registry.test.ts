import { describe, expect, it } from "vitest";

import { LlmError } from "./llm.errors";
import { createModelRegistry, modelCatalogSchema } from "./model-registry";
import type { TaskRequirements } from "./model-routing.rules";
import { SAMPLE_MODEL_CATALOG, SAMPLE_TASK_REQUIREMENTS } from "./testing";

function firstSampleModel() {
  const [model] = SAMPLE_MODEL_CATALOG.models;
  if (model === undefined) {
    throw new Error("the sample catalog has no models");
  }
  return model;
}

const HAIKU = firstSampleModel();

function create(
  catalog: unknown = SAMPLE_MODEL_CATALOG,
  options: {
    enabledProviderIds?: readonly string[];
    requirementsByTask?: ReadonlyMap<string, TaskRequirements>;
  } = {},
) {
  return createModelRegistry({
    catalog,
    enabledProviderIds: options.enabledProviderIds ?? ["anthropic"],
    requirementsByTask: options.requirementsByTask ?? SAMPLE_TASK_REQUIREMENTS,
  });
}

/** Only chat's requirements, for catalogs that route chat alone. */
const CHAT_ONLY = {
  requirementsByTask: new Map([
    ["chat", SAMPLE_TASK_REQUIREMENTS.get("chat") ?? { needs: [], minContextTokens: 0 }],
  ]),
};

function captureLlmError(action: () => unknown): LlmError {
  try {
    action();
  } catch (error) {
    if (error instanceof LlmError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected an LlmError");
}

describe("modelCatalogSchema", () => {
  it("accepts the sample catalog with the values of plan D-1", () => {
    expect(modelCatalogSchema.safeParse(SAMPLE_MODEL_CATALOG).success).toBe(true);
  });

  it("fills in the route defaults: 3 attempts, 16,000 output tokens, 120 seconds", () => {
    const parsed = modelCatalogSchema.parse(SAMPLE_MODEL_CATALOG);

    expect(parsed.routes.chat).toEqual({
      provider: "anthropic",
      model: "claude-haiku-5-5",
      effort: "low",
      maxAttempts: 3,
      maxOutputTokens: 16_000,
      timeoutMs: 120_000,
    });
  });

  it("refuses an unknown key on a route", () => {
    const result = modelCatalogSchema.safeParse({
      ...SAMPLE_MODEL_CATALOG,
      routes: { chat: { ...SAMPLE_MODEL_CATALOG.routes.chat, temperature: 0 } },
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toMatchObject([
      { code: "unrecognized_keys", keys: ["temperature"], path: ["routes", "chat"] },
    ]);
  });

  it.each(["maxAttempts", "maxOutputTokens", "timeoutMs"])("refuses a %s of zero", (field) => {
    const result = modelCatalogSchema.safeParse({
      ...SAMPLE_MODEL_CATALOG,
      routes: { chat: { ...SAMPLE_MODEL_CATALOG.routes.chat, [field]: 0 } },
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toMatchObject([
      { code: "too_small", path: ["routes", "chat", field] },
    ]);
  });

  it("accepts a maxAttempts of one, the first try only", () => {
    const result = modelCatalogSchema.safeParse({
      ...SAMPLE_MODEL_CATALOG,
      routes: { chat: { ...SAMPLE_MODEL_CATALOG.routes.chat, maxAttempts: 1 } },
    });

    expect(result.success).toBe(true);
  });

  it("refuses an unknown effort", () => {
    const result = modelCatalogSchema.safeParse({
      ...SAMPLE_MODEL_CATALOG,
      routes: { chat: { ...SAMPLE_MODEL_CATALOG.routes.chat, effort: "extreme" } },
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toMatchObject([
      { code: "invalid_value", path: ["routes", "chat", "effort"] },
    ]);
  });

  it("refuses a model whose last price tier has a maximum (plan P-6)", () => {
    const result = modelCatalogSchema.safeParse({
      models: [{ ...HAIKU, priceTiers: [HAIKU.priceTiers[0]] }],
      routes: {},
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toMatchObject([
      { code: "custom", path: ["models", 0, "priceTiers"] },
    ]);
  });

  it("refuses a model without price tiers", () => {
    const result = modelCatalogSchema.safeParse({
      models: [{ ...HAIKU, priceTiers: [] }],
      routes: {},
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toMatchObject([
      { code: "custom", path: ["models", 0, "priceTiers"] },
    ]);
  });

  it("refuses a negative price and a price that is not a whole number", () => {
    const tier = HAIKU.priceTiers[1];
    const result = modelCatalogSchema.safeParse({
      models: [
        {
          ...HAIKU,
          priceTiers: [
            {
              ...tier,
              inputMicroUsdPerMillionTokens: -1,
              outputMicroUsdPerMillionTokens: 0.5,
            },
          ],
        },
      ],
      routes: {},
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toMatchObject([
      { code: "too_small", path: ["models", 0, "priceTiers", 0, "inputMicroUsdPerMillionTokens"] },
      {
        code: "invalid_type",
        path: ["models", 0, "priceTiers", 0, "outputMicroUsdPerMillionTokens"],
      },
    ]);
  });

  it("refuses a model with a missing capability flag", () => {
    const { supportsTools: _supportsTools, ...capabilities } = HAIKU.capabilities;
    const result = modelCatalogSchema.safeParse({
      models: [{ ...HAIKU, capabilities }],
      routes: {},
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toMatchObject([
      { code: "invalid_type", path: ["models", 0, "capabilities", "supportsTools"] },
    ]);
  });
});

describe("modelCatalogSchema: route keys", () => {
  it("refuses a __proto__ route key instead of dropping it (L18, KP-21)", () => {
    const catalog: unknown = JSON.parse(
      JSON.stringify({ models: SAMPLE_MODEL_CATALOG.models, routes: {} }).replace(
        '"routes":{}',
        `"routes":{"__proto__":${JSON.stringify(SAMPLE_MODEL_CATALOG.routes.chat)}}`,
      ),
    );

    const result = modelCatalogSchema.safeParse(catalog);

    expect(result.success).toBe(false);
    expect(result.error?.issues).toMatchObject([{ code: "custom", path: ["routes", "__proto__"] }]);
  });

  it("refuses a route key that is not a task name", () => {
    const result = modelCatalogSchema.safeParse({
      ...SAMPLE_MODEL_CATALOG,
      routes: { "Draft Post": SAMPLE_MODEL_CATALOG.routes.chat },
    });

    expect(result.error?.issues).toMatchObject([
      { code: "custom", path: ["routes", "Draft Post"] },
    ]);
  });
});

describe("createModelRegistry", () => {
  it("resolves a task to its route, limits, capabilities and prices", () => {
    const resolution = create().resolveRoute("chat");

    expect(resolution).toEqual({
      ok: true,
      value: {
        task: "chat",
        provider: "anthropic",
        model: "claude-haiku-5-5",
        effort: "low",
        maxAttempts: 3,
        maxOutputTokens: 16_000,
        timeoutMs: 120_000,
        capabilities: HAIKU.capabilities,
        priceTiers: HAIKU.priceTiers,
      },
    });
  });

  it("resolves a route without an effort", () => {
    const { effort: _effort, ...route } = SAMPLE_MODEL_CATALOG.routes.chat;
    const registry = create({ ...SAMPLE_MODEL_CATALOG, routes: { chat: route } }, CHAT_ONLY);

    expect(registry.resolveRoute("chat")).toMatchObject({ ok: true, value: { effort: undefined } });
  });

  it.each(["summarise", "constructor", "__proto__"])(
    "returns LLM_ROUTE_INVALID, naming the task and no_route, for the task %s (L11)",
    (task) => {
      expect(create().resolveRoute(task)).toEqual({
        ok: false,
        problem: "LLM_ROUTE_INVALID",
        task,
        reason: "no_route",
      });
    },
  );

  it("stops on a malformed catalog, keeping the schema issues as the cause", () => {
    const error = captureLlmError(() => create({ models: [] }));

    expect(error.problem).toBe("LLM_ROUTE_INVALID");
    expect(error.reason).toBe("catalog_malformed");
    expect(error.cause).toBeInstanceOf(Error);
  });

  it("stops when the catalog lists a model twice", () => {
    const error = captureLlmError(() =>
      create({ models: [HAIKU, HAIKU], routes: SAMPLE_MODEL_CATALOG.routes }),
    );

    expect(error).toMatchObject({ problem: "LLM_ROUTE_INVALID", reason: "duplicate_model" });
  });

  it("allows the same model id under two providers", () => {
    const registry = create(
      {
        models: [HAIKU, { ...HAIKU, provider: "local" }],
        routes: { chat: { provider: "local", model: HAIKU.id } },
      },
      { ...CHAT_ONLY, enabledProviderIds: ["local"] },
    );

    expect(registry.resolveRoute("chat")).toMatchObject({ ok: true, value: { provider: "local" } });
  });

  it("stops when a route names a model the catalog does not list", () => {
    const error = captureLlmError(() =>
      create({
        models: [HAIKU],
        routes: { chat: { provider: "anthropic", model: "claude-haiku-9" } },
      }),
    );

    expect(error).toMatchObject({
      problem: "LLM_ROUTE_INVALID",
      task: "chat",
      reason: "unknown_model",
    });
  });

  it("stops when a route goes to a provider the owner did not enable (BR-27)", () => {
    const error = captureLlmError(() => create(SAMPLE_MODEL_CATALOG, { enabledProviderIds: [] }));

    expect(error).toMatchObject({ problem: "LLM_ROUTE_INVALID", reason: "provider_disabled" });
  });

  it("stops when a task that needs tools is routed to a model without them (BR-25)", () => {
    const error = captureLlmError(() =>
      create({
        models: [{ ...HAIKU, capabilities: { ...HAIKU.capabilities, supportsTools: false } }],
        routes: { chat: SAMPLE_MODEL_CATALOG.routes.chat },
      }),
    );

    expect(error).toMatchObject({
      problem: "LLM_ROUTE_INVALID",
      task: "chat",
      reason: "missing_capability",
      need: "tools",
    });
  });

  it("stops when a task with requirements has no route (L2)", () => {
    const error = captureLlmError(() =>
      create({ ...SAMPLE_MODEL_CATALOG, routes: { chat: SAMPLE_MODEL_CATALOG.routes.chat } }),
    );

    expect(error).toMatchObject({
      problem: "LLM_ROUTE_INVALID",
      task: "draft_post",
      reason: "no_route",
    });
  });

  it("stops when a route asks for more output than the model can write (L5)", () => {
    const error = captureLlmError(() =>
      create(
        {
          models: [{ ...HAIKU, maxOutputTokens: 8_000 }],
          routes: { chat: SAMPLE_MODEL_CATALOG.routes.chat },
        },
        CHAT_ONLY,
      ),
    );

    expect(error).toMatchObject({ task: "chat", reason: "output_over_model_limit" });
  });

  it("stops when the model's context is smaller than the task needs (L4, D-3)", () => {
    const error = captureLlmError(() =>
      create(
        {
          models: [{ ...HAIKU, capabilities: { ...HAIKU.capabilities, maxContextTokens: 32_000 } }],
          routes: { chat: SAMPLE_MODEL_CATALOG.routes.chat },
        },
        CHAT_ONLY,
      ),
    );

    expect(error).toMatchObject({ task: "chat", reason: "context_too_small" });
  });

  it("refuses a catalog model without a maximum output (D-3)", () => {
    const { maxOutputTokens: _maxOutputTokens, ...model } = HAIKU;

    const error = captureLlmError(() =>
      create({ models: [model], routes: { chat: SAMPLE_MODEL_CATALOG.routes.chat } }, CHAT_ONLY),
    );

    expect(error.reason).toBe("catalog_malformed");
  });

  it("lists every route it validated", () => {
    expect(
      create()
        .listRoutes()
        .map((route) => route.task),
    ).toEqual(["chat", "draft_post", "draft_reply", "eval_grader"]);
  });

  it("accepts a model without tools for a task that needs none", () => {
    const registry = create(
      {
        models: [{ ...HAIKU, capabilities: { ...HAIKU.capabilities, supportsTools: false } }],
        routes: { summarise: SAMPLE_MODEL_CATALOG.routes.chat },
      },
      { requirementsByTask: new Map() },
    );

    expect(registry.resolveRoute("summarise").ok).toBe(true);
  });
});
