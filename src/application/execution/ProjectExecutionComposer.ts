import type { InitialBatterySizingInputs } from "./InitialBatterySizingInputsContract.js";
import type { InitialCatalogSource } from "./InitialCatalogSourceContract.js";
import type { InitialSolarPanelSelectionPolicySource } from "./InitialSolarPanelSelectionPolicySource.js";
import type { InitialSolarSizingInputs } from "./InitialSolarSizingInputsContract.js";
import type { EnergyToBatteryPreparationContext } from "./EnergyToBatteryPreparationContract.js";
import type { BatterySizingCompositionContext } from "./BatterySizingCompositionContract.js";
import {
  createAgronomyExecutionPlan,
  createAgronomyExecutionRegistry,
} from "./AgronomyExecutionAssembly.js";
import {
  createEnergyExecutionAssembly,
} from "./EnergyExecutionAssembly.js";
import {
  createExecutionPlan,
  type ExecutionPlan,
} from "./ExecutionPlan.js";
import {
  createInMemoryOrchestrator,
  type Orchestrator,
  type OrchestratorResult,
} from "./Orchestrator.js";
import {
  ModuleExecutorNotFoundError,
  type ModuleExecutorRegistry,
} from "./ModuleExecutorRegistry.js";
import type { ModuleExecutor } from "./ModuleExecutor.js";
import type { ExecutionSnapshot } from "./ExecutionSnapshot.js";
import type { IntermediateResult } from "./IntermediateResult.js";
import {
  createTechnicalResult,
  type TechnicalResult,
} from "./TechnicalResult.js";
import type { ValidationIssue } from "../validation/ValidationResult.js";
import { ValidationStatus } from "../../domain/shared/ValidationStatus.js";
import type { ExecutionState } from "./ExecutionState.js";
import type { ModuleProgress } from "./ModuleProgress.js";
import {
  adaptProjectTechnicalIntent,
  ProjectTechnicalIntentAdapterError,
  type ProjectTechnicalIntentAdapterInput,
} from "./ProjectTechnicalIntentAdapter.js";

export interface ProjectExecutionComposerInput {
  readonly executionSnapshot: Readonly<ExecutionSnapshot>;
  readonly sectorId: string;
  readonly calculationId: string;
  readonly resultVersion: string;
  readonly projectTechnicalIntentInput: Readonly<ProjectTechnicalIntentAdapterInput>;
  readonly finalValueRefs?: readonly string[];
  readonly pendingInputRefs?: readonly string[];
  readonly initialCatalogSource?: Readonly<InitialCatalogSource>;
  readonly initialSolarPanelSelectionPolicySource?: Readonly<InitialSolarPanelSelectionPolicySource>;
  readonly initialSolarSizingInputs?: Readonly<InitialSolarSizingInputs>;
  readonly initialBatterySizingInputs?: Readonly<InitialBatterySizingInputs>;
  readonly initialEnergyToBatteryPreparationInput?: Readonly<EnergyToBatteryPreparationContext>;
  readonly initialBatterySizingCompositionInput?: Readonly<BatterySizingCompositionContext>;
  readonly includeAgronomySectorVolume?: boolean;
  readonly includeAgronomyHydraulicModules?: boolean;
}

export type ProjectExecutionComposerStatus =
  | "PENDING"
  | "BLOCKED"
  | "FAILED"
  | "COMPLETED";

export interface ProjectExecutionComposerResult {
  readonly status: ProjectExecutionComposerStatus;
  readonly executionState: ExecutionState | "FAILED";
  readonly executionPlan: Readonly<ExecutionPlan>;
  readonly moduleProgressByRef: Readonly<Record<string, ModuleProgress>>;
  readonly intermediateResults: readonly IntermediateResult[];
  readonly sourceRefs: readonly string[];
  readonly technicalResult?: Readonly<TechnicalResult>;
  readonly issues: readonly ValidationIssue[];
}

