import {
  createModuleExecutionResult,
  createModuleExecutorInput,
  CompletedModuleExecutionResult,
  FailedModuleExecutionResult,
  BlockedModuleExecutionResult,
  ModuleExecutionResult,
} from "./ModuleExecutor.js";
import {
  createModuleProgress,
  ModuleProgress,
  ModuleRef,
} from "./ModuleProgress.js";
import {
  createOrchestratorInput,
  OrchestratorInput,
} from "./OrchestratorInput.js";
import {
  createIntermediateResult,
  IntermediateResult,
} from "./IntermediateResult.js";
import {
  ExecutionState,
  requireExecutionState,
} from "./ExecutionState.js";
import { ExecutionPlan } from "./ExecutionPlan.js";
import {
  ModuleExecutorRegistry as ExecutorRegistry,
} from "./ModuleExecutorRegistry.js";
import {
  createRecalculationOrchestratorInput,
  RecalculationOrchestratorInput,
} from "./RecalculationOrchestratorInput.js";

export type OrchestratorExecutionInput =
  | OrchestratorInput
  | RecalculationOrchestratorInput;

export interface OrchestratorResult {
  readonly executionState: ExecutionState;
  readonly moduleProgressByRef: Readonly<Record<string, ModuleProgress>>;
  readonly intermediateResults: readonly IntermediateResult[];
}

export interface Orchestrator {
  execute(
    input: Readonly<OrchestratorExecutionInput>,
    registry: Readonly<ExecutorRegistry>,
  ): Promise<Readonly<OrchestratorResult>>;
}

export class OrchestratorError extends Error {
  public readonly moduleRef?: ModuleRef;

  public constructor(message: string, moduleRef?: ModuleRef) {
    super(message);
    this.name = "OrchestratorError";

    if (moduleRef !== undefined) {
      this.moduleRef = moduleRef;
    }
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

function isModuleExecutorRegistry(value: unknown): value is ExecutorRegistry {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { resolve?: unknown }).resolve === "function"
  );
}

function dependenciesByModule(
  executionPlan: Readonly<ExecutionPlan>,
): ReadonlyMap<ModuleRef, readonly ModuleRef[]> {
  const moduleIndex = new Map<ModuleRef, number>();

  executionPlan.moduleRefs.forEach((moduleRef, index) => {
    moduleIndex.set(moduleRef, index);
  });

  const dependenciesByRef = new Map<ModuleRef, ModuleRef[]>();

  executionPlan.moduleRefs.forEach((moduleRef) => {
    dependenciesByRef.set(moduleRef, []);
  });

  for (const dependency of executionPlan.dependencyGraph.dependencies) {
    dependenciesByRef
      .get(dependency.moduleRef)
      ?.push(dependency.dependsOnModuleRef);
  }

  for (const [moduleRef, dependencyRefs] of dependenciesByRef.entries()) {
    dependencyRefs.sort(
      (left, right) =>
        (moduleIndex.get(left) ?? Number.MAX_SAFE_INTEGER) -
        (moduleIndex.get(right) ?? Number.MAX_SAFE_INTEGER),
    );

    dependenciesByRef.set(moduleRef, dependencyRefs);
  }

  return dependenciesByRef;
}

function determineScopeModuleRefs(
  input: Readonly<OrchestratorExecutionInput>,
): readonly ModuleRef[] {
  if (input.mode === "PARTIAL") {
    return Object.freeze([...input.selectedModuleRefs]);
  }

  if (input.mode === "RECALCULATION") {
    return Object.freeze([...input.modulesToRecalculate]);
  }

  return Object.freeze([...input.executionPlan.moduleRefs]);
}

