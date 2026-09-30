import {
  createExecutionSnapshot,
  ExecutionSnapshot,
  ExecutionSnapshotError,
} from "./ExecutionSnapshot.js";
import {
  createIntermediateResult,
  IntermediateResult,
  IntermediateResultError,
} from "./IntermediateResult.js";
import { ModuleRef } from "./ModuleProgress.js";
import { ValidationIssue } from "../validation/ValidationResult.js";
import {
  InitialCatalogSource,
  validateInitialCatalogSource,
} from "./InitialCatalogSourceContract.js";
import {
  InitialSolarPanelSelectionPolicySource,
  validateInitialSolarPanelSelectionPolicySource,
} from "./InitialSolarPanelSelectionPolicySource.js";
import {
  InitialSolarSizingInputs,
  validateInitialSolarSizingInputs,
} from "./InitialSolarSizingInputsContract.js";
import {
  InitialBatterySizingInputs,
  validateInitialBatterySizingInputs,
} from "./InitialBatterySizingInputsContract.js";
import type { EnergyToBatteryPreparationContext } from "./EnergyToBatteryPreparationContract.js";
import type { BatterySizingCompositionContext } from "./BatterySizingCompositionContract.js";

export type ModuleExecutionResultStatus =
  | "COMPLETED"
  | "BLOCKED"
  | "FAILED";

export const MODULE_EXECUTION_RESULT_STATUSES: readonly ModuleExecutionResultStatus[] =
  Object.freeze(["COMPLETED", "BLOCKED", "FAILED"]);

export interface ModuleExecutorInput {
  readonly executionSnapshot: ExecutionSnapshot;
  readonly moduleRef: ModuleRef;
  readonly dependencyResults: readonly IntermediateResult[];
  readonly reusedDependencyResultRefs?: readonly string[];
  readonly initialCatalogSource?: Readonly<InitialCatalogSource>;
  readonly initialSolarPanelSelectionPolicySource?: Readonly<InitialSolarPanelSelectionPolicySource>;
  readonly initialSolarSizingInputs?: Readonly<InitialSolarSizingInputs>;
  readonly initialBatterySizingInputs?: Readonly<InitialBatterySizingInputs>;
  readonly initialEnergyToBatteryPreparationInput?: Readonly<EnergyToBatteryPreparationContext>;
  readonly initialBatterySizingCompositionInput?: Readonly<BatterySizingCompositionContext>;
}

export interface CompletedModuleExecutionResult {
  readonly status: "COMPLETED";
  readonly intermediateResults: readonly IntermediateResult[];
}

export interface BlockedModuleExecutionResult {
  readonly status: "BLOCKED";
  readonly blockingIssues: readonly ValidationIssue[];
}

export interface FailedModuleExecutionResult {
  readonly status: "FAILED";
  readonly errorMessage: string;
}

export type ModuleExecutionResult =
  | CompletedModuleExecutionResult
  | BlockedModuleExecutionResult
  | FailedModuleExecutionResult;

export interface ModuleExecutor {
  execute(
    input: Readonly<ModuleExecutorInput>,
  ): Promise<Readonly<ModuleExecutionResult>>;
}

export class ModuleExecutorError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ModuleExecutorError";
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function isValidationIssue(value: unknown): value is ValidationIssue {
  if (!isPlainRecord(value)) {
    return false;
  }

  return (
    isNonEmptyString(value.code) &&
    isNonEmptyString(value.message) &&
    isNonEmptyString(value.path)
  );
}

export function isModuleExecutionResultStatus(
  value: unknown,
): value is ModuleExecutionResultStatus {
  return (
    typeof value === "string" &&
    MODULE_EXECUTION_RESULT_STATUSES.includes(
      value as ModuleExecutionResultStatus,
    )
  );
}

export function requireModuleExecutionResultStatus(
  value: unknown,
): ModuleExecutionResultStatus {
  if (!isModuleExecutionResultStatus(value)) {
    throw new ModuleExecutorError(
      `module execution result status is not supported: ${String(value)}`,
    );
  }

  return value;
}

function validateExecutionSnapshotInput(
  value: unknown,
): Readonly<ExecutionSnapshot> {
  if (!isPlainRecord(value)) {
    throw new ModuleExecutorError("executionSnapshot is required");
  }

  try {
    return createExecutionSnapshot(value as unknown as ExecutionSnapshot);
  } catch (error) {
    if (error instanceof ExecutionSnapshotError) {
      throw new ModuleExecutorError(error.message);
    }

    throw error;
  }
}

function validateReusedDependencyResultRefs(
  value: unknown,
): readonly string[] {
  if (value === undefined) {
    return Object.freeze([]);
  }

  if (!Array.isArray(value)) {
    throw new ModuleExecutorError(
      "reusedDependencyResultRefs must be an array",
    );
  }

  if (value.some((ref) => !isNonEmptyString(ref))) {
    throw new ModuleExecutorError(
      "reusedDependencyResultRefs must contain non-empty references",
    );
  }

  if (hasDuplicates(value)) {
    throw new ModuleExecutorError(
      "reusedDependencyResultRefs must not contain duplicates",
    );
  }

  return Object.freeze([...value]);
}

