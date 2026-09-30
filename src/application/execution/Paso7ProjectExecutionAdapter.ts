import type { EffectiveRainfallContract } from "../../../engine/domain/agronomy/EffectiveRainfallContract.js";
import type { IrrigationSystemEfficiencyContract } from "../../../engine/domain/agronomy/IrrigationSystemEfficiencyContract.js";
import type { RainfallTemporalWindow } from "../../../engine/domain/agronomy/RainfallTemporalBalanceContract.js";
import type { IdentifiedTechnicalValue } from "../../domain/shared/TechnicalValue.js";
import {
  adaptProjectTechnicalIntent,
  type ProjectTechnicalIntentAdapterInput,
} from "./ProjectTechnicalIntentAdapter.js";
import {
  createAgronomyProjectExecutionSnapshot,
  type AgronomyProjectExecutionSnapshotInput,
} from "./ProjectAgronomyExecutionSnapshot.js";
import {
  executeProjectExecutionComposer,
  type ProjectExecutionComposerInput,
  type ProjectExecutionComposerResult,
} from "./ProjectExecutionComposer.js";
import type { ExecutionSnapshot } from "./ExecutionSnapshot.js";
import {
  prepareAgronomyPipelineFromSessionStorage,
  type SessionStorageReader,
} from "./SessionStorageAgronomyPipelineAdapter.js";
import type { ProjectTechnicalData } from "../../domain/project/ProjectModel.js";
import type { ProjectModel } from "../../domain/project/ProjectModel.js";
import { ProjectStatus } from "../../domain/project/ProjectStatus.js";
import { createProjectVersion } from "../../domain/project/ProjectVersion.js";
import type { ExecutionIdentity } from "./ExecutionIdentity.js";
import type { SiarPeriod } from "./SiarDailyDataProvider.js";
import { isValidSiarPeriod } from "./SiarDailyRequestBuilder.js";
import {
  HYDRAULIC_EMITTER_ENGINE_PENDING_INPUTS,
  type ProjectStepsAdapterResult,
  type ProjectStepsInput,
} from "./ProjectStepsTechnicalDataAdapter.js";

export interface Paso7AgronomyExecutionContext {
  /** Must come from an explicitly authorized upstream station selection. */
  readonly stationId?: string;
  /** Must be supplied explicitly; PASO 1-6 do not provide SIAR dates. */
  readonly siarPeriod?: SiarPeriod;
  readonly eto?: IdentifiedTechnicalValue<"mm">;
  readonly kc?: IdentifiedTechnicalValue<"coefficient">;
  readonly rainfall?: IdentifiedTechnicalValue<"mm">;
  readonly effectiveRainfallObserved?: IdentifiedTechnicalValue<"mm">;
  readonly period?: RainfallTemporalWindow;
  readonly effectiveRainfallContract?: EffectiveRainfallContract;
  readonly irrigationSystemEfficiency?: IrrigationSystemEfficiencyContract;
  readonly identity?: ExecutionIdentity;
  readonly configurationRef?: string;
  readonly sourceRefs?: readonly string[];
  readonly inputRefs?: readonly string[];
  readonly calculationId?: string;
  readonly resultVersion?: string;
  readonly sectorId?: string;
  readonly conditions?: Readonly<Record<string, unknown>>;
  readonly finalValueRefs?: readonly string[];
}

export interface Paso7ProjectExecutionInput {
  readonly storage: SessionStorageReader;
  readonly context: Paso7AgronomyExecutionContext;
}

export interface Paso7ProjectExecutionOptions {
  readonly executeComposer?: (
    input: Readonly<ProjectExecutionComposerInput>,
  ) => Promise<Readonly<ProjectExecutionComposerResult>>;
}

export interface Paso7ProjectExecutionPendingResult {
  readonly kind: "PENDING";
  readonly status: "PENDING";
  readonly missingFields: readonly string[];
  readonly steps?: ProjectStepsInput;
  readonly adapted?: Readonly<ProjectStepsAdapterResult>;
}

