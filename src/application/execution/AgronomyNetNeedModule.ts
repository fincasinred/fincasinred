import {
  createNetNeedEvaluationInput,
  evaluateNetNeed,
  type NetNeedEvaluationInput,
} from "../../../engine/domain/agronomy/NetNeedEvaluation.js";
import { AGRONOMY_ETC_RESULT_PATH } from "../../../engine/domain/agronomy/EtcCalculation.js";
import { AGRONOMY_EFFECTIVE_RAINFALL_RESULT_PATH } from "../../../engine/domain/agronomy/EffectiveRainfallEvaluation.js";
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

export const AGRONOMY_NET_NEED_MODULE_REF = "module.agronomy.net-need";

export interface AgronomyNetNeedModuleInput extends NetNeedEvaluationInput {}

export class AgronomyNetNeedModuleTechnicalError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "AgronomyNetNeedModuleTechnicalError";
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function missingDependencyIssue(path: string): Readonly<ValidationIssue> {
  return Object.freeze({
    code: "netNeed.dependency.missing",
    message: `${path} dependency result is required`,
    path,
  });
}

function parsePeriod(value: unknown) {
  if (!isPlainRecord(value)) {
    throw new AgronomyNetNeedModuleTechnicalError(
      "effectiveParameters.period is required",
    );
  }

  if (!isNonEmptyString(value.start)) {
    throw new AgronomyNetNeedModuleTechnicalError(
      "effectiveParameters.period.start is required",
    );
  }

  if (!isNonEmptyString(value.end)) {
    throw new AgronomyNetNeedModuleTechnicalError(
      "effectiveParameters.period.end is required",
    );
  }

  if (value.timezone !== undefined && !isNonEmptyString(value.timezone)) {
    throw new AgronomyNetNeedModuleTechnicalError(
      "effectiveParameters.period.timezone is invalid",
    );
  }

  return Object.freeze({
    start: value.start,
    end: value.end,
    ...(value.timezone === undefined ? {} : { timezone: value.timezone }),
  });
}

export function createAgronomyNetNeedModuleInput(
  input: AgronomyNetNeedModuleInput,
): Readonly<AgronomyNetNeedModuleInput> {
  return createNetNeedEvaluationInput(input);
}

function parseAgronomyNetNeedModuleInput(
  effectiveParameters: unknown,
  etc: AgronomyNetNeedModuleInput["etc"],
  effectiveRainfall: AgronomyNetNeedModuleInput["effectiveRainfall"],
): Readonly<AgronomyNetNeedModuleInput> {
  if (!isPlainRecord(effectiveParameters)) {
    throw new AgronomyNetNeedModuleTechnicalError(
      "effectiveParameters must be a plain object",
    );
  }

  try {
    return createAgronomyNetNeedModuleInput({
      etc,
      effectiveRainfall,
      period: parsePeriod(effectiveParameters.period),
    });
  } catch (error) {
    if (error instanceof Error) {
      throw new AgronomyNetNeedModuleTechnicalError(error.message);
    }

    throw error;
  }
}

export function createAgronomyNetNeedIntermediateResult(
  executionId: string,
  input: AgronomyNetNeedModuleInput,
): Readonly<IntermediateResult> {
  const evaluation = evaluateNetNeed(input);

  if (evaluation.kind !== "RESOLVED") {
    throw new AgronomyNetNeedModuleTechnicalError(
      "net need evaluation did not resolve a numeric result",
    );
  }

  return createIntermediateResult({
    executionId,
    methodRef: evaluation.methodRef,
    dependencyRefs: evaluation.dependencyRefs,
    value: evaluation.technicalValue,
  });
}

export function createAgronomyNetNeedModuleExecutor(): Readonly<ModuleExecutor> {
  return Object.freeze({
    async execute(
      input: Readonly<ModuleExecutorInput>,
    ): Promise<Readonly<ModuleExecutionResult>> {
      const validatedInput = createModuleExecutorInput(input);

      if (validatedInput.moduleRef !== AGRONOMY_NET_NEED_MODULE_REF) {
        throw new AgronomyNetNeedModuleTechnicalError(
          "moduleRef must be " + AGRONOMY_NET_NEED_MODULE_REF,
        );
      }

      const etcResult = findIntermediateResultByPath(
        validatedInput.dependencyResults,
        AGRONOMY_ETC_RESULT_PATH,
      );
      const effectiveRainfallResult = findIntermediateResultByPath(
        validatedInput.dependencyResults,
        AGRONOMY_EFFECTIVE_RAINFALL_RESULT_PATH,
      );

      if (etcResult === undefined || effectiveRainfallResult === undefined) {
        return createModuleExecutionResult(
          {
            status: "BLOCKED",
            blockingIssues: [
              ...(etcResult === undefined
                ? [missingDependencyIssue(AGRONOMY_ETC_RESULT_PATH)]
                : []),
              ...(effectiveRainfallResult === undefined
                ? [missingDependencyIssue(AGRONOMY_EFFECTIVE_RAINFALL_RESULT_PATH)]
                : []),
            ],
          },
          validatedInput.executionSnapshot,
        );
      }

      const moduleInput = parseAgronomyNetNeedModuleInput(
        validatedInput.executionSnapshot.effectiveParameters,
        etcResult.value,
        effectiveRainfallResult.value,
      );

      const evaluation = evaluateNetNeed(moduleInput);

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
