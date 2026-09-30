import {
  evaluateSectorFlow,
  HYDRAULIC_SECTOR_FLOW_METHOD_REF,
  type SectorFlowEvaluationInput,
} from "../../../engine/domain/hydraulic/SectorFlowEvaluation.js";
import {
  createIntermediateResult,
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

export const HYDRAULIC_SECTOR_FLOW_MODULE_REF =
  "module.hydraulic.sector-flow:";

export function hydraulicSectorFlowResultPath(sectorId: string): string {
  return `hydraulic.${sectorId}.sector.flow`;
}

function sectorIdFromModuleRef(moduleRef: string): string {
  const sectorId = moduleRef.slice(HYDRAULIC_SECTOR_FLOW_MODULE_REF.length);

  if (sectorId.trim().length === 0) {
    throw new HydraulicSectorFlowModuleTechnicalError(
      `moduleRef must include a sectorId after ${HYDRAULIC_SECTOR_FLOW_MODULE_REF}`,
    );
  }

  return sectorId;
}

export class HydraulicSectorFlowModuleTechnicalError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "HydraulicSectorFlowModuleTechnicalError";
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

function parseInput(effectiveParameters: unknown): SectorFlowEvaluationInput {
  if (!isPlainRecord(effectiveParameters)) {
    throw new HydraulicSectorFlowModuleTechnicalError(
      "effectiveParameters must be a plain object",
    );
  }

  if (!isPlainRecord(effectiveParameters.sectorFlow)) {
    throw new HydraulicSectorFlowModuleTechnicalError(
      "effectiveParameters.sectorFlow is required",
    );
  }

  return effectiveParameters.sectorFlow as unknown as SectorFlowEvaluationInput;
}

function evaluationIssues(
  error: unknown,
): readonly Readonly<ValidationIssue>[] {
  return Object.freeze([
    Object.freeze({
      code: "sectorFlow.input.invalid",
      message: error instanceof Error ? error.message : "sector flow input is invalid",
      path: "effectiveParameters.sectorFlow",
    }),
  ]);
}

export function createHydraulicSectorFlowIntermediateResult(
  executionId: string,
  input: SectorFlowEvaluationInput,
): Readonly<IntermediateResult> {
  const evaluation = evaluateSectorFlow(input);

  if (evaluation.kind !== "RESOLVED") {
    throw new HydraulicSectorFlowModuleTechnicalError(
      "sector flow evaluation did not resolve a numeric result",
    );
  }

  const value = {
    ...evaluation.technicalValue,
    identity: {
      ...evaluation.technicalValue.identity,
      path: hydraulicSectorFlowResultPath(input.sectorId),
    },
  } as const;

  return createIntermediateResult({
    executionId,
    methodRef: HYDRAULIC_SECTOR_FLOW_METHOD_REF,
    dependencyRefs: evaluation.dependencyRefs,
    value,
  });
}

export function createHydraulicSectorFlowModuleExecutor(): Readonly<ModuleExecutor> {
  return Object.freeze({
    async execute(
      input: Readonly<ModuleExecutorInput>,
    ): Promise<Readonly<ModuleExecutionResult>> {
      const validatedInput = createModuleExecutorInput(input);

      if (!validatedInput.moduleRef.startsWith(HYDRAULIC_SECTOR_FLOW_MODULE_REF)) {
        throw new HydraulicSectorFlowModuleTechnicalError(
          `moduleRef must start with ${HYDRAULIC_SECTOR_FLOW_MODULE_REF}`,
        );
      }

      let evaluation;
      try {
        evaluation = evaluateSectorFlow(
          parseInput(validatedInput.executionSnapshot.effectiveParameters),
        );
      } catch (error) {
        return createModuleExecutionResult(
          {
            status: "BLOCKED",
            blockingIssues: evaluationIssues(error),
          },
          validatedInput.executionSnapshot,
        );
      }

      if (evaluation.kind === "RESOLVED") {
        const sectorId = sectorIdFromModuleRef(validatedInput.moduleRef);
        if (sectorId !== evaluation.trace.sectorId) {
          throw new HydraulicSectorFlowModuleTechnicalError(
            "moduleRef sectorId must match effectiveParameters.sectorFlow.sectorId",
          );
        }

        const value = {
          ...evaluation.technicalValue,
          identity: {
            ...evaluation.technicalValue.identity,
            path: hydraulicSectorFlowResultPath(sectorId),
          },
        } as const;

        return createModuleExecutionResult(
          {
            status: "COMPLETED",
            intermediateResults: [
              createIntermediateResult({
                executionId: validatedInput.executionSnapshot.identity.executionId,
                methodRef: evaluation.methodRef,
                dependencyRefs: evaluation.dependencyRefs,
                value,
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