export interface Paso7ProjectExecutionFinishedResult {
  readonly kind: "COMPOSER_RESULT";
  readonly status: ProjectExecutionComposerResult["status"];
  readonly steps: ProjectStepsInput;
  readonly adapted: Readonly<ProjectStepsAdapterResult>;
  readonly execution: Readonly<ProjectExecutionComposerResult>;
}

export interface Paso7ProjectExecutionFailedResult {
  readonly kind: "ADAPTER_FAILURE";
  readonly status: "FAILED";
  readonly steps?: ProjectStepsInput;
  readonly adapted?: Readonly<ProjectStepsAdapterResult>;
  readonly error: Readonly<{
    readonly message: string;
    readonly path: string;
  }>;
}

export type Paso7ProjectExecutionResult =
  | Paso7ProjectExecutionPendingResult
  | Paso7ProjectExecutionFinishedResult
  | Paso7ProjectExecutionFailedResult;

const REQUIRED_CONTEXT_FIELDS = Object.freeze([
  ["stationId", "siar.stationId"],
  ["siarPeriod", "siar.siarPeriod"],
  ["eto", "agronomy.inputs.eto"],
  ["kc", "agronomy.inputs.kc"],
  ["rainfall", "agronomy.inputs.rainfall"],
  ["effectiveRainfallObserved", "agronomy.inputs.effectiveRainfallObserved"],
  ["period", "period"],
  ["effectiveRainfallContract", "effectiveRainfallContract"],
  ["irrigationSystemEfficiency", "irrigationSystemEfficiency"],
  ["identity", "identity"],
  ["configurationRef", "configurationRef"],
  ["sourceRefs", "sourceRefs"],
  ["inputRefs", "inputRefs"],
  ["calculationId", "calculationId"],
  ["resultVersion", "resultVersion"],
  ["sectorId", "sectorId"],
] as const);

const HYDRAULIC_PENDING_FIELDS = new Set<string>(
  HYDRAULIC_EMITTER_ENGINE_PENDING_INPUTS,
);

const DECLARED_PENDING_TECHNICAL_PATHS: Readonly<Record<string, string>> = {
  eto: "agronomy.inputs.eto",
  kc: "agronomy.inputs.kc",
  rainfall: "agronomy.inputs.rainfall",
  effectiveRainfall: "agronomy.inputs.effectiveRainfallObserved",
  "irrigationSystemEfficiency.efficiency":
    "agronomy.irrigationSystemEfficiency",
};

function contextTechnicalValues(
  context: Paso7AgronomyExecutionContext,
): readonly IdentifiedTechnicalValue[] {
  const values: (IdentifiedTechnicalValue | undefined)[] = [
    context.eto,
    context.kc,
    context.rainfall,
    context.effectiveRainfallObserved,
    context.irrigationSystemEfficiency?.efficiency,
  ];

  return Object.freeze(
    values.filter(
      (value): value is IdentifiedTechnicalValue => value !== undefined,
    ),
  );
}

function mergeTechnicalValues(
  adaptedValues: readonly IdentifiedTechnicalValue[],
  contextValues: readonly IdentifiedTechnicalValue[],
): readonly IdentifiedTechnicalValue[] {
  const values = [...adaptedValues];

  for (const value of contextValues) {
    const existingIndex = values.findIndex(
      (existing) => existing.identity.path === value.identity.path,
    );
    if (existingIndex === -1) {
      values.push(value);
    } else {
      values[existingIndex] = value;
    }
  }

  return Object.freeze(values);
}

function mergeTechnicalData(
  adapted: ProjectTechnicalData,
  context: Paso7AgronomyExecutionContext,
): ProjectTechnicalData {
  return Object.freeze({
    ...adapted,
    values: mergeTechnicalValues(
      adapted.values ?? [],
      contextTechnicalValues(context),
    ),
  });
}

function missingContextFields(
  context: Paso7AgronomyExecutionContext,
): readonly string[] {
  return Object.freeze(
    REQUIRED_CONTEXT_FIELDS
      .filter(([field]) => context[field] === undefined)
      .map(([, path]) => path),
  );
}

