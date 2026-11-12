import * as z from "zod";

import { namedRecordSchema, TASK_NAME_PATTERN } from "../shared";

import { LlmError, type LlmErrorReason, type LlmProblem } from "./llm.errors";
import {
  LLM_EFFORTS,
  llmCapabilitiesSchema,
  type LlmCapabilities,
  type LlmEffort,
  type PriceTier,
  priceTierSchema,
} from "./llm.types";
import {
  findRouteProblem,
  NO_TASK_REQUIREMENTS,
  type TaskRequirements,
} from "./model-routing.rules";
import { arePriceTiersValid } from "./usage.rules";

/** Plan D-9 rule 3: attempts per call, counting the first try. */
const DEFAULT_MAX_ATTEMPTS = 3;
/** Owner, 2026-11-12: per-call defaults, retuned after the first evals. */
const DEFAULT_MAX_OUTPUT_TOKENS = 16_000;
const DEFAULT_TIMEOUT_MS = 120_000;
const MIN_POSITIVE = 1;

const catalogModelSchema = z.strictObject({
  provider: z.string().min(1),
  id: z.string().min(1),
  capabilities: llmCapabilitiesSchema,
  /** The most output the model can write in one call (review fixes, D-3). */
  maxOutputTokens: z.int().min(MIN_POSITIVE),
  priceTiers: z.array(priceTierSchema).refine(arePriceTiersValid, {
    message: "Price tiers must rise, and only the last has no maxPromptTokens",
  }),
});

const taskRouteSchema = z.strictObject({
  provider: z.string().min(1),
  model: z.string().min(1),
  effort: z.enum(LLM_EFFORTS).optional(),
  maxAttempts: z.int().min(MIN_POSITIVE).default(DEFAULT_MAX_ATTEMPTS),
  maxOutputTokens: z.int().min(MIN_POSITIVE).default(DEFAULT_MAX_OUTPUT_TOKENS),
  timeoutMs: z.int().min(MIN_POSITIVE).default(DEFAULT_TIMEOUT_MS),
});

/**
 * The model catalog: usable models with capabilities and prices, and one route per task
 * (ADR-0009). Route keys are task names, checked before parsing so none is dropped (KP-21).
 */
export const modelCatalogSchema = z.strictObject({
  models: z.array(catalogModelSchema),
  routes: namedRecordSchema(TASK_NAME_PATTERN, taskRouteSchema),
});

/** The model catalog as written in configuration. */
export type ModelCatalogInput = z.input<typeof modelCatalogSchema>;

/** Dependencies of `createModelRegistry`. */
export interface ModelRegistryDependencies {
  /** The catalog as read from the config file; validated here (plan D-4). */
  readonly catalog: unknown;
  /** Providers with valid configuration; only they may receive owner data (BR-27). */
  readonly enabledProviderIds: readonly string[];
  /**
   * What each task needs from its model (BR-25; review fixes, D-3). Every task listed must have
   * a route; a task not listed needs nothing.
   */
  readonly requirementsByTask: ReadonlyMap<string, TaskRequirements>;
}

/** Everything a model call for a task needs: where it goes, its limits and its prices. */
export interface ResolvedModelRoute {
  readonly task: string;
  readonly provider: string;
  readonly model: string;
  readonly effort: LlmEffort | undefined;
  readonly maxAttempts: number;
  readonly maxOutputTokens: number;
  readonly timeoutMs: number;
  readonly capabilities: LlmCapabilities;
  readonly priceTiers: readonly PriceTier[];
}

/** Result of `resolveRoute`. A task without a route says so, for the logs (finding L11). */
export type ModelRouteResolution =
  | { readonly ok: true; readonly value: ResolvedModelRoute }
  | {
      readonly ok: false;
      readonly problem: Extract<LlmProblem, "LLM_ROUTE_INVALID">;
      readonly task: string;
      readonly reason: Extract<LlmErrorReason, "no_route">;
    };

function modelKey(provider: string, id: string): string {
  return JSON.stringify([provider, id]);
}

/**
 * Creates the model registry: it validates the catalog and every task route once, then resolves
 * a task to its route. Throws `LlmError` (`LLM_ROUTE_INVALID`) when the catalog or a route is
 * not valid, which stops the app at startup (BR-25).
 */
export function createModelRegistry(dependencies: ModelRegistryDependencies) {
  const parsedCatalog = modelCatalogSchema.safeParse(dependencies.catalog);
  if (!parsedCatalog.success) {
    throw new LlmError("LLM_ROUTE_INVALID", {
      reason: "catalog_malformed",
      cause: parsedCatalog.error,
    });
  }
  const catalog = parsedCatalog.data;
  const enabledProviderSet = new Set(dependencies.enabledProviderIds);

  const modelByKey = new Map<string, (typeof catalog.models)[number]>();
  for (const model of catalog.models) {
    const key = modelKey(model.provider, model.id);
    if (modelByKey.has(key)) {
      throw new LlmError("LLM_ROUTE_INVALID", { reason: "duplicate_model" });
    }
    modelByKey.set(key, model);
  }

  // A Map, not an object: the task name of a lookup may come from outside (KP-08).
  const routeByTask = new Map<string, ResolvedModelRoute>();
  for (const [task, route] of Object.entries(catalog.routes)) {
    const model = modelByKey.get(modelKey(route.provider, route.model));
    if (model === undefined) {
      throw new LlmError("LLM_ROUTE_INVALID", { task, reason: "unknown_model" });
    }
    const finding = findRouteProblem({
      capabilities: model.capabilities,
      modelMaxOutputTokens: model.maxOutputTokens,
      routeMaxOutputTokens: route.maxOutputTokens,
      isProviderEnabled: enabledProviderSet.has(route.provider),
      requirements: dependencies.requirementsByTask.get(task) ?? NO_TASK_REQUIREMENTS,
    });
    if (finding !== undefined) {
      throw new LlmError("LLM_ROUTE_INVALID", {
        task,
        reason: finding.refusal,
        ...(finding.need === undefined ? {} : { need: finding.need }),
      });
    }
    routeByTask.set(task, {
      task,
      provider: route.provider,
      model: route.model,
      effort: route.effort,
      maxAttempts: route.maxAttempts,
      maxOutputTokens: route.maxOutputTokens,
      timeoutMs: route.timeoutMs,
      capabilities: model.capabilities,
      priceTiers: model.priceTiers,
    });
  }

  // A task with requirements and no route could never run: stop at startup (finding L2).
  for (const task of dependencies.requirementsByTask.keys()) {
    if (!routeByTask.has(task)) {
      throw new LlmError("LLM_ROUTE_INVALID", { task, reason: "no_route" });
    }
  }

  /** The route of a task; a task without a route cannot run. */
  function resolveRoute(task: string): ModelRouteResolution {
    const route = routeByTask.get(task);
    return route === undefined
      ? { ok: false, problem: "LLM_ROUTE_INVALID", task, reason: "no_route" }
      : { ok: true, value: route };
  }

  /** Every valid route, for the checks a composition root makes across modules. */
  function listRoutes(): readonly ResolvedModelRoute[] {
    return [...routeByTask.values()];
  }

  return { resolveRoute, listRoutes };
}

/** The model registry, created once in a composition root. */
export type ModelRegistry = ReturnType<typeof createModelRegistry>;
