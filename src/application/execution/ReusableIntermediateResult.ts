import {
  createIntermediateResult,
  IntermediateResult,
} from "./IntermediateResult.js";
import { ModuleRef } from "./ModuleProgress.js";
import { ValidationStatus } from "../../domain/shared/ValidationStatus.js";

export interface ReusableIntermediateResult {
  readonly sourceExecutionId: string;
  readonly moduleRef: ModuleRef;
  readonly intermediateResult: IntermediateResult;
}

export class ReusableIntermediateResultError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ReusableIntermediateResultError";
  }
}

function validateExecutionId(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new ReusableIntermediateResultError(
      "sourceExecutionId must be a non-empty string",
    );
  }

  return value;
}

function validateModuleRef(value: unknown): ModuleRef {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new ReusableIntermediateResultError(
      "moduleRef must be a non-empty string",
    );
  }

  return value;
}

function validateIntermediateResult(
  value: unknown,
): IntermediateResult {
  if (
    value === null ||
    typeof value !== "object"
  ) {
    throw new ReusableIntermediateResultError(
      "intermediateResult must be an object",
    );
  }

  try {
    return createIntermediateResult(
      value as IntermediateResult,
    );
  } catch (error) {
    throw new ReusableIntermediateResultError(
      error instanceof Error
        ? error.message
        : String(error),
    );
  }
}

function validateReusableStatus(
  value: IntermediateResult,
): IntermediateResult {
  if (
    value.value.status !== ValidationStatus.VALIDATED &&
    value.value.status !== ValidationStatus.PROVISIONAL
  ) {
    throw new ReusableIntermediateResultError(
      "intermediateResult.value.status is not reusable",
    );
  }

  return value;
}

export function createReusableIntermediateResult(
  input: ReusableIntermediateResult,
): Readonly<ReusableIntermediateResult> {
  if (
    input === null ||
    typeof input !== "object"
  ) {
    throw new ReusableIntermediateResultError(
      "input must be an object",
    );
  }

  const sourceExecutionId =
    validateExecutionId(
      input.sourceExecutionId,
    );

  const moduleRef = validateModuleRef(
    input.moduleRef,
  );

  const intermediateResult = validateReusableStatus(
    validateIntermediateResult(input.intermediateResult),
  );

  if (
    intermediateResult.executionId !==
    sourceExecutionId
  ) {
    throw new ReusableIntermediateResultError(
      "sourceExecutionId must match intermediateResult.executionId",
    );
  }

  return Object.freeze({
    sourceExecutionId,
    moduleRef,
    intermediateResult,
  });
}