export interface ProjectExecutionComposerOptions {
  readonly orchestrator?: Readonly<Orchestrator>;
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)]);
}

function mergePlans(
  agronomyPlan: Readonly<ExecutionPlan>,
  energyPlan: Readonly<ExecutionPlan> | undefined,
): Readonly<ExecutionPlan> {
  if (energyPlan === undefined) return agronomyPlan;

  const moduleRefs = uniqueStrings([
    ...agronomyPlan.moduleRefs,
    ...energyPlan.moduleRefs,
  ]);
  const dependencyKeys = new Set<string>();
  const dependencies = [
    ...agronomyPlan.dependencyGraph.dependencies,
    ...energyPlan.dependencyGraph.dependencies,
  ].filter((dependency) => {
    const key = `${dependency.moduleRef}\n${dependency.dependsOnModuleRef}`;
    if (dependencyKeys.has(key)) return false;
    dependencyKeys.add(key);
    return true;
  });

  return createExecutionPlan({
    moduleRefs,
    dependencyGraph: { dependencies },
  });
}

function createCombinedRegistry(
  agronomyRegistry: Readonly<ModuleExecutorRegistry>,
  energyRegistry: Readonly<ModuleExecutorRegistry> | undefined,
): Readonly<ModuleExecutorRegistry> {
  function resolveFrom(
    registry: Readonly<ModuleExecutorRegistry>,
    moduleRef: string,
  ): ModuleExecutor | undefined {
    try {
      return registry.resolve(moduleRef);
    } catch (error) {
      if (error instanceof ModuleExecutorNotFoundError) return undefined;
      throw error;
    }
  }

  return Object.freeze({
    resolve(moduleRef: string): ModuleExecutor {
      const agronomyExecutor = resolveFrom(agronomyRegistry, moduleRef);
      if (agronomyExecutor !== undefined) return agronomyExecutor;

      const energyExecutor =
        energyRegistry === undefined
          ? undefined
          : resolveFrom(energyRegistry, moduleRef);
      if (energyExecutor !== undefined) return energyExecutor;

      throw new ModuleExecutorNotFoundError(moduleRef);
    },
  });
}

function sourceRefsFromResults(
  snapshot: Readonly<ExecutionSnapshot>,
  intermediateResults: readonly IntermediateResult[],
  input: Readonly<ProjectExecutionComposerInput>,
): readonly string[] {
  const sourceRefs = new Set(snapshot.sourceRefs);
  for (const sourceRef of input.initialBatterySizingInputs?.status === "AVAILABLE"
    ? input.initialBatterySizingInputs.sourceRefs
    : []) {
    sourceRefs.add(sourceRef);
  }
  for (const sourceRef of input.initialEnergyToBatteryPreparationInput?.sourceRefs ?? []) {
    sourceRefs.add(sourceRef);
  }
  for (const sourceRef of input.initialBatterySizingCompositionInput?.sourceRefs ?? []) {
    sourceRefs.add(sourceRef);
  }
  for (const result of intermediateResults) {
    sourceRefs.add(result.value.evidence?.sourceReference ?? "");
    sourceRefs.add(result.value.evidence?.evidenceReference ?? "");
  }
  sourceRefs.delete("");
  return Object.freeze([...sourceRefs]);
}

function resultStatus(
  executionState: ExecutionState,
): ProjectExecutionComposerStatus {
  if (executionState === "COMPLETED") return "COMPLETED";
  if (executionState === "BLOCKED") return "BLOCKED";
  return "PENDING";
}

function validationStatus(
  status: ProjectExecutionComposerStatus,
): ValidationStatus {
  if (status === "COMPLETED") return ValidationStatus.VALIDATED;
  if (status === "BLOCKED") return ValidationStatus.BLOCKED;
  return ValidationStatus.PENDING;
}