function validateIntermediateResults(
  value: unknown,
  executionId: string,
  fieldName: string,
  reusedDependencyResultRefs: readonly string[] = [],
): readonly IntermediateResult[] {
  if (!Array.isArray(value)) {
    throw new ModuleExecutorError(`${fieldName} must be an array`);
  }

  const results = value.map((result) => {
    try {
      return createIntermediateResult(result as IntermediateResult);
    } catch (error) {
      if (error instanceof IntermediateResultError) {
        throw new ModuleExecutorError(error.message);
      }

      throw error;
    }
  });

  const reusedRefSet = new Set(reusedDependencyResultRefs);

  for (const result of results) {
    if (result.executionId === executionId) {
      continue;
    }

    if (!reusedRefSet.has(result.value.identity.path)) {
      throw new ModuleExecutorError(
        `${fieldName} must belong to executionSnapshot.identity.executionId unless explicitly authorized as reused`,
      );
    }
  }

  for (const reusedRef of reusedDependencyResultRefs) {
    const matchingResult = results.find(
      (result) => result.value.identity.path === reusedRef,
    );

    if (matchingResult === undefined) {
      throw new ModuleExecutorError(
        "reusedDependencyResultRefs must reference provided dependencyResults",
      );
    }

    if (matchingResult.executionId === executionId) {
      throw new ModuleExecutorError(
        "reusedDependencyResultRefs must reference results from a different execution",
      );
    }
  }

  const resultRefs = results.map((result) => result.value.identity.path);

  if (hasDuplicates(resultRefs)) {
    throw new ModuleExecutorError(
      `${fieldName} must not contain duplicate result references`,
    );
  }

  return Object.freeze([...results]);
}

function validateBlockingIssues(
  value: unknown,
): readonly ValidationIssue[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ModuleExecutorError(
      "blockingIssues must be a non-empty array",
    );
  }

  if (value.some((issue) => !isValidationIssue(issue))) {
    throw new ModuleExecutorError(
      "blockingIssues must contain valid issues",
    );
  }

  return Object.freeze(
    value.map((issue) => Object.freeze({ ...issue })),
  );
}

export function createModuleExecutorInput(
  input: ModuleExecutorInput,
): Readonly<ModuleExecutorInput> {
  const executionSnapshot = validateExecutionSnapshotInput(
    input.executionSnapshot,
  );

  if (!isNonEmptyString(input.moduleRef)) {
    throw new ModuleExecutorError("moduleRef is required");
  }

  const reusedDependencyResultRefs =
    validateReusedDependencyResultRefs(
      input.reusedDependencyResultRefs,
    );

  const initialCatalogSource =
    input.initialCatalogSource === undefined
      ? undefined
      : validateInitialCatalogSource(input.initialCatalogSource);
  const initialSolarPanelSelectionPolicySource =
    input.initialSolarPanelSelectionPolicySource === undefined
      ? undefined
      : validateInitialSolarPanelSelectionPolicySource(
          input.initialSolarPanelSelectionPolicySource,
        );
  const initialSolarSizingInputs =
    input.initialSolarSizingInputs === undefined
      ? undefined
      : validateInitialSolarSizingInputs(input.initialSolarSizingInputs);
  const initialBatterySizingInputs =
    input.initialBatterySizingInputs === undefined
      ? undefined
      : validateInitialBatterySizingInputs(input.initialBatterySizingInputs);

  const dependencyResults = validateIntermediateResults(
    input.dependencyResults,
    executionSnapshot.identity.executionId,
    "dependencyResults",
    reusedDependencyResultRefs,
  );

  return Object.freeze({
    executionSnapshot,
    moduleRef: input.moduleRef,
    dependencyResults,
    ...(initialCatalogSource === undefined ? {} : { initialCatalogSource }),
    ...(initialSolarPanelSelectionPolicySource === undefined
      ? {}
      : { initialSolarPanelSelectionPolicySource }),
    ...(initialSolarSizingInputs === undefined
      ? {}
      : { initialSolarSizingInputs }),
    ...(initialBatterySizingInputs === undefined
      ? {}
      : { initialBatterySizingInputs }),
    ...(input.initialEnergyToBatteryPreparationInput === undefined
      ? {}
      : {
          initialEnergyToBatteryPreparationInput:
            input.initialEnergyToBatteryPreparationInput,
        }),
    ...(input.initialBatterySizingCompositionInput === undefined
      ? {}
      : {
          initialBatterySizingCompositionInput:
            input.initialBatterySizingCompositionInput,
        }),
    ...(reusedDependencyResultRefs.length === 0
      ? {}
      : { reusedDependencyResultRefs }),
  });
}

export function createModuleExecutionResult(
  input: CompletedModuleExecutionResult,
  executionSnapshot: ExecutionSnapshot,
): Readonly<CompletedModuleExecutionResult>;

export function createModuleExecutionResult(
  input: BlockedModuleExecutionResult,
  executionSnapshot: ExecutionSnapshot,
): Readonly<BlockedModuleExecutionResult>;

export function createModuleExecutionResult(
  input: FailedModuleExecutionResult,
  executionSnapshot: ExecutionSnapshot,
): Readonly<FailedModuleExecutionResult>;

export function createModuleExecutionResult(
  input: ModuleExecutionResult,
  executionSnapshot: ExecutionSnapshot,
): Readonly<ModuleExecutionResult> {
  const snapshot =
    validateExecutionSnapshotInput(executionSnapshot);

  const status = requireModuleExecutionResultStatus(
    input?.status,
  );

  if (status === "COMPLETED") {
    const intermediateResults =
      validateIntermediateResults(
        (input as CompletedModuleExecutionResult)
          .intermediateResults,
        snapshot.identity.executionId,
        "intermediateResults",
      );

    return Object.freeze({
      status,
      intermediateResults,
    });
  }

  if (status === "BLOCKED") {
    const blockingIssues = validateBlockingIssues(
      (input as BlockedModuleExecutionResult).blockingIssues,
    );

    return Object.freeze({
      status,
      blockingIssues,
    });
  }

  const errorMessage =
    (input as FailedModuleExecutionResult).errorMessage;

  if (!isNonEmptyString(errorMessage)) {
    throw new ModuleExecutorError("errorMessage is required");
  }

  return Object.freeze({
    status,
    errorMessage,
  });
}