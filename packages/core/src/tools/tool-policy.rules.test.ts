import { describe, expect, it } from "vitest";

import {
  checkCallLimits,
  checkPolicyAllowed,
  classifyToolConfig,
  pausesRun,
} from "./tool-policy.rules";
import type { ToolEffect, ToolPolicyConfig } from "./tool.types";

describe("checkPolicyAllowed", () => {
  it.each([
    ["read", "auto"],
    ["local_write", "auto"],
    ["local_write", "propose"],
    ["local_write", "approve"],
    ["external", "approve"],
  ] as const)("allows a %s tool to be %s (ADR-0011)", (effect, policy) => {
    expect(checkPolicyAllowed(effect, policy)).toBeUndefined();
  });

  it.each([
    ["read", "propose"],
    ["read", "approve"],
  ] as const)("refuses a %s tool to be %s: it has no effect to hold back", (effect, policy) => {
    expect(checkPolicyAllowed(effect, policy)).toBe("TOOL_POLICY_INVALID");
  });

  it.each(["auto", "propose"] as const)(
    "never lets an external tool be %s: the tier is a floor (BR-02, ADR-0011)",
    (policy) => {
      expect(checkPolicyAllowed("external", policy)).toBe("TOOL_POLICY_INVALID");
    },
  );

  it.each(["auto", "propose"] as const)(
    "treats a tool no source provides as external, so %s is refused (ADR-0014)",
    (policy) => {
      expect(checkPolicyAllowed(undefined, policy)).toBe("TOOL_POLICY_INVALID");
    },
  );

  it("accepts approve for a tool no source provides: the strictest policy (ADR-0014)", () => {
    expect(checkPolicyAllowed(undefined, "approve")).toBeUndefined();
  });
});

describe("pausesRun", () => {
  it("pauses the run only for approve; propose runs now like auto (ADR-0011)", () => {
    expect(pausesRun("auto")).toBe(false);
    expect(pausesRun("propose")).toBe(false);
    expect(pausesRun("approve")).toBe(true);
  });
});

describe("checkCallLimits", () => {
  const NO_CALLS = { callsThisRun: 0, callsToday: 0 };

  it("accepts any number of calls when the policy sets no limit", () => {
    expect(checkCallLimits({}, NO_CALLS)).toBeUndefined();
    expect(checkCallLimits({}, { callsThisRun: 1000, callsToday: 1000 })).toBeUndefined();
  });

  it.each([
    [0, undefined],
    [2, undefined],
    [3, "TOOL_LIMIT_REACHED"],
    [4, "TOOL_LIMIT_REACHED"],
  ] as const)(
    "with a per-run limit of 3 and %i calls already made, returns %s",
    (callsThisRun, expected) => {
      expect(checkCallLimits({ maxCallsPerRun: 3 }, { callsThisRun, callsToday: 0 })).toBe(
        expected,
      );
    },
  );

  it.each([
    [0, undefined],
    [2, undefined],
    [3, "TOOL_LIMIT_REACHED"],
    [4, "TOOL_LIMIT_REACHED"],
  ] as const)(
    "with a per-day limit of 3 and %i calls already made today, returns %s",
    (callsToday, expected) => {
      expect(checkCallLimits({ maxCallsPerDay: 3 }, { callsThisRun: 0, callsToday })).toBe(
        expected,
      );
    },
  );

  it("with a limit of 1, accepts the first call and refuses the second", () => {
    expect(checkCallLimits({ maxCallsPerRun: 1 }, NO_CALLS)).toBeUndefined();
    expect(checkCallLimits({ maxCallsPerRun: 1 }, { callsThisRun: 1, callsToday: 0 })).toBe(
      "TOOL_LIMIT_REACHED",
    );
  });

  it("applies each limit to its own count", () => {
    const limits = { maxCallsPerRun: 2, maxCallsPerDay: 5 };

    expect(checkCallLimits(limits, { callsThisRun: 1, callsToday: 4 })).toBeUndefined();
    expect(checkCallLimits(limits, { callsThisRun: 2, callsToday: 4 })).toBe("TOOL_LIMIT_REACHED");
    expect(checkCallLimits(limits, { callsThisRun: 1, callsToday: 5 })).toBe("TOOL_LIMIT_REACHED");
  });

  it("ignores the daily count when only a per-run limit is set", () => {
    expect(
      checkCallLimits({ maxCallsPerRun: 2 }, { callsThisRun: 0, callsToday: 1000 }),
    ).toBeUndefined();
  });
});

