import { ValidationIssue } from "../validation/ValidationResult.js";

export type ModuleRef = string;

export type ModuleExecutionStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "BLOCKED";

export const MODULE_EXECUTION_STATUSES: readonly ModuleExecutionStatus[] = Object.freeze([
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "BLOCKED",
]);

export interface ModuleProgress {
  readonly executionId: string;
  readonly moduleRef: ModuleRef;
  readonly status: ModuleExecutionStatus;
  readonly intermediateResultRefs?: readonly string[];
  readonly blockingIssues?: readonly ValidationIssue[];
}

export class ModuleProgressError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ModuleProgressError";
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function isValidationIssue(value: unknown): value is ValidationIssue {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const issue = value as Partial<ValidationIssue>;
  return (
    isNonEmptyString(issue.code) &&
    isNonEmptyString(issue.message) &&
    isNonEmptyString(issue.path)
  );
}

export function isModuleExecutionStatus(
  value: unknown,
): value is ModuleExecutionStatus {
  return (
    typeof value === "string" &&
    MODULE_EXECUTION_STATUSES.includes(value as ModuleExecutionStatus)
  );
}

export function requireModuleExecutionStatus(
  value: unknown,
): ModuleExecutionStatus {
  if (!isModuleExecutionStatus(value)) {
    throw new ModuleProgressError(
      `module execution status is not supported: ${String(value)}`,
    );
  }

  return value;
}

function validateIntermediateResultRefs(
  refs: unknown,
): readonly string[] | undefined {
  if (refs === undefined) {
    return undefined;
  }

  if (!Array.isArray(refs)) {
    throw new ModuleProgressError("intermediateResultRefs must be an array");
  }

  if (refs.some((ref) => !isNonEmptyString(ref))) {
    throw new ModuleProgressError(
      "intermediateResultRefs must contain non-empty references",
    );
  }

  if (hasDuplicates(refs)) {
    throw new ModuleProgressError(
      "intermediateResultRefs must not contain duplicates",
    );
  }

  return Object.freeze([...refs]);
}

function validateBlockingIssues(
  issues: unknown,
  status: ModuleExecutionStatus,
): readonly ValidationIssue[] | undefined {
  if (issues === undefined) {
    if (status === "BLOCKED") {
      throw new ModuleProgressError(
        "a BLOCKED module requires at least one blocking issue",
      );
    }
    return undefined;
  }

  if (status !== "BLOCKED") {
    throw new ModuleProgressError(
      "blockingIssues are only allowed for a BLOCKED module",
    );
  }

  if (!Array.isArray(issues) || issues.length === 0) {
    throw new ModuleProgressError(
      "blockingIssues must be a non-empty array",
    );
  }

  if (issues.some((issue) => !isValidationIssue(issue))) {
    throw new ModuleProgressError("blockingIssues must contain valid issues");
  }

  return Object.freeze(
    issues.map((issue) => Object.freeze({ ...issue })),
  );
}

export function createModuleProgress(
  input: ModuleProgress,
): Readonly<ModuleProgress> {
  if (!isNonEmptyString(input.executionId)) {
    throw new ModuleProgressError("executionId is required");
  }

  if (!isNonEmptyString(input.moduleRef)) {
    throw new ModuleProgressError("moduleRef is required");
  }

  const status = requireModuleExecutionStatus(input.status);
  const intermediateResultRefs = validateIntermediateResultRefs(
    input.intermediateResultRefs,
  );
  const blockingIssues = validateBlockingIssues(input.blockingIssues, status);

  return Object.freeze({
    executionId: input.executionId,
    moduleRef: input.moduleRef,
    status,
    ...(intermediateResultRefs === undefined
      ? {}
      : { intermediateResultRefs }),
    ...(blockingIssues === undefined ? {} : { blockingIssues }),
  });
}
