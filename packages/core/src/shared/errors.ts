/** Problems any module can raise; the API maps each code to an HTTP status (conventions §12.1). */
export const SHARED_PROBLEMS = [
  "NOT_FOUND",
  "FORBIDDEN",
  "VALIDATION_FAILED",
  "VERSION_CONFLICT",
  "CONFLICT",
] as const;

/** A problem code shared by every module. */
export type SharedProblem = (typeof SHARED_PROBLEMS)[number];

const SHARED_PROBLEM_MESSAGES: Record<SharedProblem, string> = {
  NOT_FOUND: "The requested item does not exist.",
  FORBIDDEN: "This action is not allowed.",
  VALIDATION_FAILED: "The input is not valid.",
  VERSION_CONFLICT: "The item changed since it was read.",
  CONFLICT: "The action conflicts with the current state.",
};

/** One invalid input field: `reason` is a snake_case reason code such as `too_long`. */
export interface FieldProblem {
  readonly field: string;
  readonly reason: string;
}

/** The requested item does not exist, or is not visible to the caller. */
export class NotFoundError extends Error {
  readonly problem = "NOT_FOUND" satisfies SharedProblem;
  constructor() {
    super(SHARED_PROBLEM_MESSAGES.NOT_FOUND);
    this.name = "NotFoundError";
  }
}

/** The caller is known but may not do this. */
export class ForbiddenError extends Error {
  readonly problem = "FORBIDDEN" satisfies SharedProblem;
  constructor() {
    super(SHARED_PROBLEM_MESSAGES.FORBIDDEN);
    this.name = "ForbiddenError";
  }
}

/** The input failed validation; `fields` lists each invalid field. */
export class ValidationError extends Error {
  readonly problem = "VALIDATION_FAILED" satisfies SharedProblem;
  readonly fields: readonly FieldProblem[];
  constructor(fields: readonly FieldProblem[] = []) {
    super(SHARED_PROBLEM_MESSAGES.VALIDATION_FAILED);
    this.name = "ValidationError";
    this.fields = [...fields];
  }
}

/** An edit was based on a stale version of the item (optimistic concurrency, conventions §10.2). */
export class VersionConflictError extends Error {
  readonly problem = "VERSION_CONFLICT" satisfies SharedProblem;
  constructor() {
    super(SHARED_PROBLEM_MESSAGES.VERSION_CONFLICT);
    this.name = "VersionConflictError";
  }
}

/** The action cannot happen in the item's current state, for example a duplicate. */
export class ConflictError extends Error {
  readonly problem = "CONFLICT" satisfies SharedProblem;
  constructor() {
    super(SHARED_PROBLEM_MESSAGES.CONFLICT);
    this.name = "ConflictError";
  }
}
