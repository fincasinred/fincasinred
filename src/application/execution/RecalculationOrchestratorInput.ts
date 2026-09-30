import {
  createExecutionPlan,
  ExecutionPlan,
  ExecutionPlanError,
} from "./ExecutionPlan.js";
import {
  createExecutionSnapshot,
  ExecutionSnapshot,
  ExecutionSnapshotError,
} from "./ExecutionSnapshot.js";
import {
  createReusableIntermediateResult,
  ReusableIntermediateResult,
  ReusableIntermediateResultError,
} from "./ReusableIntermediateResult.js";
import { ModuleRef } from "./ModuleProgress.js";

export interface RecalculationOrchestratorInput {
  readonly mode: "RECALCULATION";
  readonly executionPlan: ExecutionPlan;
  readonly executionSnapshot: ExecutionSnapshot;
  readonly previousExecutionId: string;
  readonly modulesToRecalculate: readonly ModuleRef[];
  readonly reusableIntermediateResults: readonly ReusableIntermediateResult[];
}

export class RecalculationOrchestratorInputError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "RecalculationOrchestratorInputError";
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function validateExecutionPlan(
  value: unknown,
): Readonly<ExecutionPlan> {
  if (!isPlainRecord(value)) {
    throw new RecalculationOrchestratorInputError(
      "executionPlan is required",
    );
  }

  try {
    return createExecutionPlan(
      value as unknown as ExecutionPlan,
    );
  } catch (error) {
    if (error instanceof ExecutionPlanError) {
      throw new RecalculationOrchestratorInputError(
        error.message,
      );
    }

    throw error;
  }
}

function validateExecutionSnapshot(
  value: unknown,
): Readonly<ExecutionSnapshot> {
  if (!isPlainRecord(value)) {
    throw new RecalculationOrchestratorInputError(
      "executionSnapshot is required",
    );
  }

  try {
    return createExecutionSnapshot(
      value as unknown as ExecutionSnapshot,
    );
  } catch (error) {
    if (error instanceof ExecutionSnapshotError) {
      throw new RecalculationOrchestratorInputError(
        error.message,
      );
    }

    throw error;
  }
}

function validateExecutionId(
  value: unknown,
  fieldName: string,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new RecalculationOrchestratorInputError(
      `${fieldName} must be a non-empty string`,
    );
  }

  return value;
}

function validateModuleRefs(
  value: unknown,
  fieldName: string,
  executionPlan: Readonly<ExecutionPlan>,
): readonly ModuleRef[] {
  if (!Array.isArray(value)) {
    throw new RecalculationOrchestratorInputError(
      `${fieldName} must be an array`,
    );
  }

  if (
    value.some(
      (moduleRef) =>
        typeof moduleRef !== "string" ||
        moduleRef.trim().length === 0,
    )
  ) {
    throw new RecalculationOrchestratorInputError(
      `${fieldName} must contain non-empty module references`,
    );
  }

  if (new Set(value).size !== value.length) {
    throw new RecalculationOrchestratorInputError(
      `${fieldName} must not contain duplicates`,
    );
  }

  const planModuleRefs = new Set(
    executionPlan.moduleRefs,
  );

  for (const moduleRef of value) {
    if (!planModuleRefs.has(moduleRef)) {
      throw new RecalculationOrchestratorInputError(
        `${fieldName} must contain only modules declared by executionPlan.moduleRefs`,
      );
    }
  }

  return Object.freeze([...value]);
}

