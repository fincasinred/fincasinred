import {
  createCheckpoint,
  Checkpoint,
  CheckpointError,
} from "./Checkpoint.js";
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
  createModuleProgress,
  ModuleProgress,
  ModuleProgressError,
  ModuleRef,
} from "./ModuleProgress.js";
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

export type OrchestratorInputMode = "FULL" | "PARTIAL" | "RECOVERY";

export const ORCHESTRATOR_INPUT_MODES: readonly OrchestratorInputMode[] =
  Object.freeze(["FULL", "PARTIAL", "RECOVERY"]);

export interface FullOrchestratorInput {
  readonly mode: "FULL";
  readonly executionPlan: ExecutionPlan;
  readonly executionSnapshot: ExecutionSnapshot;
  readonly initialCatalogSource?: Readonly<InitialCatalogSource>;
  readonly initialSolarPanelSelectionPolicySource?: Readonly<InitialSolarPanelSelectionPolicySource>;
  readonly initialSolarSizingInputs?: Readonly<InitialSolarSizingInputs>;
  readonly initialBatterySizingInputs?: Readonly<InitialBatterySizingInputs>;
  readonly initialEnergyToBatteryPreparationInput?: Readonly<EnergyToBatteryPreparationContext>;
  readonly initialBatterySizingCompositionInput?: Readonly<BatterySizingCompositionContext>;
}

export interface PartialOrchestratorInput {
  readonly mode: "PARTIAL";
  readonly executionPlan: ExecutionPlan;
  readonly executionSnapshot: ExecutionSnapshot;
  readonly selectedModuleRefs: readonly ModuleRef[];
  readonly initialCatalogSource?: Readonly<InitialCatalogSource>;
  readonly initialSolarPanelSelectionPolicySource?: Readonly<InitialSolarPanelSelectionPolicySource>;
  readonly initialSolarSizingInputs?: Readonly<InitialSolarSizingInputs>;
  readonly initialBatterySizingInputs?: Readonly<InitialBatterySizingInputs>;
  readonly initialEnergyToBatteryPreparationInput?: Readonly<EnergyToBatteryPreparationContext>;
  readonly initialBatterySizingCompositionInput?: Readonly<BatterySizingCompositionContext>;
}

export interface RecoveryOrchestratorInput {
  readonly mode: "RECOVERY";
  readonly executionPlan: ExecutionPlan;
  readonly executionSnapshot: ExecutionSnapshot;
  readonly checkpoint: Checkpoint;
  readonly moduleProgressByRef: Readonly<Record<string, ModuleProgress>>;
}

export type OrchestratorInput =
  | FullOrchestratorInput
  | PartialOrchestratorInput
  | RecoveryOrchestratorInput;

export class OrchestratorInputError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "OrchestratorInputError";
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

export function isOrchestratorInputMode(
  value: unknown,
): value is OrchestratorInputMode {
  return (
    typeof value === "string" &&
    ORCHESTRATOR_INPUT_MODES.includes(value as OrchestratorInputMode)
  );
}

export function requireOrchestratorInputMode(
  value: unknown,
): OrchestratorInputMode {
  if (!isOrchestratorInputMode(value)) {
    throw new OrchestratorInputError(
      `orchestrator input mode is not supported: ${String(value)}`,
    );
  }

  return value;
}

function validateExecutionPlanInput(value: unknown): Readonly<ExecutionPlan> {
  if (!isPlainRecord(value)) {
    throw new OrchestratorInputError("executionPlan is required");
  }

  try {
    return createExecutionPlan(value as unknown as ExecutionPlan);
  } catch (error) {
    if (error instanceof ExecutionPlanError) {
      throw new OrchestratorInputError(error.message);
    }

    throw error;
  }
}

function validateExecutionSnapshotInput(
  value: unknown,
): Readonly<ExecutionSnapshot> {
  if (!isPlainRecord(value)) {
    throw new OrchestratorInputError("executionSnapshot is required");
  }

  try {
    return createExecutionSnapshot(value as unknown as ExecutionSnapshot);
  } catch (error) {
    if (error instanceof ExecutionSnapshotError) {
      throw new OrchestratorInputError(error.message);
    }

    throw error;
  }
}

