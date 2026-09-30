import {
  evaluateIrrigationDuration,
  IRRIGATION_DURATION_METHOD_REF,
  irrigationDurationResultPath,
  hydraulicSectorFlowResultPath,
  type IrrigationDurationEvaluationInput,
} from "../../../engine/domain/hydraulic/IrrigationDurationEvaluation.js";
import { AGRONOMY_SECTOR_VOLUME_RESULT_PATH } from "../../../engine/domain/agronomy/SectorVolumeEvaluation.js";
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

export const IRRIGATION_DURATION_MODULE_REF =
  "module.irrigation.duration:";

export class IrrigationDurationModuleTechnicalError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "IrrigationDurationModuleTechnicalError";
  }
}

function sectorIdFromModuleRef(moduleRef: string): string {
  const sectorId = moduleRef.slice(IRRIGATION_DURATION_MODULE_REF.length);
  if (sectorId.trim().length === 0) {
    throw new IrrigationDurationModuleTechnicalError(
      `moduleRef must include a sectorId after ${IRRIGATION_DURATION_MODULE_REF}`,
    );
  }
  return sectorId;
}

function missingDependencyIssue(path: string): Readonly<ValidationIssue> {
  return Object.freeze({
    code: "irrigationDuration.dependency.missing",
    message: `${path} dependency result is required`,
    path,
  });
}

function evaluationInput(
  sectorId: string,
  dependencyResults: readonly IntermediateResult[],
): IrrigationDurationEvaluationInput | undefined {
  const sectorVolume = findIntermediateResultByPath(
    dependencyResults,
    AGRONOMY_SECTOR_VOLUME_RESULT_PATH,
  );
  const sectorFlow = findIntermediateResultByPath(
    dependencyResults,
    hydraulicSectorFlowResultPath(sectorId),
  );

  if (sectorVolume === undefined || sectorFlow === undefined) {
    return undefined;
  }

  return {
    sectorId,
    sectorVolume: sectorVolume.value,
    sectorFlow: sectorFlow.value,
  };
}

export function createIrrigationDurationIntermediateResult(
  executionId: string,
  input: IrrigationDurationEvaluationInput,
): Readonly<IntermediateResult> {
  const evaluation = evaluateIrrigationDuration(input);

  return createIntermediateResult({
    executionId,
    methodRef: IRRIGATION_DURATION_METHOD_REF,
    dependencyRefs: evaluation.dependencyRefs,
    value: evaluation.technicalValue,
  });
}

export function createIrrigationDurationModuleExecutor(): Readonly<ModuleExecutor> {
  return Object.freeze({
    async execute(
      input: Readonly<ModuleExecutorInput>,
    ): Promise<Readonly<ModuleExecutionResult>> {
      const validatedInput = createModuleExecutorInput(input);

      if (!validatedInput.moduleRef.startsWith(IRRIGATION_DURATION_MODULE_REF)) {
        throw new IrrigationDurationModuleTechnicalError(
          `moduleRef must start with ${IRRIGATION_DURATION_MODULE_REF}`,
        );
      }

      const sectorId = sectorIdFromModuleRef(validatedInput.moduleRef);
      const evaluationInputValue = evaluationInput(
        sectorId,
        validatedInput.dependencyResults,
      );

      if (evaluationInputValue === undefined) {
        const volumeResult = findIntermediateResultByPath(
          validatedInput.dependencyResults,
          AGRONOMY_SECTOR_VOLUME_RESULT_PATH,
        );
        const flowResult = findIntermediateResultByPath(
          validatedInput.dependencyResults,
          hydraulicSectorFlowResultPath(sectorId),
        );
        const missingPaths = [
          volumeResult === undefined ? AGRONOMY_SECTOR_VOLUME_RESULT_PATH : undefined,
          flowResult === undefined ? hydraulicSectorFlowResultPath(sectorId) : undefined,
        ].filter((path): path is string => path !== undefined);

        return createModuleExecutionResult(
          {
            status: "BLOCKED",
            blockingIssues: missingPaths.map(missingDependencyIssue),
          },
          validatedInput.executionSnapshot,
        );
      }

      return createModuleExecutionResult(
        {
          status: "COMPLETED",
          intermediateResults: [
            createIrrigationDurationIntermediateResult(
              validatedInput.executionSnapshot.identity.executionId,
              evaluationInputValue,
            ),
          ],
        },
        validatedInput.executionSnapshot,
      );
    },
  });
}

export { irrigationDurationResultPath };
