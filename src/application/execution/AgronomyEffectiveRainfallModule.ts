import {
  createEffectiveRainfallEvaluationInput,
  evaluateEffectiveRainfall,
  type EffectiveRainfallEvaluationInput,
} from "../../../engine/domain/agronomy/EffectiveRainfallEvaluation.js";
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
import {
  createIdentifiedTechnicalValue,
  isTechnicalValueEvidence,
} from "../../domain/shared/TechnicalValue.js";
import { Provenance } from "../../domain/shared/Provenance.js";
import { ValidationStatus } from "../../domain/shared/ValidationStatus.js";

export const AGRONOMY_EFFECTIVE_RAINFALL_MODULE_REF =
  "module.agronomy.effective-rainfall";

export interface AgronomyEffectiveRainfallModuleInput
  extends EffectiveRainfallEvaluationInput {}

export class AgronomyEffectiveRainfallModuleTechnicalError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "AgronomyEffectiveRainfallModuleTechnicalError";
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

function isProvenance(value: unknown): value is Provenance {
  return Object.values(Provenance).includes(value as Provenance);
}

function isValidationStatus(value: unknown): value is ValidationStatus {
  return Object.values(ValidationStatus).includes(value as ValidationStatus);
}

function parseIdentifiedTechnicalValue(value: unknown, fieldName: string) {
  if (!isPlainRecord(value)) {
    throw new AgronomyEffectiveRainfallModuleTechnicalError(
      `${fieldName} is required`,
    );
  }

  if (typeof value.value !== "number" || !Number.isFinite(value.value)) {
    throw new AgronomyEffectiveRainfallModuleTechnicalError(
      `${fieldName}.value must be finite`,
    );
  }

  if (!isNonEmptyString(value.unit)) {
    throw new AgronomyEffectiveRainfallModuleTechnicalError(
      `${fieldName}.unit is required`,
    );
  }

  if (!isProvenance(value.provenance)) {
    throw new AgronomyEffectiveRainfallModuleTechnicalError(
      `${fieldName}.provenance is invalid`,
    );
  }

  if (!isValidationStatus(value.status)) {
    throw new AgronomyEffectiveRainfallModuleTechnicalError(
      `${fieldName}.status is invalid`,
    );
  }

  const identity = value.identity;

  if (!isPlainRecord(identity)) {
    throw new AgronomyEffectiveRainfallModuleTechnicalError(
      `${fieldName}.identity is required`,
    );
  }

  if (!isNonEmptyString(identity.field)) {
    throw new AgronomyEffectiveRainfallModuleTechnicalError(
      `${fieldName}.identity.field is required`,
    );
  }

  if (!isNonEmptyString(identity.path)) {
    throw new AgronomyEffectiveRainfallModuleTechnicalError(
      `${fieldName}.identity.path is required`,
    );
  }

  if (identity.domain !== undefined && !isNonEmptyString(identity.domain)) {
    throw new AgronomyEffectiveRainfallModuleTechnicalError(
      `${fieldName}.identity.domain is invalid`,
    );
  }

  if (value.evidence !== undefined && !isTechnicalValueEvidence(value.evidence)) {
    throw new AgronomyEffectiveRainfallModuleTechnicalError(
      `${fieldName}.evidence is invalid`,
    );
  }

  try {
    return createIdentifiedTechnicalValue({
      value: value.value,
      unit: value.unit,
      provenance: value.provenance,
      status: value.status,
      ...(value.evidence === undefined ? {} : { evidence: value.evidence }),
      identity: {
        field: identity.field,
        ...(identity.domain === undefined ? {} : { domain: identity.domain }),
        path: identity.path,
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      throw new AgronomyEffectiveRainfallModuleTechnicalError(
        `${fieldName} ${error.message}`,
      );
    }

    throw error;
  }
}

function parsePeriod(value: unknown) {
  if (!isPlainRecord(value)) {
    throw new AgronomyEffectiveRainfallModuleTechnicalError(
      "effectiveParameters.period is required",
    );
  }

  if (!isNonEmptyString(value.start)) {
    throw new AgronomyEffectiveRainfallModuleTechnicalError(
      "effectiveParameters.period.start is required",
    );
  }

  if (!isNonEmptyString(value.end)) {
    throw new AgronomyEffectiveRainfallModuleTechnicalError(
      "effectiveParameters.period.end is required",
    );
  }

  if (value.timezone !== undefined && !isNonEmptyString(value.timezone)) {
    throw new AgronomyEffectiveRainfallModuleTechnicalError(
      "effectiveParameters.period.timezone is invalid",
    );
  }

  return Object.freeze({
    start: value.start,
    end: value.end,
    ...(value.timezone === undefined ? {} : { timezone: value.timezone }),
  });
}

function parseOptionalObject<T>(value: unknown, fieldName: string): T | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isPlainRecord(value)) {
    throw new AgronomyEffectiveRainfallModuleTechnicalError(
      `${fieldName} must be a plain object`,
    );
  }

  return value as T;
}