function invalidContextFields(
  context: Paso7AgronomyExecutionContext,
): readonly string[] {
  return context.siarPeriod !== undefined && !isValidSiarPeriod(context.siarPeriod)
    ? Object.freeze(["siar.siarPeriod"])
    : Object.freeze([]);
}

function snapshotInput(
  context: Paso7AgronomyExecutionContext,
  technicalData: ProjectTechnicalData,
): AgronomyProjectExecutionSnapshotInput | undefined {
  if (
    context.identity === undefined ||
    context.configurationRef === undefined ||
    context.sourceRefs === undefined ||
    context.inputRefs === undefined ||
    context.period === undefined ||
    context.effectiveRainfallContract === undefined ||
    context.irrigationSystemEfficiency === undefined
  ) {
    return undefined;
  }

  return {
    identity: context.identity,
    configurationRef: context.configurationRef,
    sourceRefs: context.sourceRefs,
    inputRefs: context.inputRefs,
    technicalData,
    period: context.period,
    effectiveRainfallContract: context.effectiveRainfallContract,
    irrigationSystemEfficiency: context.irrigationSystemEfficiency,
    ...(context.conditions === undefined ? {} : { conditions: context.conditions }),
  };
}

function composerInput(
  context: Paso7AgronomyExecutionContext,
  executionSnapshot: Readonly<ExecutionSnapshot>,
  projectTechnicalIntentInput: Readonly<ProjectTechnicalIntentAdapterInput>,
): ProjectExecutionComposerInput | undefined {
  if (
    context.sectorId === undefined ||
    context.calculationId === undefined ||
    context.resultVersion === undefined
  ) {
    return undefined;
  }

  return {
    executionSnapshot,
    sectorId: context.sectorId,
    calculationId: context.calculationId,
    resultVersion: context.resultVersion,
    projectTechnicalIntentInput,
    includeAgronomyHydraulicModules: false,
    ...(context.finalValueRefs === undefined
      ? {}
      : { finalValueRefs: context.finalValueRefs }),
  };
}

function preparationContext(
  context: Paso7AgronomyExecutionContext,
) {
  const projectId = context.identity?.executionId;
  const createdAt = context.identity?.createdAt;
  const project: ProjectModel | undefined =
    projectId === undefined || createdAt === undefined
      ? undefined
      : {
          projectId,
          version: createProjectVersion(projectId, 1),
          createdAt,
          updatedAt: createdAt,
          status: ProjectStatus.PROVISIONAL,
          technicalData: { values: contextTechnicalValues(context) },
        };

  return {
    ...(project === undefined ? {} : { project }),
    ...(context.identity === undefined ? {} : { identity: context.identity }),
    ...(context.configurationRef === undefined
      ? {}
      : { configurationRef: context.configurationRef }),
    ...(context.sourceRefs === undefined ? {} : { sourceRefs: context.sourceRefs }),
    ...(context.inputRefs === undefined ? {} : { inputRefs: context.inputRefs }),
    ...(context.period === undefined ? {} : { period: context.period }),
    ...(context.effectiveRainfallContract === undefined
      ? {}
      : { effectiveRainfallContract: context.effectiveRainfallContract }),
    ...(context.irrigationSystemEfficiency === undefined
      ? {}
      : { irrigationSystemEfficiency: context.irrigationSystemEfficiency }),
    ...(context.calculationId === undefined
      ? {}
      : { calculationId: context.calculationId }),
    ...(context.resultVersion === undefined
      ? {}
      : { resultVersion: context.resultVersion }),
  };
}

