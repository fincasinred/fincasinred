import {
  type SectorVolumeEvaluationInput,
  AGRONOMY_SECTOR_VOLUME_METHOD_REF,
  evaluateSectorVolume,
} from "../../../engine/domain/agronomy/SectorVolumeEvaluation.js";
import { AGRONOMY_GROSS_NEED_RESULT_PATH } from "../../../engine/domain/agronomy/GrossNeedEvaluation.js";
import {
  createIntermediateResult,
  findIntermediateResultByPath,
  type IntermediateResult,
} from "./IntermediateResult.js";
import {
  createModuleExecutionResult,
  createModuleExecutorInput,
  type ModuleExecutionResult,
  type ModuleExecutor,
  type ModuleExecutorInput,
} from "./ModuleExecutor.js";
import type { ValidationIssue } from "../validation/ValidationResult.js";

export const AGRONOMY_SECTOR_VOLUME_MODULE_REF =
  "module.agronomy.sector-volume";

export class AgronomySectorVolumeModuleTechnicalError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "AgronomySectorVolumeModuleTechnicalError";
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

function missingDependencyIssue(path: string): Readonly<ValidationIssue> {
  return Object.freeze({
    code: "sectorVolume.dependency.missing",
    message: `${path} dependency result is required`,
    path,
  });
}

function parseSectorArea(effectiveParameters: unknown): SectorVolumeEvaluationInput["sectorAreaM2"] {
  if (!isPlainRecord(effectiveParameters)) {
    throw new AgronomySectorVolumeModuleTechnicalError(
      "effectiveParameters must be a plain object",
    );
  }

  if (!isPlainRecord(effectiveParameters.sectorAreaM2)) {
    throw new AgronomySectorVolumeModuleTechnicalError(
      "effectiveParameters.sectorAreaM2 is required",
    );
  }

  return effectiveParameters.sectorAreaM2 as unknown as SectorVolumeEvaluationInput["sectorAreaM2"];
}

export function createAgronomySectorVolumeIntermediateResult(
  executionId: string,
  input: SectorVolumeEvaluationInput,
): Readonly<IntermediateResult> {
  const evaluation = evaluateSectorVolume(input);

  if (evaluation.kind !== "RESOLVED") {
    throw new AgronomySectorVolumeModuleTechnicalError(
      "sector volume evaluation did not resolve a numeric result",
    );
  }

  return createIntermediateResult({
    executionId,
    methodRef: AGRONOMY_SECTOR_VOLUME_METHOD_REF,
    dependencyRefs: evaluation.dependencyRefs,
    value: evaluation.technicalValue,
  });
}

export function createAgronomySectorVolumeModuleExecutor(): Readonly<ModuleExecutor> {
  return Object.freeze({
    async execute(
      input: Readonly<ModuleExecutorInput>,
    ): Promise<Readonly<ModuleExecutionResult>> {
      const validatedInput = createModuleExecutorInput(input);

      if (validatedInput.moduleRef !== AGRONOMY_SECTOR_VOLUME_MODULE_REF) {
        throw new AgronomySectorVolumeModuleTechnicalError(
          `moduleRef must be ${AGRONOMY_SECTOR_VOLUME_MODULE_REF}`,
        );
      }

      const grossNeedResult = findIntermediateResultByPath(
        validatedInput.dependencyResults,
        AGRONOMY_GROSS_NEED_RESULT_PATH,
      );

      if (grossNeedResult === undefined) {
        return createModuleExecutionResult(
          {
            status: "BLOCKED",
            blockingIssues: [missingDependencyIssue(AGRONOMY_GROSS_NEED_RESULT_PATH)],
          },
          validatedInput.executionSnapshot,
        );
      }

      const evaluation = evaluateSectorVolume({
        grossNeed: grossNeedResult.value,
        sectorAreaM2: parseSectorArea(
          validatedInput.executionSnapshot.effectiveParameters,
        ),
      });

      if (evaluation.kind === "RESOLVED") {
        return createModuleExecutionResult(
          {
            status: "COMPLETED",
            intermediateResults: [
              createIntermediateResult({
                executionId: validatedInput.executionSnapshot.identity.executionId,
                methodRef: evaluation.methodRef,
                dependencyRefs: evaluation.dependencyRefs,
                value: evaluation.technicalValue,
              }),
            ],
          },
          validatedInput.executionSnapshot,
        );
      }

      return createModuleExecutionResult(
        {
          status: "BLOCKED",
          blockingIssues: evaluation.issues,
        },
        validatedInput.executionSnapshot,
      );
    },
  });
}