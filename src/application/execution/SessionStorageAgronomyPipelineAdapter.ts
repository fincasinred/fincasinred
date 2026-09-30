import type { ProjectModel } from "../../domain/project/ProjectModel.js";
import type { ExecutionIdentity } from "./ExecutionIdentity.js";
import {
  executeAgronomyPipeline,
  type AgronomyPipelineInput,
  type AgronomyPipelineResult,
} from "./AgronomyPipeline.js";
import {
  createProjectTechnicalDataFromSteps,
  type ProjectStepsAdapterResult,
  type ProjectStepsInput,
} from "./ProjectStepsTechnicalDataAdapter.js";
import type { AgronomyProjectExecutionSnapshotInput } from "./ProjectAgronomyExecutionSnapshot.js";
import {
  composeAgronomyPipelineInputs,
  type AgronomyPipelineInputSources,
  type AgronomyPipelineExternalInputs,
} from "./AgronomyPipelineInputComposition.js";

export const PASO_STORAGE_KEYS = Object.freeze([
  "fincasinred_paso1",
  "fincasinred_paso2",
  "fincasinred_paso3",
  "fincasinred_paso4",
  "fincasinred_paso5",
  "fincasinred_paso6",
] as const);

export type PasoStorageKey = (typeof PASO_STORAGE_KEYS)[number];

export interface SessionStorageReader {
  readonly getItem: (key: string) => string | null;
}

export interface AgronomyPipelineContextInput {
  readonly project?: ProjectModel;
  readonly identity?: Partial<ExecutionIdentity>;
  readonly configurationRef?: string;
  readonly sourceRefs?: readonly string[];
  readonly inputRefs?: readonly string[];
  readonly period?: AgronomyProjectExecutionSnapshotInput["period"];
  readonly effectiveRainfallContract?:
    AgronomyProjectExecutionSnapshotInput["effectiveRainfallContract"];
  readonly irrigationSystemEfficiency?:
    AgronomyProjectExecutionSnapshotInput["irrigationSystemEfficiency"];
  readonly agronomicInputs?: AgronomyPipelineInputSources;
  readonly externalAgronomicInputs?: AgronomyPipelineExternalInputs;
  readonly monthlyEstimation?: AgronomyProjectExecutionSnapshotInput["monthlyEstimation"];
  readonly conditions?: AgronomyProjectExecutionSnapshotInput["conditions"];
  readonly calculationId?: string;
  readonly resultVersion?: string;
  readonly finalValueRefs?: readonly string[];
}

export interface SessionStorageAgronomyPipelineInput {
  readonly storage: SessionStorageReader;
  readonly context?: AgronomyPipelineContextInput;
  readonly execute?: (
    input: AgronomyPipelineInput,
  ) => Promise<Readonly<AgronomyPipelineResult>>;
}

export interface PendingAgronomyPipelinePreparation {
  readonly status: "PENDING";
  readonly missingFields: readonly string[];
  readonly invalidStorageKeys: readonly PasoStorageKey[];
  readonly steps?: ProjectStepsInput;
  readonly adapted?: Readonly<ProjectStepsAdapterResult>;
  readonly pendingAgronomyInputs?: Readonly<Record<string, readonly string[]>>;
}

export interface ReadyAgronomyPipelinePreparation {
  readonly status: "READY";
  readonly input: AgronomyPipelineInput;
  readonly adapted: Readonly<ProjectStepsAdapterResult>;
}

export type AgronomyPipelinePreparation =
  | PendingAgronomyPipelinePreparation
  | ReadyAgronomyPipelinePreparation;

export type SessionStorageAgronomyPipelineResult =
  | PendingAgronomyPipelinePreparation
  | {
      readonly status: "COMPLETED";
      readonly result: Readonly<AgronomyPipelineResult>;
    };

const REQUIRED_TECHNICAL_PATHS = Object.freeze([
  "agronomy.inputs.eto",
  "agronomy.inputs.kc",
  "agronomy.inputs.rainfall",
  "agronomy.inputs.effectiveRainfallObserved",
] as const);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function mergeTechnicalData(
  existing: ProjectModel["technicalData"],
  adapted: ProjectModel["technicalData"],
  values: readonly unknown[],
): NonNullable<ProjectModel["technicalData"]> {
  const merged: Record<string, unknown> = { ...(existing ?? {}) };

  for (const [key, adaptedValue] of Object.entries(adapted ?? {})) {
    const existingValue = merged[key];
    merged[key] = isPlainRecord(existingValue) && isPlainRecord(adaptedValue)
      ? { ...existingValue, ...adaptedValue }
      : adaptedValue;
  }

  merged.values = Object.freeze([...values]);
  return merged as NonNullable<ProjectModel["technicalData"]>;
}

function readSteps(storage: SessionStorageReader): {
  readonly steps: ProjectStepsInput;
  readonly invalidStorageKeys: readonly PasoStorageKey[];
} {
  const steps: Record<string, unknown> = {};
  const invalidStorageKeys: PasoStorageKey[] = [];

  for (const key of PASO_STORAGE_KEYS) {
    const raw = storage.getItem(key);
    if (raw === null) {
      invalidStorageKeys.push(key);
      continue;
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isPlainRecord(parsed)) {
        invalidStorageKeys.push(key);
        continue;
      }

      steps[`step${key.at(-1)}`] = parsed;
    } catch {
      invalidStorageKeys.push(key);
    }
  }

  return {
    steps: steps as ProjectStepsInput,
    invalidStorageKeys: Object.freeze(invalidStorageKeys),
  };
}