function createAggregatedTechnicalResult(
  input: Readonly<ProjectExecutionComposerInput>,
  status: ProjectExecutionComposerStatus,
  intermediateResults: readonly IntermediateResult[],
  issues: readonly ValidationIssue[],
): Readonly<TechnicalResult> {
  const availableRefs = new Set(
    intermediateResults.map((result) => result.value.identity.path),
  );
  const declaredFinalValueRefs = input.finalValueRefs ?? [];
  const finalValueRefs = declaredFinalValueRefs.filter((ref) =>
    availableRefs.has(ref),
  );
  const completeness =
    status === "COMPLETED" &&
    declaredFinalValueRefs.length > 0 &&
    finalValueRefs.length === declaredFinalValueRefs.length
      ? "FINAL"
      : "PARTIAL";

  return createTechnicalResult({
    calculationId: input.calculationId,
    executionId: input.executionSnapshot.identity.executionId,
    configurationRef: input.executionSnapshot.configurationRef,
    engineVersion: input.executionSnapshot.identity.engineVersion,
    rulesVersion: input.executionSnapshot.identity.rulesVersion,
    resultVersion: input.resultVersion,
    createdAt: input.executionSnapshot.identity.createdAt,
    status: validationStatus(status),
    completeness,
    intermediateResults,
    ...(finalValueRefs.length === 0 ? {} : { finalValueRefs }),
    ...(issues.length === 0 ? {} : { issues }),
  });
}

function pendingResult(
  input: Readonly<ProjectExecutionComposerInput>,
  executionPlan: Readonly<ExecutionPlan>,
): Readonly<ProjectExecutionComposerResult> {
  const issues = Object.freeze(
    (input.pendingInputRefs ?? []).map((path) => ({
      code: "projectExecution.input.pending",
      message: `${path} is pending an authorized technical producer`,
      path,
    })),
  );
  const intermediateResults = Object.freeze([] as IntermediateResult[]);
  return Object.freeze({
    status: "PENDING" as const,
    executionState: "PENDING" as const,
    executionPlan,
    moduleProgressByRef: Object.freeze({}),
    intermediateResults,
    sourceRefs: sourceRefsFromResults(input.executionSnapshot, intermediateResults, input),
    technicalResult: createAggregatedTechnicalResult(
      input,
      "PENDING",
      intermediateResults,
      issues,
    ),
    issues,
  });
}

function completedResult(
  input: Readonly<ProjectExecutionComposerInput>,
  executionPlan: Readonly<ExecutionPlan>,
  orchestratorResult: Readonly<OrchestratorResult>,
): Readonly<ProjectExecutionComposerResult> {
  const status = resultStatus(orchestratorResult.executionState);
  const issues = Object.freeze(
    Object.values(orchestratorResult.moduleProgressByRef).flatMap(
      (progress) => progress.blockingIssues ?? [],
    ),
  );
  return Object.freeze({
    status,
    executionState: orchestratorResult.executionState,
    executionPlan,
    moduleProgressByRef: orchestratorResult.moduleProgressByRef,
    intermediateResults: orchestratorResult.intermediateResults,
    sourceRefs: sourceRefsFromResults(
      input.executionSnapshot,
      orchestratorResult.intermediateResults,
      input,
    ),
    technicalResult: createAggregatedTechnicalResult(
      input,
      status,
      orchestratorResult.intermediateResults,
      issues,
    ),
    issues,
  });
}

