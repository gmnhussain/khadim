import { describe, expect, it } from "vitest";

import { createFixedClock } from "../../shared/testing";
import { createGetCurrentTimeTool } from "./get-current-time.tools";

function createTool(start = "2026-11-12T03:30:05.000Z", defaultTimeZone = "Asia/Dhaka") {
  return createGetCurrentTimeTool({ clock: createFixedClock(start), defaultTimeZone });
}

async function run(tool: ReturnType<typeof createTool>, input: unknown) {
  const prepared = tool.prepare(input);
  if (!prepared.ok) {
    throw new Error("expected valid input");
  }
  return prepared.execute();
}

describe("get_current_time", () => {
  it("is a read tool with a description written for the model", () => {
    const tool = createTool();

    expect(tool.name).toBe("get_current_time");
    expect(tool.effect).toBe("read");
    expect(tool.description).toContain("current date and time");
  });

  it("takes one optional input, timeZone, and refuses unknown keys (plan D-3)", () => {
    const tool = createTool();

    expect(tool.inputJsonSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
      properties: { timeZone: { type: "string", maxLength: 64 } },
    });
    expect(tool.inputJsonSchema).not.toHaveProperty("required");
  });

  it("returns the UTC timestamp, the configured zone and the local date and time", async () => {
    const output = await run(createTool(), {});

    expect(output).toEqual({
      utc: "2026-11-12T03:30:05.000Z",
      timeZone: "Asia/Dhaka",
      localDate: "2026-11-12",
      localTime: "09:30:05",
    });
  });

  it("uses the zone the model names", async () => {
    const output = await run(createTool(), { timeZone: "America/New_York" });

    expect(output).toEqual({
      utc: "2026-11-12T03:30:05.000Z",
      timeZone: "America/New_York",
      localDate: "2026-11-11",
      localTime: "22:30:05",
    });
  });

  it("accepts UTC", async () => {
    const output = await run(createTool(), { timeZone: "UTC" });

    expect(output).toMatchObject({
      timeZone: "UTC",
      localDate: "2026-11-12",
      localTime: "03:30:05",
    });
  });

  it("returns the canonical name of a zone written in another case", async () => {
    const output = await run(createTool(), { timeZone: "asia/dhaka" });

    expect(output).toMatchObject({ timeZone: "Asia/Dhaka" });
  });

  it("writes midnight as 00, on the 24-hour clock", async () => {
    const output = await run(createTool("2026-11-11T18:00:00.000Z"), {});

    expect(output).toMatchObject({ localDate: "2026-11-12", localTime: "00:00:00" });
  });

  it("follows the clock", async () => {
    const clock = createFixedClock("2026-11-12T03:30:05.000Z");
    const tool = createGetCurrentTimeTool({ clock, defaultTimeZone: "Asia/Dhaka" });

    clock.advanceBy(60_000);

    expect(await run(tool, {})).toMatchObject({ utc: "2026-11-12T03:31:05.000Z" });
  });

  it.each(["Mars/Olympus", "Dhaka time", "+06:00", ""])(
    "reports the unknown zone %j as invalid input (TOOL_INPUT_INVALID)",
    (timeZone) => {
      const prepared = createTool().prepare({ timeZone });

      expect(prepared).toMatchObject({ ok: false, issues: [{ path: "input.timeZone" }] });
    },
  );

  it("accepts a zone name of 64 characters only if it is known, and reports 65 as too long", () => {
    const tool = createTool();

    expect(tool.prepare({ timeZone: "x".repeat(64) })).toMatchObject({
      ok: false,
      issues: [{ path: "input.timeZone", code: "custom" }],
    });
    expect(tool.prepare({ timeZone: "x".repeat(65) })).toMatchObject({
      ok: false,
      issues: [{ path: "input.timeZone", code: "too_big" }, { path: "input.timeZone" }],
    });
  });

  it("tells the model how to fix an unknown zone", () => {
    const prepared = createTool().prepare({ timeZone: "Mars/Olympus" });

    expect(prepared).toMatchObject({
      ok: false,
      issues: [
        {
          path: "input.timeZone",
          code: "custom",
          message: "Unknown time zone: use an IANA name such as Europe/Berlin",
        },
      ],
    });
  });

  it("reports an unknown key", () => {
    const prepared = createTool().prepare({ timezone: "UTC" });

    expect(prepared).toMatchObject({
      ok: false,
      issues: [{ path: "input", code: "unrecognized_keys" }],
    });
  });

  it("refuses to be created with a configured zone that is not an IANA name", () => {
    expect(() => createTool("2026-11-12T03:30:05.000Z", "Dhaka")).toThrow(
      "configured time zone is not an IANA name: Dhaka",
    );
  });
});