function initializeModuleProgressByRef(
  input: Readonly<OrchestratorExecutionInput>,
  scopeModuleRefs: readonly ModuleRef[],
): Map<ModuleRef, Readonly<ModuleProgress>> {
  const executionId = input.executionSnapshot.identity.executionId;
  const progressByRef = new Map<ModuleRef, Readonly<ModuleProgress>>();

  if (input.mode === "RECOVERY") {
    const restoredProgressByModuleRef = new Map<
      ModuleRef,
      Readonly<ModuleProgress>
    >();

    const allowedModuleRefSet = new Set(input.executionPlan.moduleRefs);

    for (const moduleProgress of Object.values(input.moduleProgressByRef)) {
      if (!allowedModuleRefSet.has(moduleProgress.moduleRef)) {
        throw new OrchestratorError(
          "recovery ModuleProgress.moduleRef must belong to executionPlan.moduleRefs",
          moduleProgress.moduleRef,
        );
      }

      restoredProgressByModuleRef.set(moduleProgress.moduleRef, moduleProgress);
    }

    for (const moduleRef of scopeModuleRefs) {
      progressByRef.set(
        moduleRef,
        restoredProgressByModuleRef.get(moduleRef) ??
          createModuleProgress({
            executionId,
            moduleRef,
            status: "PENDING",
          }),
      );
    }

    return progressByRef;
  }

  if (input.mode === "RECALCULATION") {
    for (const reusableResult of input.reusableIntermediateResults) {
      progressByRef.set(
        reusableResult.moduleRef,
        createModuleProgress({
          executionId,
          moduleRef: reusableResult.moduleRef,
          status: "COMPLETED",
          intermediateResultRefs: [
            reusableResult.intermediateResult.value.identity.path,
          ],
        }),
      );
    }

    for (const moduleRef of scopeModuleRefs) {
      if (progressByRef.has(moduleRef)) {
        throw new OrchestratorError(
          "recalculation module cannot already be reusable",
          moduleRef,
        );
      }

      progressByRef.set(
        moduleRef,
        createModuleProgress({
          executionId,
          moduleRef,
          status: "PENDING",
        }),
      );
    }

    return progressByRef;
  }

  for (const moduleRef of scopeModuleRefs) {
    progressByRef.set(
      moduleRef,
      createModuleProgress({
        executionId,
        moduleRef,
        status: "PENDING",
      }),
    );
  }

  return progressByRef;
}

function initializeAvailableIntermediateResults(
  input: Readonly<OrchestratorExecutionInput>,
): Map<string, Readonly<IntermediateResult>> {
  const availableIntermediateResultsByRef = new Map<
    string,
    Readonly<IntermediateResult>
  >();

  if (input.mode !== "RECALCULATION") {
    return availableIntermediateResultsByRef;
  }

  for (const reusableResult of input.reusableIntermediateResults) {
    const intermediateResult = createIntermediateResult(
      reusableResult.intermediateResult,
    );

    availableIntermediateResultsByRef.set(
      intermediateResult.value.identity.path,
      intermediateResult,
    );
  }

  return availableIntermediateResultsByRef;
}

function getDependencyResults(
  moduleRef: ModuleRef,
  progressByRef: ReadonlyMap<ModuleRef, Readonly<ModuleProgress>>,
  dependencyMap: ReadonlyMap<ModuleRef, readonly ModuleRef[]>,
  availableIntermediateResultsByRef: ReadonlyMap<
    string,
    Readonly<IntermediateResult>
  >,
): readonly IntermediateResult[] | undefined {
  const dependencyResults: IntermediateResult[] = [];

  for (const dependencyModuleRef of dependencyMap.get(moduleRef) ?? []) {
    const dependencyProgress = progressByRef.get(dependencyModuleRef);

    if (dependencyProgress?.status !== "COMPLETED") {
      return undefined;
    }

    if (
      dependencyProgress.intermediateResultRefs === undefined ||
      dependencyProgress.intermediateResultRefs.length === 0
    ) {
      return undefined;
    }

    for (const intermediateResultRef of dependencyProgress.intermediateResultRefs ??
      []) {
      const intermediateResult =
        availableIntermediateResultsByRef.get(intermediateResultRef);

      if (intermediateResult === undefined) {
        return undefined;
      }

      dependencyResults.push(intermediateResult);
    }
  }

  return Object.freeze([...dependencyResults]);
}

