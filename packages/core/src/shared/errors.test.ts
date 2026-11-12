import { describe, expect, it } from "vitest";

import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ProblemError,
  SHARED_PROBLEMS,
  ValidationError,
  VersionConflictError,
} from "./errors";

const CASES = [
  { create: () => new NotFoundError(), name: "NotFoundError", problem: "NOT_FOUND" },
  { create: () => new ForbiddenError(), name: "ForbiddenError", problem: "FORBIDDEN" },
  { create: () => new ValidationError(), name: "ValidationError", problem: "VALIDATION_FAILED" },
  {
    create: () => new VersionConflictError(),
    name: "VersionConflictError",
    problem: "VERSION_CONFLICT",
  },
  { create: () => new ConflictError(), name: "ConflictError", problem: "CONFLICT" },
] as const;

describe("shared errors", () => {
  it.each(CASES)(
    "$name carries its name and the $problem code (conventions §12.1)",
    ({ create, name, problem }) => {
      const error = create();

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe(name);
      expect(error.problem).toBe(problem);
      expect(error.message).not.toBe("");
    },
  );

  it("has one error for every shared problem code", () => {
    expect(CASES.map((testCase) => testCase.problem)).toEqual([...SHARED_PROBLEMS]);
  });

  it("carries a problem code and never an HTTP status (conventions §12.1)", () => {
    for (const { create } of CASES) {
      const error = create();

      expect(error).not.toHaveProperty("status");
      expect(error).not.toHaveProperty("statusCode");
    }
  });
});

describe("ProblemError", () => {
  it("keeps the cause it was given, for logs (#15)", () => {
    const cause = new Error("duplicate key value violates unique constraint");

    const error = new ConflictError({ cause });

    expect(error.cause).toBe(cause);
    expect(error).toBeInstanceOf(ProblemError);
  });

  it.each(CASES)(
    "$name without a cause has no cause property at all (L13, KP-07)",
    ({ create }) => {
      expect("cause" in create()).toBe(false);
    },
  );

  it("keeps a cause on a ValidationError beside its fields", () => {
    const cause = new Error("schema issue");

    const error = new ValidationError([{ field: "text", reason: "too_long" }], { cause });

    expect(error.cause).toBe(cause);
    expect(error.fields).toHaveLength(1);
  });
});

describe("ValidationError", () => {
  it("has no field problems when none are given", () => {
    expect(new ValidationError().fields).toEqual([]);
  });

  it("lists each invalid field with its reason code", () => {
    const error = new ValidationError([
      { field: "text", reason: "too_long" },
      { field: "platform", reason: "unknown_value" },
    ]);

    expect(error.fields).toEqual([
      { field: "text", reason: "too_long" },
      { field: "platform", reason: "unknown_value" },
    ]);
  });

  it("copies the field problems, so a later change to the input does not reach the error", () => {
    const fields = [{ field: "text", reason: "too_long" }];
    const error = new ValidationError(fields);

    fields.push({ field: "platform", reason: "unknown_value" });

    expect(error.fields).toEqual([{ field: "text", reason: "too_long" }]);
  });
});