describe("classifyToolConfig (#14)", () => {
  const toolsOf = (entries: readonly (readonly [string, ToolEffect])[]) =>
    new Map(entries.map(([name, effect]) => [name, { effect }]));
  const EFFECTS = toolsOf([
    ["get_current_time", "read"],
    ["remember_fact", "local_write"],
    ["publish_post", "external"],
  ]);

  const VALID_CONFIG: ToolPolicyConfig = {
    policies: {
      get_current_time: { policy: "auto" },
      remember_fact: { policy: "propose" },
      publish_post: { policy: "approve" },
    },
    tasks: {
      chat: ["get_current_time", "remember_fact", "publish_post"],
      draft_post: ["publish_post"],
    },
  };

  it("classifies a valid configuration: each task's tools with their policies, in order", () => {
    const classification = classifyToolConfig(VALID_CONFIG, EFFECTS);
    if (!classification.ok) {
      throw new Error("expected a valid configuration");
    }

    const chat = classification.value.get("chat");
    expect([...(chat?.keys() ?? [])]).toEqual([
      "get_current_time",
      "remember_fact",
      "publish_post",
    ]);
    expect(chat?.get("remember_fact")).toEqual({
      tool: { effect: "local_write" },
      entry: { policy: "propose" },
    });
    expect([...(classification.value.get("draft_post")?.keys() ?? [])]).toEqual(["publish_post"]);
  });

  it("finds nothing in an empty configuration", () => {
    expect(classifyToolConfig({ policies: {}, tasks: {} }, new Map())).toEqual({
      ok: true,
      value: new Map(),
    });
  });

  it("accepts a task with no tools", () => {
    expect(classifyToolConfig({ policies: {}, tasks: { chat: [] } }, EFFECTS)).toEqual({
      ok: true,
      value: new Map([["chat", new Map()]]),
    });
  });

  it("reports an external tool set to auto (BR-02, ADR-0011)", () => {
    const config: ToolPolicyConfig = {
      policies: { publish_post: { policy: "auto" } },
      tasks: {},
    };

    expect(classifyToolConfig(config, EFFECTS)).toEqual({
      ok: false,
      problem: "TOOL_POLICY_INVALID",
      toolName: "publish_post",
    });
  });

  it("reports a policy entry for an unknown tool unless it is approve (ADR-0014)", () => {
    const auto: ToolPolicyConfig = { policies: { send_email: { policy: "auto" } }, tasks: {} };
    const approve: ToolPolicyConfig = {
      policies: { send_email: { policy: "approve" } },
      tasks: {},
    };

    expect(classifyToolConfig(auto, EFFECTS)).toEqual({
      ok: false,
      problem: "TOOL_POLICY_INVALID",
      toolName: "send_email",
    });
    expect(classifyToolConfig(approve, EFFECTS).ok).toBe(true);
  });

  it("reports a task that lists a tool with no policy entry: never silently left out (ADR-0014)", () => {
    const config: ToolPolicyConfig = {
      policies: { get_current_time: { policy: "auto" } },
      tasks: { chat: ["get_current_time", "remember_fact"] },
    };

    expect(classifyToolConfig(config, EFFECTS)).toEqual({
      ok: false,
      problem: "TOOL_UNCLASSIFIED",
      toolName: "remember_fact",
    });
  });

  it("reports a task that lists a tool no source provides, even with an approve entry (ADR-0014)", () => {
    const config: ToolPolicyConfig = {
      policies: { send_email: { policy: "approve" } },
      tasks: { chat: ["send_email"] },
    };

    expect(classifyToolConfig(config, EFFECTS)).toEqual({
      ok: false,
      problem: "TOOL_UNCLASSIFIED",
      toolName: "send_email",
    });
  });

  it.each(["constructor", "__proto__", "toString"])(
    "does not mistake the prototype key %s for a policy entry (KP-08)",
    (toolName) => {
      const effects = toolsOf([[toolName, "read"]]);
      const config: ToolPolicyConfig = { policies: {}, tasks: { chat: [toolName] } };

      expect(classifyToolConfig(config, effects)).toEqual({
        ok: false,
        problem: "TOOL_UNCLASSIFIED",
        toolName,
      });
    },
  );

  it("reports a policy problem before a task problem", () => {
    const config: ToolPolicyConfig = {
      policies: { publish_post: { policy: "auto" } },
      tasks: { chat: ["remember_fact"] },
    };

    expect(classifyToolConfig(config, EFFECTS)).toMatchObject({ problem: "TOOL_POLICY_INVALID" });
  });
});