export function createProjectExecutionComposer(
  options: Readonly<ProjectExecutionComposerOptions> = {},
): Readonly<{
  execute: (
    input: Readonly<ProjectExecutionComposerInput>,
  ) => Promise<Readonly<ProjectExecutionComposerResult>>;
}> {
  const orchestrator = options.orchestrator ?? createInMemoryOrchestrator();

  return Object.freeze({
    async execute(
      input: Readonly<ProjectExecutionComposerInput>,
    ): Promise<Readonly<ProjectExecutionComposerResult>> {
      const includeAgronomyHydraulicModules =
        input.includeAgronomyHydraulicModules ?? true;
      const agronomyAssembly = {
        plan: createAgronomyExecutionPlan({
          includeSectorVolume: input.includeAgronomySectorVolume ?? true,
          ...(includeAgronomyHydraulicModules
            ? { sectorId: input.sectorId }
            : {}),
        }),
        registry: createAgronomyExecutionRegistry(
          includeAgronomyHydraulicModules
            ? { sectorId: input.sectorId }
            : {},
        ),
      };
      let technicalIntent:
        | ReturnType<typeof adaptProjectTechnicalIntent>
        | undefined;
      try {
        technicalIntent = adaptProjectTechnicalIntent(
          input.projectTechnicalIntentInput,
        );
      } catch (error) {
        if (!(error instanceof ProjectTechnicalIntentAdapterError)) throw error;

        const issue: ValidationIssue = {
          code: "projectExecution.technicalIntent.invalid",
          message: error.message,
          path: "projectTechnicalIntentInput",
        };
        return Object.freeze({
          status: "FAILED" as const,
          executionState: "FAILED" as const,
          executionPlan: agronomyAssembly.plan,
          moduleProgressByRef: Object.freeze({}),
          intermediateResults: Object.freeze([] as IntermediateResult[]),
          sourceRefs: sourceRefsFromResults(input.executionSnapshot, [], input),
          issues: Object.freeze([issue]),
        });
      }
      const hasActiveEnergyModules =
        technicalIntent.branches.hydraulic.pumping ||
        technicalIntent.branches.energy.solar ||
        technicalIntent.branches.energy.battery;
      const energyAssembly = hasActiveEnergyModules
        ? createEnergyExecutionAssembly({
            sectorId: input.sectorId,
            activeBranches: technicalIntent.branches,
          })
        : undefined;
      const executionPlan = mergePlans(
        agronomyAssembly.plan,
        energyAssembly?.executionPlan,
      );

      if (input.pendingInputRefs !== undefined && input.pendingInputRefs.length > 0) {
        return pendingResult(input, executionPlan);
      }

      try {
        const orchestratorResult = await orchestrator.execute(
          {
            mode: "FULL",
            executionPlan,
            executionSnapshot: input.executionSnapshot,
            ...(input.initialCatalogSource === undefined
              ? {}
              : { initialCatalogSource: input.initialCatalogSource }),
            ...(input.initialSolarPanelSelectionPolicySource === undefined
              ? {}
              : {
                  initialSolarPanelSelectionPolicySource:
                    input.initialSolarPanelSelectionPolicySource,
                }),
            ...(input.initialSolarSizingInputs === undefined
              ? {}
              : { initialSolarSizingInputs: input.initialSolarSizingInputs }),
            ...(input.initialBatterySizingInputs === undefined
              ? {}
              : { initialBatterySizingInputs: input.initialBatterySizingInputs }),
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
          },
          createCombinedRegistry(
            agronomyAssembly.registry,
            energyAssembly?.registry,
          ),
        );

        return completedResult(input, executionPlan, orchestratorResult);
      } catch (error) {
        const issue: ValidationIssue = {
          code: "projectExecution.execution.failed",
          message: error instanceof Error ? error.message : "Project execution failed",
          path: "project.execution",
        };
        return Object.freeze({
          status: "FAILED" as const,
          executionState: "FAILED" as const,
          executionPlan,
          moduleProgressByRef: Object.freeze({}),
          intermediateResults: Object.freeze([] as IntermediateResult[]),
          sourceRefs: sourceRefsFromResults(input.executionSnapshot, [], input),
          issues: Object.freeze([issue]),
        });
      }
    },
  });
}

export async function executeProjectExecutionComposer(
  input: Readonly<ProjectExecutionComposerInput>,
  options: Readonly<ProjectExecutionComposerOptions> = {},
): Promise<Readonly<ProjectExecutionComposerResult>> {
  return createProjectExecutionComposer(options).execute(input);
}