function agronomyPendingFields(
  preparation: ReturnType<typeof prepareAgronomyPipelineFromSessionStorage>,
  context: Paso7AgronomyExecutionContext,
  technicalValues: readonly IdentifiedTechnicalValue[],
): readonly string[] {
  if (preparation.status !== "PENDING") return Object.freeze([]);

  return Object.freeze(
    preparation.missingFields.filter(
      (field) => {
        if (HYDRAULIC_PENDING_FIELDS.has(field)) return false;

        const technicalPath = DECLARED_PENDING_TECHNICAL_PATHS[field];
        if (technicalPath !== undefined) {
          return !technicalValues.some(
            (value) => value.identity.path === technicalPath,
          );
        }

        if (field === "period") return context.period === undefined;
        if (field === "irrigationSystemEfficiency.irrigationSystem") {
          return context.irrigationSystemEfficiency?.irrigationSystem === undefined;
        }

        return true;
      },
    ),
  );
}

export async function executePaso7ProjectExecution(
  input: Paso7ProjectExecutionInput,
  options: Readonly<Paso7ProjectExecutionOptions> = {},
): Promise<Readonly<Paso7ProjectExecutionResult>> {
  let steps: ProjectStepsInput | undefined;
  let adapted: Readonly<ProjectStepsAdapterResult> | undefined;
  try {
    const preparation = prepareAgronomyPipelineFromSessionStorage({
      storage: input.storage,
      context: preparationContext(input.context),
    });
    steps = preparation.status === "PENDING"
      ? preparation.steps
      : preparation.input.steps;
    adapted = preparation.adapted;
    const technicalValues = mergeTechnicalValues(
      adapted?.technicalData.values ?? [],
      contextTechnicalValues(input.context),
    );

    const missingFields = [
      ...(preparation.status === "PENDING"
        ? preparation.invalidStorageKeys.map((key) => `storage.${key}`)
        : []),
      ...agronomyPendingFields(preparation, input.context, technicalValues),
      ...missingContextFields(input.context),
      ...invalidContextFields(input.context),
    ];
    if (steps === undefined || adapted === undefined) {
      missingFields.push("steps");
    }
    if (missingFields.length > 0) {
      return Object.freeze({
        kind: "PENDING" as const,
        status: "PENDING" as const,
        missingFields: Object.freeze([...new Set(missingFields)]),
        ...(steps === undefined ? {} : { steps }),
        ...(adapted === undefined ? {} : { adapted }),
      });
    }

    if (steps === undefined || adapted === undefined) {
      return Object.freeze({
        kind: "PENDING" as const,
        status: "PENDING" as const,
        missingFields: Object.freeze(["steps"]),
      });
    }

    const technicalData = mergeTechnicalData(adapted.technicalData, input.context);
    const inputForSnapshot = snapshotInput(input.context, technicalData);
    if (inputForSnapshot === undefined) {
      return Object.freeze({
        kind: "PENDING" as const,
        status: "PENDING" as const,
        missingFields: Object.freeze(["snapshot.context"]),
        steps,
        adapted,
      });
    }

    const executionSnapshot = createAgronomyProjectExecutionSnapshot(inputForSnapshot);
    const step6 = steps.step6;
    const projectTechnicalIntentInput = step6 as ProjectTechnicalIntentAdapterInput;
    adaptProjectTechnicalIntent(projectTechnicalIntentInput);
    const inputForComposer = composerInput(
      input.context,
      executionSnapshot,
      projectTechnicalIntentInput,
    );

    if (inputForComposer === undefined) {
      return Object.freeze({
        kind: "PENDING" as const,
        status: "PENDING" as const,
        missingFields: Object.freeze(["composer.context"]),
        steps,
        adapted,
      });
    }

    const executeComposer =
      options.executeComposer ?? executeProjectExecutionComposer;
    const execution = await executeComposer(inputForComposer);
    return Object.freeze({
      kind: "COMPOSER_RESULT" as const,
      status: execution.status,
      steps,
      adapted,
      execution,
    });
  } catch (error) {
    return Object.freeze({
      kind: "ADAPTER_FAILURE" as const,
      status: "FAILED" as const,
      ...(steps === undefined ? {} : { steps }),
      ...(adapted === undefined ? {} : { adapted }),
      error: Object.freeze({
        message: error instanceof Error ? error.message : "PASO 7 execution failed",
        path: "paso7.execution",
      }),
    });
  }
}