function validateSelectedModuleRefs(
  selectedModuleRefs: unknown,
  executionPlan: Readonly<ExecutionPlan>,
): readonly ModuleRef[] {
  if (!Array.isArray(selectedModuleRefs) || selectedModuleRefs.length === 0) {
    throw new OrchestratorInputError(
      "selectedModuleRefs must be a non-empty array",
    );
  }

  if (selectedModuleRefs.some((moduleRef) => !isNonEmptyString(moduleRef))) {
    throw new OrchestratorInputError(
      "selectedModuleRefs must contain non-empty module references",
    );
  }

  if (hasDuplicates(selectedModuleRefs)) {
    throw new OrchestratorInputError(
      "selectedModuleRefs must not contain duplicates",
    );
  }

  const moduleRefSet = new Set(executionPlan.moduleRefs);
  for (const moduleRef of selectedModuleRefs) {
    if (!moduleRefSet.has(moduleRef)) {
      throw new OrchestratorInputError(
        "selectedModuleRefs must belong to executionPlan.moduleRefs",
      );
    }
  }

  return Object.freeze([...selectedModuleRefs]);
}

function validateCheckpointInput(value: unknown): Readonly<Checkpoint> {
  if (!isPlainRecord(value)) {
    throw new OrchestratorInputError("checkpoint is required");
  }

  try {
    return createCheckpoint(value as unknown as Checkpoint);
  } catch (error) {
    if (error instanceof CheckpointError) {
      throw new OrchestratorInputError(error.message);
    }

    throw error;
  }
}

function validateModuleProgressByRef(
  value: unknown,
  checkpoint: Readonly<Checkpoint>,
  executionSnapshot: Readonly<ExecutionSnapshot>,
): Readonly<Record<string, ModuleProgress>> {
  if (!isPlainRecord(value)) {
    throw new OrchestratorInputError("moduleProgressByRef is required");
  }

  if (checkpoint.executionId !== executionSnapshot.identity.executionId) {
    throw new OrchestratorInputError(
      "checkpoint.executionId must match executionSnapshot.identity.executionId",
    );
  }

  const providedRefs = Object.keys(value);
  const checkpointRefSet = new Set(checkpoint.moduleProgressRefs);

  for (const moduleProgressRef of checkpoint.moduleProgressRefs) {
    if (!Object.hasOwn(value, moduleProgressRef)) {
      throw new OrchestratorInputError(
        "each checkpoint.moduleProgressRef must have a corresponding ModuleProgress",
      );
    }
  }

  for (const moduleProgressRef of providedRefs) {
    if (!checkpointRefSet.has(moduleProgressRef)) {
      throw new OrchestratorInputError(
        "moduleProgressByRef must only contain refs declared by checkpoint",
      );
    }
  }

  const moduleProgressByRef: Record<string, ModuleProgress> = {};
  const moduleRefs: string[] = [];

  for (const moduleProgressRef of checkpoint.moduleProgressRefs) {
    const moduleProgressInput = value[moduleProgressRef];

    try {
      const moduleProgress = createModuleProgress(
        moduleProgressInput as ModuleProgress,
      );

      if (moduleProgress.executionId !== checkpoint.executionId) {
        throw new OrchestratorInputError(
          "all recovery ModuleProgress entries must share checkpoint.executionId",
        );
      }

      moduleRefs.push(moduleProgress.moduleRef);
      moduleProgressByRef[moduleProgressRef] = moduleProgress;
    } catch (error) {
      if (error instanceof ModuleProgressError) {
        throw new OrchestratorInputError(error.message);
      }

      throw error;
    }
  }

  if (hasDuplicates(moduleRefs)) {
    throw new OrchestratorInputError(
      "moduleProgressByRef must not contain duplicate moduleRef values",
    );
  }

  return Object.freeze({ ...moduleProgressByRef });
}

