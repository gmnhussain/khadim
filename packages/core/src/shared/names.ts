import * as z from "zod";

/** A tool name: snake_case `verb_noun`, two words or more (conventions §8, §15.4). */
export const TOOL_NAME_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;

/** A task name: snake_case, one word or more, such as `chat` or `draft_post`. */
export const TASK_NAME_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * A configuration record whose keys are names. The keys are checked on the raw object before
 * `z.record` parses it, because Zod 4 drops a `__proto__` key before its key schema runs, so a
 * key pattern alone never reports it (KP-21; review fixes, D-10).
 */
export function namedRecordSchema<TValue extends z.ZodType>(
  namePattern: RegExp,
  valueSchema: TValue,
) {
  const recordSchema = z.record(z.string().regex(namePattern), valueSchema);
  return z
    .custom<z.input<typeof recordSchema>>()
    .superRefine((value, context) => {
      // Any other shape is left to `z.record`, which reports it.
      if (!isPlainObject(value)) {
        return;
      }
      for (const key of Object.keys(value)) {
        if (!namePattern.test(key)) {
          context.addIssue({ code: "custom", path: [key], message: `Not a valid name: ${key}` });
        }
      }
    })
    .pipe(recordSchema);
}