function getInitialCatalogSource(
  input: Readonly<OrchestratorExecutionInput>,
) {
  if (!("initialCatalogSource" in input)) {
    return undefined;
  }

  return input.initialCatalogSource;
}

function getInitialSolarPanelSelectionPolicySource(
  input: Readonly<OrchestratorExecutionInput>,
) {
  if (!("initialSolarPanelSelectionPolicySource" in input)) {
    return undefined;
  }

  return input.initialSolarPanelSelectionPolicySource;
}

function getInitialSolarSizingInputs(
  input: Readonly<OrchestratorExecutionInput>,
) {
  if (!("initialSolarSizingInputs" in input)) {
    return undefined;
  }

  return input.initialSolarSizingInputs;
}

function getInitialBatterySizingInputs(
  input: Readonly<OrchestratorExecutionInput>,
) {
  if (!("initialBatterySizingInputs" in input)) {
    return undefined;
  }

  return input.initialBatterySizingInputs;
}

function getInitialEnergyToBatteryPreparationInput(
  input: Readonly<OrchestratorExecutionInput>,
) {
  if (!("initialEnergyToBatteryPreparationInput" in input)) {
    return undefined;
  }

  return input.initialEnergyToBatteryPreparationInput;
}

function getInitialBatterySizingCompositionInput(
  input: Readonly<OrchestratorExecutionInput>,
) {
  if (!("initialBatterySizingCompositionInput" in input)) {
    return undefined;
  }

  return input.initialBatterySizingCompositionInput;
}

function hasDependencyOutsideScope(
  moduleRef: ModuleRef,
  dependencyMap: ReadonlyMap<ModuleRef, readonly ModuleRef[]>,
  scopeModuleRefSet: ReadonlySet<ModuleRef>,
): boolean {
  return (dependencyMap.get(moduleRef) ?? []).some(
    (dependencyRef) => !scopeModuleRefSet.has(dependencyRef),
  );
}

function hasUnavailableRecalculationDependency(
  moduleRef: ModuleRef,
  dependencyMap: ReadonlyMap<ModuleRef, readonly ModuleRef[]>,
  scopeModuleRefSet: ReadonlySet<ModuleRef>,
  progressByRef: ReadonlyMap<ModuleRef, Readonly<ModuleProgress>>,
): boolean {
  return (dependencyMap.get(moduleRef) ?? []).some((dependencyRef) => {
    if (scopeModuleRefSet.has(dependencyRef)) {
      return false;
    }

    return progressByRef.get(dependencyRef)?.status !== "COMPLETED";
  });
}

function hasMissingCompletedDependencyResult(
  moduleRef: ModuleRef,
  dependencyMap: ReadonlyMap<ModuleRef, readonly ModuleRef[]>,
  progressByRef: ReadonlyMap<ModuleRef, Readonly<ModuleProgress>>,
): ModuleRef | undefined {
  return (dependencyMap.get(moduleRef) ?? []).find((dependencyRef) => {
    const dependencyProgress = progressByRef.get(dependencyRef);

    return (
      dependencyProgress?.status === "COMPLETED" &&
      (dependencyProgress.intermediateResultRefs === undefined ||
        dependencyProgress.intermediateResultRefs.length === 0)
    );
  });
}

function blockModulesWithMissingDependencyResults(
  executionId: string,
  scopeModuleRefs: readonly ModuleRef[],
  dependencyMap: ReadonlyMap<ModuleRef, readonly ModuleRef[]>,
  progressByRef: Map<ModuleRef, Readonly<ModuleProgress>>,
): void {
  for (const moduleRef of scopeModuleRefs) {
    const progress = progressByRef.get(moduleRef);

    if (progress?.status !== "PENDING") {
      continue;
    }

    const dependencyRef = hasMissingCompletedDependencyResult(
      moduleRef,
      dependencyMap,
      progressByRef,
    );

    if (dependencyRef === undefined) {
      continue;
    }

    progressByRef.set(
      moduleRef,
      createModuleProgress({
        executionId,
        moduleRef,
        status: "BLOCKED",
        blockingIssues: [
          {
            code: "orchestrator.dependency.result.missing",
            message: `${dependencyRef} dependency completed without intermediate results`,
            path: dependencyRef,
          },
        ],
      }),
    );
  }
}

