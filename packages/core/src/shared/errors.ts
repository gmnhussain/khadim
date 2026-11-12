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

/** Details any problem error can carry. */
export interface ProblemErrorOptions {
  /** The error this one wraps, for logs only (conventions §14). */
  readonly cause?: unknown;
}

/**
 * The base of every domain error: a problem code from a closed union, its message, and the
 * error it wraps when there is one. `cause` is set only when given, so an error without one has
 * no `cause` property at all (KP-07; findings #15, L13).
 */
export class ProblemError<TProblem extends string> extends Error {
  readonly problem: TProblem;
  constructor(problem: TProblem, message: string, options: ProblemErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.problem = problem;
  }
}

/** The requested item does not exist, or is not visible to the caller. */
export class NotFoundError extends ProblemError<"NOT_FOUND"> {
  constructor(options: ProblemErrorOptions = {}) {
    super("NOT_FOUND", SHARED_PROBLEM_MESSAGES.NOT_FOUND, options);
    this.name = "NotFoundError";
  }
}

/** The caller is known but may not do this. */
export class ForbiddenError extends ProblemError<"FORBIDDEN"> {
  constructor(options: ProblemErrorOptions = {}) {
    super("FORBIDDEN", SHARED_PROBLEM_MESSAGES.FORBIDDEN, options);
    this.name = "ForbiddenError";
  }
}

/** The input failed validation; `fields` lists each invalid field. */
export class ValidationError extends ProblemError<"VALIDATION_FAILED"> {
  readonly fields: readonly FieldProblem[];
  constructor(fields: readonly FieldProblem[] = [], options: ProblemErrorOptions = {}) {
    super("VALIDATION_FAILED", SHARED_PROBLEM_MESSAGES.VALIDATION_FAILED, options);
    this.name = "ValidationError";
    this.fields = [...fields];
  }
}

/** An edit was based on a stale version of the item (optimistic concurrency, conventions §10.2). */
export class VersionConflictError extends ProblemError<"VERSION_CONFLICT"> {
  constructor(options: ProblemErrorOptions = {}) {
    super("VERSION_CONFLICT", SHARED_PROBLEM_MESSAGES.VERSION_CONFLICT, options);
    this.name = "VersionConflictError";
  }
}

/** The action cannot happen in the item's current state, for example a duplicate. */
export class ConflictError extends ProblemError<"CONFLICT"> {
  constructor(options: ProblemErrorOptions = {}) {
    super("CONFLICT", SHARED_PROBLEM_MESSAGES.CONFLICT, options);
    this.name = "ConflictError";
  }
}