export function createOrchestratorInput(
  input: FullOrchestratorInput,
): Readonly<FullOrchestratorInput>;
export function createOrchestratorInput(
  input: PartialOrchestratorInput,
): Readonly<PartialOrchestratorInput>;
export function createOrchestratorInput(
  input: RecoveryOrchestratorInput,
): Readonly<RecoveryOrchestratorInput>;
export function createOrchestratorInput(
  input: OrchestratorInput,
): Readonly<OrchestratorInput> {
  const mode = requireOrchestratorInputMode(input?.mode);
  const executionPlan = validateExecutionPlanInput(input.executionPlan);
  const executionSnapshot = validateExecutionSnapshotInput(
    input.executionSnapshot,
  );
  const providedInitialCatalogSource =
    mode === "RECOVERY"
      ? undefined
      : (input as FullOrchestratorInput | PartialOrchestratorInput)
          .initialCatalogSource;
  const initialCatalogSource =
    providedInitialCatalogSource === undefined
      ? undefined
      : validateInitialCatalogSource(providedInitialCatalogSource);
  const providedInitialSolarPanelSelectionPolicySource =
    mode === "RECOVERY"
      ? undefined
      : (input as FullOrchestratorInput | PartialOrchestratorInput)
          .initialSolarPanelSelectionPolicySource;
  const initialSolarPanelSelectionPolicySource =
    providedInitialSolarPanelSelectionPolicySource === undefined
      ? undefined
      : validateInitialSolarPanelSelectionPolicySource(
          providedInitialSolarPanelSelectionPolicySource,
        );
  const providedInitialSolarSizingInputs =
    mode === "RECOVERY"
      ? undefined
      : (input as FullOrchestratorInput | PartialOrchestratorInput)
          .initialSolarSizingInputs;
  const initialSolarSizingInputs =
    providedInitialSolarSizingInputs === undefined
      ? undefined
      : validateInitialSolarSizingInputs(providedInitialSolarSizingInputs);
  const providedInitialBatterySizingInputs =
    mode === "RECOVERY"
      ? undefined
      : (input as FullOrchestratorInput | PartialOrchestratorInput)
          .initialBatterySizingInputs;
  const initialBatterySizingInputs =
    providedInitialBatterySizingInputs === undefined
      ? undefined
      : validateInitialBatterySizingInputs(providedInitialBatterySizingInputs);
  const initialEnergyToBatteryPreparationInput =
    mode === "RECOVERY"
      ? undefined
      : (input as FullOrchestratorInput | PartialOrchestratorInput)
          .initialEnergyToBatteryPreparationInput;
  const initialBatterySizingCompositionInput =
    mode === "RECOVERY"
      ? undefined
      : (input as FullOrchestratorInput | PartialOrchestratorInput)
          .initialBatterySizingCompositionInput;

  if (mode === "FULL") {
    return Object.freeze({
      mode,
      executionPlan,
      executionSnapshot,
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
      ...(initialEnergyToBatteryPreparationInput === undefined
        ? {}
        : { initialEnergyToBatteryPreparationInput }),
      ...(initialBatterySizingCompositionInput === undefined
        ? {}
        : { initialBatterySizingCompositionInput }),
    });
  }

  if (mode === "PARTIAL") {
    const selectedModuleRefs = validateSelectedModuleRefs(
      (input as PartialOrchestratorInput).selectedModuleRefs,
      executionPlan,
    );

    return Object.freeze({
      mode,
      executionPlan,
      executionSnapshot,
      selectedModuleRefs,
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
      ...(initialEnergyToBatteryPreparationInput === undefined
        ? {}
        : { initialEnergyToBatteryPreparationInput }),
      ...(initialBatterySizingCompositionInput === undefined
        ? {}
        : { initialBatterySizingCompositionInput }),
    });
  }

  const checkpoint = validateCheckpointInput(
    (input as RecoveryOrchestratorInput).checkpoint,
  );
  const moduleProgressByRef = validateModuleProgressByRef(
    (input as RecoveryOrchestratorInput).moduleProgressByRef,
    checkpoint,
    executionSnapshot,
  );

  return Object.freeze({
    mode,
    executionPlan,
    executionSnapshot,
    checkpoint,
    moduleProgressByRef,
  });
}