function hasTechnicalPath(
  values: readonly unknown[],
  path: string,
): boolean {
  return values.some((value) =>
    isPlainRecord(value) &&
    isPlainRecord(value.identity) &&
    value.identity.path === path
  );
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function missingContextFields(
  context: AgronomyPipelineContextInput | undefined,
  composed: ReturnType<typeof composeAgronomyPipelineInputs>,
): string[] {
  const missing: string[] = [];
  const identity = context?.identity;

  if (context?.project === undefined) missing.push("project");
  for (const field of [
    "executionId",
    "fingerprint",
    "engineVersion",
    "rulesVersion",
    "createdAt",
  ] as const) {
    if (!nonEmptyString(identity?.[field])) missing.push(`identity.${field}`);
  }
  if (!nonEmptyString(context?.configurationRef)) missing.push("configurationRef");
  if (context?.sourceRefs === undefined) missing.push("sourceRefs");
  if (context?.inputRefs === undefined) missing.push("inputRefs");
  if (context?.period === undefined && composed.period === undefined) {
    missing.push("period");
  }
  if (context?.effectiveRainfallContract === undefined) {
    missing.push("effectiveRainfallContract");
  }
  if (
    context?.irrigationSystemEfficiency === undefined &&
    composed.irrigationSystemEfficiency === undefined
  ) {
    missing.push("irrigationSystemEfficiency");
  }
  if (!nonEmptyString(context?.calculationId)) missing.push("calculationId");
  if (!nonEmptyString(context?.resultVersion)) missing.push("resultVersion");

  return missing;
}

export function prepareAgronomyPipelineFromSessionStorage(
  input: SessionStorageAgronomyPipelineInput,
): AgronomyPipelinePreparation {
  const { steps, invalidStorageKeys } = readSteps(input.storage);
  const adapted = createProjectTechnicalDataFromSteps(steps);
  const suppliedValues = input.context?.project?.technicalData?.values ?? [];
  const adaptedValues = adapted.technicalData.values ?? [];
  const composed = composeAgronomyPipelineInputs(
    [...suppliedValues, ...adaptedValues],
    input.context?.agronomicInputs,
    input.context?.externalAgronomicInputs,
  );
  const values = composed.values;
  const pendingAgronomyInputs = Object.fromEntries(
    composed.pendingInputs.map(({ input: inputName, missingFields }) => [
      inputName,
      missingFields,
    ]),
  );
  const missingFields = [
    ...invalidStorageKeys.map((key) => `storage.${key}`),
    ...adapted.pendingEngineInputs,
    ...REQUIRED_TECHNICAL_PATHS.filter(
      (path) => !hasTechnicalPath(values, path),
    ),
    ...missingContextFields(input.context, composed),
    ...composed.pendingInputs.flatMap(({ input: inputName, missingFields: fields }) =>
      fields.map((field) => `agronomicInputs.${inputName}.${field}`),
    ),
  ];

  if (
    adapted.irrigationSystem === undefined &&
    input.context?.irrigationSystemEfficiency === undefined
  ) {
    missingFields.push("irrigationSystemEfficiency.irrigationSystem");
  }

  if (missingFields.length > 0) {
    return Object.freeze({
      status: "PENDING",
      missingFields: Object.freeze([...new Set(missingFields)]),
      invalidStorageKeys,
      steps,
      adapted,
      ...(Object.keys(pendingAgronomyInputs).length === 0
        ? {}
        : { pendingAgronomyInputs }),
    });
  }

  const context = input.context as Required<
    Omit<AgronomyPipelineContextInput, "monthlyEstimation" | "conditions" | "finalValueRefs">
  > & Pick<AgronomyPipelineContextInput, "monthlyEstimation" | "conditions" | "finalValueRefs">;
  const project: ProjectModel = {
    ...context.project,
    technicalData: mergeTechnicalData(
      context.project.technicalData,
      adapted.technicalData,
      values,
    ),
  };

  return Object.freeze({
    status: "READY",
    adapted,
    input: {
      steps,
      project,
      identity: context.identity as ExecutionIdentity,
      configurationRef: context.configurationRef,
      sourceRefs: context.sourceRefs,
      inputRefs: context.inputRefs,
      period: context.period ?? composed.period,
      effectiveRainfallContract: context.effectiveRainfallContract,
      irrigationSystemEfficiency:
        context.irrigationSystemEfficiency ?? composed.irrigationSystemEfficiency,
      agronomicInputs: context.agronomicInputs,
      externalAgronomicInputs: context.externalAgronomicInputs,
      ...(context.monthlyEstimation === undefined
        ? {}
        : { monthlyEstimation: context.monthlyEstimation }),
      ...(context.conditions === undefined ? {} : { conditions: context.conditions }),
      calculationId: context.calculationId,
      resultVersion: context.resultVersion,
      ...(context.finalValueRefs === undefined
        ? {}
        : { finalValueRefs: context.finalValueRefs }),
    },
  });
}

export async function executeAgronomyPipelineFromSessionStorage(
  input: SessionStorageAgronomyPipelineInput,
): Promise<SessionStorageAgronomyPipelineResult> {
  const preparation = prepareAgronomyPipelineFromSessionStorage(input);
  if (preparation.status === "PENDING") return preparation;

  const execute = input.execute ?? executeAgronomyPipeline;
  return {
    status: "COMPLETED",
    result: await execute(preparation.input),
  };
}