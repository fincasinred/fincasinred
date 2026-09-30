import {
  createGrossNeedEvaluationInput,
  evaluateGrossNeed,
  type GrossNeedEvaluationInput,
} from "../../../engine/domain/agronomy/GrossNeedEvaluation.js";
import { AGRONOMY_NET_NEED_RESULT_PATH } from "../../../engine/domain/agronomy/NetNeedEvaluation.js";
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
import type { IrrigationSystemEfficiencyContract } from "../../../engine/domain/agronomy/IrrigationSystemEfficiencyContract.js";

export const AGRONOMY_GROSS_NEED_MODULE_REF = "module.agronomy.gross-need";

export interface AgronomyGrossNeedModuleInput extends GrossNeedEvaluationInput {}

export class AgronomyGrossNeedModuleTechnicalError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "AgronomyGrossNeedModuleTechnicalError";
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
    code: "grossNeed.dependency.missing",
    message: `${path} dependency result is required`,
    path,
  });
}

function parseIrrigationSystemEfficiency(
  value: unknown,
): IrrigationSystemEfficiencyContract {
  if (!isPlainRecord(value)) {
    throw new AgronomyGrossNeedModuleTechnicalError(
      "effectiveParameters.irrigationSystemEfficiency is required",
    );
  }

  return value as unknown as IrrigationSystemEfficiencyContract;
}

export function createAgronomyGrossNeedModuleInput(
  input: AgronomyGrossNeedModuleInput,
): Readonly<AgronomyGrossNeedModuleInput> {
  return createGrossNeedEvaluationInput(input);
}

function parseAgronomyGrossNeedModuleInput(
  effectiveParameters: unknown,
  netNeed: AgronomyGrossNeedModuleInput["netNeed"],
): Readonly<AgronomyGrossNeedModuleInput> {
  if (!isPlainRecord(effectiveParameters)) {
    throw new AgronomyGrossNeedModuleTechnicalError(
      "effectiveParameters must be a plain object",
    );
  }

  try {
    return createAgronomyGrossNeedModuleInput({
      netNeed,
      irrigationSystemEfficiency: parseIrrigationSystemEfficiency(
        effectiveParameters.irrigationSystemEfficiency,
      ),
    });
  } catch (error) {
    if (error instanceof Error) {
      throw new AgronomyGrossNeedModuleTechnicalError(error.message);
    }

    throw error;
  }
}

export function createAgronomyGrossNeedIntermediateResult(
  executionId: string,
  input: AgronomyGrossNeedModuleInput,
): Readonly<IntermediateResult> {
  const evaluation = evaluateGrossNeed(input);

  if (evaluation.kind !== "RESOLVED") {
    throw new AgronomyGrossNeedModuleTechnicalError(
      "gross need evaluation did not resolve a numeric result",
    );
  }

  return createIntermediateResult({
    executionId,
    methodRef: evaluation.methodRef,
    dependencyRefs: evaluation.dependencyRefs,
    value: evaluation.technicalValue,
  });
}

export function createAgronomyGrossNeedModuleExecutor(): Readonly<ModuleExecutor> {
  return Object.freeze({
    async execute(
      input: Readonly<ModuleExecutorInput>,
    ): Promise<Readonly<ModuleExecutionResult>> {
      const validatedInput = createModuleExecutorInput(input);

      if (validatedInput.moduleRef !== AGRONOMY_GROSS_NEED_MODULE_REF) {
        throw new AgronomyGrossNeedModuleTechnicalError(
          `moduleRef must be ${AGRONOMY_GROSS_NEED_MODULE_REF}`,
        );
      }

      const netNeedResult = findIntermediateResultByPath(
        validatedInput.dependencyResults,
        AGRONOMY_NET_NEED_RESULT_PATH,
      );

      if (netNeedResult === undefined) {
        return createModuleExecutionResult(
          {
            status: "BLOCKED",
            blockingIssues: [missingDependencyIssue(AGRONOMY_NET_NEED_RESULT_PATH)],
          },
          validatedInput.executionSnapshot,
        );
      }

      const moduleInput = parseAgronomyGrossNeedModuleInput(
        validatedInput.executionSnapshot.effectiveParameters,
        netNeedResult.value,
      );

      const evaluation = evaluateGrossNeed(moduleInput);

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
