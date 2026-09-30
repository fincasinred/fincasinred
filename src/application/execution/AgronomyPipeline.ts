import type { ProjectModel } from "../../domain/project/ProjectModel.js";
import type { ProjectStepsInput } from "./ProjectStepsTechnicalDataAdapter.js";
import { createProjectTechnicalDataFromSteps } from "./ProjectStepsTechnicalDataAdapter.js";
import {
  createAgronomyProjectExecutionSnapshot,
  type AgronomyProjectExecutionSnapshotInput,
} from "./ProjectAgronomyExecutionSnapshot.js";
import { createAgronomyExecutionPlan, createAgronomyExecutionRegistry } from "./AgronomyExecutionAssembly.js";
import { createInMemoryOrchestrator } from "./Orchestrator.js";
import { createTechnicalResult, type TechnicalResult } from "./TechnicalResult.js";
import { DeterministicNormalizationEngine } from "../normalization/NormalizationEngine.js";
import { DeterministicValidationEngine } from "../validation/ValidationEngine.js";
import { ValidationStatus } from "../../domain/shared/ValidationStatus.js";
import {
  composeAgronomyPipelineInputs,
  type AgronomyPipelineInputSources,
  type AgronomyPipelineExternalInputs,
} from "./AgronomyPipelineInputComposition.js";

export interface AgronomyPipelineInput
  extends Omit<AgronomyProjectExecutionSnapshotInput, "technicalData"> {
  readonly steps: ProjectStepsInput;
  readonly project: ProjectModel;
  readonly calculationId: string;
  readonly resultVersion: string;
  readonly finalValueRefs?: readonly string[];
  readonly agronomicInputs?: AgronomyPipelineInputSources;
  readonly externalAgronomicInputs?: AgronomyPipelineExternalInputs;
}

export interface AgronomyPipelineResult {
  readonly normalizedModel: Readonly<ProjectModel>;
  readonly validation: ReturnType<DeterministicValidationEngine["validate"]>;
  readonly technicalResult: Readonly<TechnicalResult>;
}

function resultStatus(state: string): ValidationStatus {
  return state === "COMPLETED" ? ValidationStatus.VALIDATED : ValidationStatus.BLOCKED;
}

function technicalValuePath(value: unknown): string | undefined {
  if (
    value === null ||
    typeof value !== "object" ||
    !("identity" in value) ||
    value.identity === null ||
    typeof value.identity !== "object" ||
    !("path" in value.identity) ||
    typeof value.identity.path !== "string"
  ) {
    return undefined;
  }

  return value.identity.path;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function mergeRecords(
  existing: Record<string, unknown>,
  adapted: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...existing };

  for (const [key, adaptedValue] of Object.entries(adapted)) {
    const existingValue = merged[key];
    merged[key] = isPlainRecord(existingValue) && isPlainRecord(adaptedValue)
      ? mergeRecords(existingValue, adaptedValue)
      : adaptedValue;
  }

  return merged;
}

function mergeTechnicalData(
  existing: ProjectModel["technicalData"],
  adapted: ProjectModel["technicalData"],
  values: readonly unknown[],
): NonNullable<ProjectModel["technicalData"]> {
  const merged: Record<string, unknown> = { ...(existing ?? {}) };

  for (const [key, adaptedValue] of Object.entries(adapted ?? {})) {
    const existingValue = merged[key];
    if (isPlainRecord(existingValue) && isPlainRecord(adaptedValue)) {
      merged[key] = mergeRecords(existingValue, adaptedValue);
    } else if (key !== "values") {
      merged[key] = adaptedValue;
    }
  }

  if (values.length > 0) {
    merged.values = Object.freeze([...values]);
  }

  return merged as NonNullable<ProjectModel["technicalData"]>;
}

export async function executeAgronomyPipeline(
  input: AgronomyPipelineInput,
): Promise<Readonly<AgronomyPipelineResult>> {
  const adapted = createProjectTechnicalDataFromSteps(input.steps);
  const suppliedValues = input.project.technicalData?.values ?? [];
  const adaptedValues = adapted.technicalData.values ?? [];
  const composed = composeAgronomyPipelineInputs(
    [...suppliedValues, ...adaptedValues],
    input.agronomicInputs,
    input.externalAgronomicInputs,
  );

  if (composed.pendingInputs.length > 0) {
    const missingFields = composed.pendingInputs.flatMap(
      ({ input: inputName, missingFields }) =>
        missingFields.map((field) => `agronomicInputs.${inputName}.${field}`),
    );
    throw new Error(
      `Agronomy pipeline cannot execute pending inputs: ${missingFields.join(", ")}`,
    );
  }

  const mergedValues = [...suppliedValues];
  for (const adaptedValue of adaptedValues) {
    const adaptedPath = technicalValuePath(adaptedValue);
    const existingIndex = adaptedPath === undefined
      ? -1
      : mergedValues.findIndex((value) => technicalValuePath(value) === adaptedPath);

    if (existingIndex === -1) {
      mergedValues.push(adaptedValue);
    } else {
      mergedValues[existingIndex] = adaptedValue;
    }
  }

  for (const composedValue of composed.values) {
    const composedPath = technicalValuePath(composedValue);
    const existingIndex = mergedValues.findIndex(
      (value) =>
        composedPath !== undefined && technicalValuePath(value) === composedPath,
    );

    if (existingIndex === -1) {
      mergedValues.push(composedValue);
    } else {
      mergedValues[existingIndex] = composedValue;
    }
  }

  const sourceRefs = [
    ...new Set([...input.sourceRefs, ...composed.sourceRefs]),
  ];
  const project: ProjectModel = {
    ...input.project,
    technicalData: mergeTechnicalData(
      input.project.technicalData,
      adapted.technicalData,
      mergedValues,
    ),
  };
  const normalized = new DeterministicNormalizationEngine().normalize(project);
  const validation = new DeterministicValidationEngine().validate(normalized.model);

  if (validation.status === ValidationStatus.INVALID || validation.model === undefined) {
    throw new Error("Agronomy pipeline cannot execute an invalid project");
  }

  const snapshot = createAgronomyProjectExecutionSnapshot({
    ...input,
    sourceRefs,
    technicalData: validation.model.technicalData,
    ...(input.agronomicInputs === undefined
      ? {}
      : { agronomicInputs: undefined }),
  });
  const includeSectorVolume = snapshot.effectiveParameters.sectorAreaM2 !== undefined;
  const orchestrator = await createInMemoryOrchestrator().execute(
    {
      mode: "FULL",
      executionPlan: createAgronomyExecutionPlan({ includeSectorVolume }),
      executionSnapshot: snapshot,
    },
    createAgronomyExecutionRegistry(),
  );

  return Object.freeze({
    normalizedModel: normalized.model,
    validation,
    technicalResult: createTechnicalResult({
      calculationId: input.calculationId,
      executionId: input.identity.executionId,
      configurationRef: input.configurationRef,
      engineVersion: input.identity.engineVersion,
      rulesVersion: input.identity.rulesVersion,
      resultVersion: input.resultVersion,
      createdAt: input.identity.createdAt,
      status: resultStatus(orchestrator.executionState),
      completeness: "PARTIAL",
      intermediateResults: orchestrator.intermediateResults,
      ...(input.finalValueRefs === undefined
        ? {}
        : { finalValueRefs: input.finalValueRefs }),
    }),
  });
}