function findNextExecutableModule(
  input: Readonly<OrchestratorExecutionInput>,
  scopeModuleRefs: readonly ModuleRef[],
  progressByRef: ReadonlyMap<ModuleRef, Readonly<ModuleProgress>>,
  dependencyMap: ReadonlyMap<ModuleRef, readonly ModuleRef[]>,
  availableIntermediateResultsByRef: ReadonlyMap<
    string,
    Readonly<IntermediateResult>
  >,
): ModuleRef | undefined {
  const scopeModuleRefSet = new Set(scopeModuleRefs);

  for (const moduleRef of scopeModuleRefs) {
    const progress = progressByRef.get(moduleRef);

    if (progress === undefined || progress.status !== "PENDING") {
      continue;
    }

    if (
      input.mode === "PARTIAL" &&
      hasDependencyOutsideScope(
        moduleRef,
        dependencyMap,
        scopeModuleRefSet,
      )
    ) {
      continue;
    }

    if (
      input.mode === "RECALCULATION" &&
      hasUnavailableRecalculationDependency(
        moduleRef,
        dependencyMap,
        scopeModuleRefSet,
        progressByRef,
      )
    ) {
      continue;
    }

    const dependencyResults = getDependencyResults(
      moduleRef,
      progressByRef,
      dependencyMap,
      availableIntermediateResultsByRef,
    );

    if (dependencyResults !== undefined) {
      return moduleRef;
    }
  }

  return undefined;
}

function recordCompletedModule(
  executionId: string,
  moduleRef: ModuleRef,
  executionResult: Extract<
    ModuleExecutionResult,
    { status: "COMPLETED" }
  >,
  progressByRef: Map<ModuleRef, Readonly<ModuleProgress>>,
  availableIntermediateResultsByRef: Map<
    string,
    Readonly<IntermediateResult>
  >,
): void {
  const intermediateResults = executionResult.intermediateResults.map(
    (intermediateResult) => createIntermediateResult(intermediateResult),
  );

  const intermediateResultRefs = intermediateResults.map(
    (intermediateResult) => intermediateResult.value.identity.path,
  );

  for (const intermediateResult of intermediateResults) {
    availableIntermediateResultsByRef.set(
      intermediateResult.value.identity.path,
      intermediateResult,
    );
  }

  progressByRef.set(
    moduleRef,
    createModuleProgress({
      executionId,
      moduleRef,
      status: "COMPLETED",
      ...(intermediateResultRefs.length === 0
        ? {}
        : { intermediateResultRefs }),
    }),
  );
}

function recordBlockedModule(
  executionId: string,
  moduleRef: ModuleRef,
  executionResult: Extract<
    ModuleExecutionResult,
    { status: "BLOCKED" }
  >,
  progressByRef: Map<ModuleRef, Readonly<ModuleProgress>>,
): void {
  progressByRef.set(
    moduleRef,
    createModuleProgress({
      executionId,
      moduleRef,
      status: "BLOCKED",
      blockingIssues: executionResult.blockingIssues,
    }),
  );
}

