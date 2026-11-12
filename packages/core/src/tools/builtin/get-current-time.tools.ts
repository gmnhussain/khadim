import * as z from "zod";

import type { Clock } from "../../shared";
import { defineTool } from "../tool-definition";
import type { ToolDefinition } from "../tool.types";

/** Dependencies of `createGetCurrentTimeTool`. */
export interface GetCurrentTimeToolDependencies {
  readonly clock: Clock;
  /** The configured IANA time zone, used when the model names none (conventions §7). */
  readonly defaultTimeZone: string;
}

/** IANA names such as `Asia/Dhaka` or `UTC`; raw offsets such as `+06:00` are not names. */
const TIME_ZONE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_+\-/]*$/;
const MAX_TIME_ZONE_LENGTH = 64;
/**
 * The locale `Intl` formats with. Only the parts are read, by type, so the locale does not
 * change the result; a fixed one keeps it the same on every machine (finding #17).
 */
const FORMAT_LOCALE = "en-US";

/**
 * Returns the name `Intl` resolves a known IANA time zone to, or nothing for an unknown one. That
 * is not always the canonical name: Node 24's ICU returns some legacy links, such as
 * `Asia/Calcutta`, as given (finding #12).
 */
const resolveTimeZone = (name: string): string | undefined => {
  if (!TIME_ZONE_NAME_PATTERN.test(name)) {
    return undefined;
  }
  try {
    return new Intl.DateTimeFormat(FORMAT_LOCALE, { timeZone: name }).resolvedOptions().timeZone;
  } catch {
    // Intl throws a RangeError for a time zone it does not know.
    return undefined;
  }
};

const formatLocalDateTime = (instant: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat(FORMAT_LOCALE, {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const valueByType = new Map(parts.map((part) => [part.type, part.value]));
  const read = (type: Intl.DateTimeFormatPartTypes): string => {
    const value = valueByType.get(type);
    if (value === undefined) {
      throw new Error(`date formatting returned no ${type}`);
    }
    return value;
  };
  return {
    localDate: `${read("year")}-${read("month")}-${read("day")}`,
    localTime: `${read("hour")}:${read("minute")}:${read("second")}`,
  };
};

const inputSchema = z.strictObject({
  timeZone: z
    .string()
    // `abort`: Zod 4 runs the next check after a failed one, so without it the refine would
    // still run on an over-long string (KP-22).
    .max(MAX_TIME_ZONE_LENGTH, { abort: true })
    .refine((name) => resolveTimeZone(name) !== undefined, {
      message: "Unknown time zone: use an IANA name such as Europe/Berlin",
    })
    .optional()
    .describe("IANA time zone name, for example Europe/Berlin. Omit for the owner's time zone."),
});

/** Creates `get_current_time`: effect `read`; it tells the model the date and time. */
export function createGetCurrentTimeTool(
  dependencies: GetCurrentTimeToolDependencies,
): ToolDefinition {
  const { clock } = dependencies;
  const defaultTimeZone = resolveTimeZone(dependencies.defaultTimeZone);
  if (defaultTimeZone === undefined) {
    throw new Error(`configured time zone is not an IANA name: ${dependencies.defaultTimeZone}`);
  }

  return defineTool({
    name: "get_current_time",
    description:
      "Returns the current date and time. Use it whenever an answer depends on today's date " +
      "or the time now; never guess them. Returns the UTC timestamp, the time zone used, and " +
      "the local date (YYYY-MM-DD) and time (HH:MM:SS, 24-hour clock) in that zone.",
    effect: "read",
    inputSchema,
    handler: (input) => {
      const requestedTimeZone =
        input.timeZone === undefined ? undefined : resolveTimeZone(input.timeZone);
      const timeZone = requestedTimeZone ?? defaultTimeZone;
      const now = clock.now();
      return Promise.resolve({
        utc: now.toISOString(),
        timeZone,
        ...formatLocalDateTime(now, timeZone),
      });
    },
  });
}