function validateReusableIntermediateResults(
  value: unknown,
  previousExecutionId: string,
  executionId: string,
  executionPlan: Readonly<ExecutionPlan>,
  modulesToRecalculate: readonly ModuleRef[],
): readonly ReusableIntermediateResult[] {
  if (!Array.isArray(value)) {
    throw new RecalculationOrchestratorInputError(
      "reusableIntermediateResults must be an array",
    );
  }

  const reusableResults: ReusableIntermediateResult[] = [];
  const resultKeys = new Set<string>();
  const reusableModuleRefs = new Set<string>();
  const planModuleRefs = new Set(
    executionPlan.moduleRefs,
  );
  const recalculationModuleRefs = new Set(
    modulesToRecalculate,
  );

  for (const reusableInput of value) {
    if (!isPlainRecord(reusableInput)) {
      throw new RecalculationOrchestratorInputError(
        "reusableIntermediateResults must contain valid objects",
      );
    }

    try {
      const reusableResult =
        createReusableIntermediateResult(
          reusableInput as unknown as ReusableIntermediateResult,
        );

      if (
        reusableResult.sourceExecutionId !==
        previousExecutionId
      ) {
        throw new RecalculationOrchestratorInputError(
          "all reusableIntermediateResults must belong to previousExecutionId",
        );
      }

      if (
        reusableResult.intermediateResult.executionId ===
        executionId
      ) {
        throw new RecalculationOrchestratorInputError(
          "reusableIntermediateResults must not belong to the new execution",
        );
      }

      if (
        !planModuleRefs.has(
          reusableResult.moduleRef,
        )
      ) {
        throw new RecalculationOrchestratorInputError(
          "reusableIntermediateResults.moduleRef must belong to executionPlan.moduleRefs",
        );
      }

      if (
        recalculationModuleRefs.has(
          reusableResult.moduleRef,
        )
      ) {
        throw new RecalculationOrchestratorInputError(
          "a module cannot be both reusable and scheduled for recalculation",
        );
      }

      if (
        reusableModuleRefs.has(
          reusableResult.moduleRef,
        )
      ) {
        throw new RecalculationOrchestratorInputError(
          "reusableIntermediateResults must not contain duplicate moduleRef values",
        );
      }

      const resultKey =
        reusableResult.intermediateResult.value.identity.path;

      if (resultKeys.has(resultKey)) {
        throw new RecalculationOrchestratorInputError(
          "reusableIntermediateResults must not contain duplicate result identities",
        );
      }

      reusableModuleRefs.add(
        reusableResult.moduleRef,
      );

      resultKeys.add(resultKey);
      reusableResults.push(
        reusableResult,
      );
    } catch (error) {
      if (
        error instanceof
        RecalculationOrchestratorInputError
      ) {
        throw error;
      }

      if (
        error instanceof
        ReusableIntermediateResultError
      ) {
        throw new RecalculationOrchestratorInputError(
          error.message,
        );
      }

      throw error;
    }
  }

  return Object.freeze(
    reusableResults,
  );
}

export function createRecalculationOrchestratorInput(
  input: RecalculationOrchestratorInput,
): Readonly<RecalculationOrchestratorInput> {
  if (!isPlainRecord(input)) {
    throw new RecalculationOrchestratorInputError(
      "input must be an object",
    );
  }

  const executionPlan =
    validateExecutionPlan(input.executionPlan);

  const executionSnapshot =
    validateExecutionSnapshot(
      input.executionSnapshot,
    );

  const executionId =
    executionSnapshot.identity.executionId;

  const previousExecutionId =
    validateExecutionId(
      input.previousExecutionId,
      "previousExecutionId",
    );

  if (previousExecutionId === executionId) {
    throw new RecalculationOrchestratorInputError(
      "previousExecutionId must differ from executionSnapshot.identity.executionId",
    );
  }

  const modulesToRecalculate =
    validateModuleRefs(
      input.modulesToRecalculate,
      "modulesToRecalculate",
      executionPlan,
    );

  const reusableIntermediateResults =
  validateReusableIntermediateResults(
    input.reusableIntermediateResults,
    previousExecutionId,
    executionId,
    executionPlan,
    modulesToRecalculate,
  );

  return Object.freeze({
  mode: "RECALCULATION" as const,
  executionPlan,
  executionSnapshot,
  previousExecutionId,
  modulesToRecalculate,
  reusableIntermediateResults,
});
}