function deriveExecutionState(
  input: Readonly<OrchestratorExecutionInput>,
  scopeModuleRefs: readonly ModuleRef[],
  progressByRef: ReadonlyMap<ModuleRef, Readonly<ModuleProgress>>,
  dependencyMap: ReadonlyMap<ModuleRef, readonly ModuleRef[]>,
): ExecutionState {
  const scopeModuleRefSet = new Set(scopeModuleRefs);

  const scopeProgress = scopeModuleRefs.map((moduleRef) =>
    progressByRef.get(moduleRef),
  );

  const hasBlocked = scopeProgress.some(
    (progress) => progress?.status === "BLOCKED",
  );

  if (hasBlocked) {
    return "BLOCKED";
  }

  const allCompleted = scopeProgress.every(
    (progress) => progress?.status === "COMPLETED",
  );

  if (input.mode === "PARTIAL") {
    return "PARTIAL";
  }

  if (allCompleted) {
    return "COMPLETED";
  }

  const hasPendingOutsideScopeDependency = scopeModuleRefs.some(
    (moduleRef) => {
      const progress = progressByRef.get(moduleRef);

      return (
        progress?.status === "PENDING" &&
        (input.mode === "RECALCULATION"
          ? hasUnavailableRecalculationDependency(
              moduleRef,
              dependencyMap,
              scopeModuleRefSet,
              progressByRef,
            )
          : hasDependencyOutsideScope(
              moduleRef,
              dependencyMap,
              scopeModuleRefSet,
            ))
      );
    },
  );

  if (hasPendingOutsideScopeDependency) {
    return "PARTIAL";
  }

  return "PARTIAL";
}

function freezeModuleProgressByRef(
  progressByRef: ReadonlyMap<ModuleRef, Readonly<ModuleProgress>>,
): Readonly<Record<string, ModuleProgress>> {
  const frozen: Record<string, ModuleProgress> = {};

  for (const [moduleRef, progress] of progressByRef.entries()) {
    frozen[moduleRef] = createModuleProgress(progress);
  }

  return Object.freeze(frozen);
}

function finalizeResult(
  executionState: ExecutionState,
  progressByRef: ReadonlyMap<ModuleRef, Readonly<ModuleProgress>>,
  availableIntermediateResultsByRef: ReadonlyMap<
    string,
    Readonly<IntermediateResult>
  >,
): Readonly<OrchestratorResult> {
  const state = requireExecutionState(executionState);

  const moduleProgressByRef = freezeModuleProgressByRef(progressByRef);

  const intermediateResults = Object.freeze(
    [...availableIntermediateResultsByRef.values()].map(
      (intermediateResult) => createIntermediateResult(intermediateResult),
    ),
  );

  return Object.freeze({
    executionState: state,
    moduleProgressByRef,
    intermediateResults,
  });
}

function normalizeOrchestratorInput(
  input: Readonly<OrchestratorExecutionInput>,
): Readonly<OrchestratorExecutionInput> {
  if (!isPlainRecord(input)) {
    throw new OrchestratorError("input is required");
  }

  if (input.mode === "RECALCULATION") {
    return createRecalculationOrchestratorInput(input);
  }

  if (input.mode === "FULL") {
    return createOrchestratorInput(input);
  }

  if (input.mode === "PARTIAL") {
    return createOrchestratorInput(input);
  }

  return createOrchestratorInput(input);
}