export function createAgronomyEffectiveRainfallModuleInput(
  input: AgronomyEffectiveRainfallModuleInput,
): Readonly<AgronomyEffectiveRainfallModuleInput> {
  return createEffectiveRainfallEvaluationInput(input);
}

function parseAgronomyEffectiveRainfallModuleInput(
  value: unknown,
  conditions?: Readonly<Record<string, unknown>>,
): Readonly<AgronomyEffectiveRainfallModuleInput> {
  if (!isPlainRecord(value)) {
    throw new AgronomyEffectiveRainfallModuleTechnicalError(
      "effectiveParameters must be a plain object",
    );
  }

  try {
    const contract = parseOptionalObject<
      AgronomyEffectiveRainfallModuleInput["contract"]
    >(value.contract, "effectiveParameters.contract");
    const sourceContract = parseOptionalObject<
      AgronomyEffectiveRainfallModuleInput["sourceContract"]
    >(value.sourceContract, "effectiveParameters.sourceContract");
    const temporalBalance = parseOptionalObject<
      AgronomyEffectiveRainfallModuleInput["temporalBalance"]
    >(value.temporalBalance, "effectiveParameters.temporalBalance");
    const excess = parseOptionalObject<
      AgronomyEffectiveRainfallModuleInput["excess"]
    >(value.excess, "effectiveParameters.excess");
    const monthlyEstimation = parseOptionalObject<
      AgronomyEffectiveRainfallModuleInput["monthlyEstimation"]
    >(value.monthlyEstimation, "effectiveParameters.monthlyEstimation");

    return createAgronomyEffectiveRainfallModuleInput({
      rainfall: parseIdentifiedTechnicalValue(
        value.rainfall,
        "effectiveParameters.rainfall",
      ),
      period: parsePeriod(value.period),
      ...(contract === undefined ? {} : { contract }),
      ...(sourceContract === undefined ? {} : { sourceContract }),
      ...(temporalBalance === undefined ? {} : { temporalBalance }),
      ...(excess === undefined ? {} : { excess }),
      ...(value.effectiveRainfall === undefined
        ? {}
        : {
            effectiveRainfall: parseIdentifiedTechnicalValue(
              value.effectiveRainfall,
              "effectiveParameters.effectiveRainfall",
            ),
          }),
      ...(monthlyEstimation === undefined ? {} : { monthlyEstimation }),
      ...(conditions === undefined ? {} : { conditions }),
    });
  } catch (error) {
    if (error instanceof Error) {
      throw new AgronomyEffectiveRainfallModuleTechnicalError(error.message);
    }

    throw error;
  }
}

export function createAgronomyEffectiveRainfallIntermediateResult(
  executionId: string,
  input: AgronomyEffectiveRainfallModuleInput,
): Readonly<IntermediateResult> {
  const evaluation = evaluateEffectiveRainfall(input);

  if (evaluation.kind !== "RESOLVED") {
    throw new AgronomyEffectiveRainfallModuleTechnicalError(
      "effective rainfall evaluation did not resolve a numeric result",
    );
  }

  return createIntermediateResult({
    executionId,
    methodRef: evaluation.methodRef,
    dependencyRefs: evaluation.dependencyRefs,
    value: evaluation.technicalValue,
  });
}

export function createAgronomyEffectiveRainfallModuleExecutor(): Readonly<ModuleExecutor> {
  return Object.freeze({
    async execute(
      input: Readonly<ModuleExecutorInput>,
    ): Promise<Readonly<ModuleExecutionResult>> {
      const validatedInput = createModuleExecutorInput(input);

      if (validatedInput.moduleRef !== AGRONOMY_EFFECTIVE_RAINFALL_MODULE_REF) {
        throw new AgronomyEffectiveRainfallModuleTechnicalError(
          `moduleRef must be ${AGRONOMY_EFFECTIVE_RAINFALL_MODULE_REF}`,
        );
      }

      const moduleInput = parseAgronomyEffectiveRainfallModuleInput(
        validatedInput.executionSnapshot.effectiveParameters,
        validatedInput.executionSnapshot.conditions,
      );

      const evaluation = evaluateEffectiveRainfall(moduleInput);

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