export function createInMemoryOrchestrator(): Readonly<Orchestrator> {
  return Object.freeze({
    async execute(
      input: Readonly<OrchestratorExecutionInput>,
      registry: Readonly<ExecutorRegistry>,
    ): Promise<Readonly<OrchestratorResult>> {
      if (!isModuleExecutorRegistry(registry)) {
        throw new OrchestratorError("registry is required");
      }

      const normalizedInput = normalizeOrchestratorInput(input);

      const scopeModuleRefs = determineScopeModuleRefs(normalizedInput);

      const executionId =
        normalizedInput.executionSnapshot.identity.executionId;

      const dependencyMap = dependenciesByModule(
        normalizedInput.executionPlan,
      );

      const progressByRef = initializeModuleProgressByRef(
        normalizedInput,
        scopeModuleRefs,
      );

      const availableIntermediateResultsByRef =
        initializeAvailableIntermediateResults(normalizedInput);

      while (true) {
        const nextModuleRef = findNextExecutableModule(
          normalizedInput,
          scopeModuleRefs,
          progressByRef,
          dependencyMap,
          availableIntermediateResultsByRef,
        );

        if (nextModuleRef === undefined) {
          break;
        }

        progressByRef.set(
          nextModuleRef,
          createModuleProgress({
            executionId,
            moduleRef: nextModuleRef,
            status: "RUNNING",
          }),
        );

        const dependencyResults = getDependencyResults(
          nextModuleRef,
          progressByRef,
          dependencyMap,
          availableIntermediateResultsByRef,
        );
        const initialCatalogSource = getInitialCatalogSource(
          normalizedInput,
        );
        const initialSolarPanelSelectionPolicySource =
          getInitialSolarPanelSelectionPolicySource(normalizedInput);
        const initialSolarSizingInputs =
          getInitialSolarSizingInputs(normalizedInput);
        const initialBatterySizingInputs =
          getInitialBatterySizingInputs(normalizedInput);
        const initialEnergyToBatteryPreparationInput =
          getInitialEnergyToBatteryPreparationInput(normalizedInput);
        const initialBatterySizingCompositionInput =
          getInitialBatterySizingCompositionInput(normalizedInput);
        function getReusedDependencyResultRefs(
  dependencyResults: readonly IntermediateResult[],
  input: Readonly<OrchestratorExecutionInput>,
): readonly string[] {
  if (input.mode !== "RECALCULATION") {
    return Object.freeze([]);
  }

  const reusableResultRefs = new Set(
    input.reusableIntermediateResults.map(
      (reusableResult) =>
        reusableResult.intermediateResult.value.identity.path,
    ),
  );

  const refs = dependencyResults
    .filter(
      (result) =>
        result.executionId !==
          input.executionSnapshot.identity.executionId &&
        reusableResultRefs.has(result.value.identity.path),
    )
    .map((result) => result.value.identity.path);

  return Object.freeze([...refs]);
}

        if (dependencyResults === undefined) {
          progressByRef.set(
            nextModuleRef,
            createModuleProgress({
              executionId,
              moduleRef: nextModuleRef,
              status: "PENDING",
            }),
          );

          continue;
        }

        const executor = registry.resolve(nextModuleRef);

        const reusedDependencyResultRefs =
  getReusedDependencyResultRefs(
    dependencyResults,
    normalizedInput,
  );

const rawExecutionResult = await executor.execute(
  createModuleExecutorInput({
    executionSnapshot: normalizedInput.executionSnapshot,
    moduleRef: nextModuleRef,
    dependencyResults,
    ...(initialCatalogSource === undefined
      ? {}
      : { initialCatalogSource }),
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
    ...(reusedDependencyResultRefs.length === 0
      ? {}
      : { reusedDependencyResultRefs }),
  }),
);

        const executionResult:
          | Readonly<CompletedModuleExecutionResult>
          | Readonly<BlockedModuleExecutionResult>
          | Readonly<FailedModuleExecutionResult> =
          rawExecutionResult.status === "COMPLETED"
            ? createModuleExecutionResult(
                rawExecutionResult,
                normalizedInput.executionSnapshot,
              )
            : rawExecutionResult.status === "BLOCKED"
              ? createModuleExecutionResult(
                  rawExecutionResult,
                  normalizedInput.executionSnapshot,
                )
              : createModuleExecutionResult(
                  rawExecutionResult,
                  normalizedInput.executionSnapshot,
                );

        if (executionResult.status === "COMPLETED") {
          recordCompletedModule(
            executionId,
            nextModuleRef,
            executionResult,
            progressByRef,
            availableIntermediateResultsByRef,
          );

          continue;
        }

        if (executionResult.status === "BLOCKED") {
          recordBlockedModule(
            executionId,
            nextModuleRef,
            executionResult,
            progressByRef,
          );

          continue;
        }

        throw new OrchestratorError(
          executionResult.errorMessage,
          nextModuleRef,
        );
      }

      blockModulesWithMissingDependencyResults(
        executionId,
        scopeModuleRefs,
        dependencyMap,
        progressByRef,
      );

      return finalizeResult(
        deriveExecutionState(
          normalizedInput,
          scopeModuleRefs,
          progressByRef,
          dependencyMap,
        ),
        progressByRef,
        availableIntermediateResultsByRef,
      );
    },
  });
}