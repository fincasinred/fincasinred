import {
  calculateEtc,
  createEtcCalculationInput,
  type EtcCalculationInput,
} from "../../../engine/domain/agronomy/EtcCalculation.js";
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

export const AGRONOMY_ETC_MODULE_REF = "module.agronomy.etc";

export interface AgronomyEtcModuleInput extends EtcCalculationInput {}

export class AgronomyEtcModuleTechnicalError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "AgronomyEtcModuleTechnicalError";
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

function parseIdentifiedTechnicalValue(
  value: unknown,
  fieldName: string,
) {
  if (!isPlainRecord(value)) {
    throw new AgronomyEtcModuleTechnicalError(`${fieldName} is required`);
  }

  if (typeof value.value !== "number" || !Number.isFinite(value.value)) {
    throw new AgronomyEtcModuleTechnicalError(`${fieldName}.value must be finite`);
  }

  if (!isNonEmptyString(value.unit)) {
    throw new AgronomyEtcModuleTechnicalError(`${fieldName}.unit is required`);
  }

  if (!isProvenance(value.provenance)) {
    throw new AgronomyEtcModuleTechnicalError(`${fieldName}.provenance is invalid`);
  }

  if (!isValidationStatus(value.status)) {
    throw new AgronomyEtcModuleTechnicalError(`${fieldName}.status is invalid`);
  }

  const identity = value.identity;

  if (!isPlainRecord(identity)) {
    throw new AgronomyEtcModuleTechnicalError(`${fieldName}.identity is required`);
  }

  if (!isNonEmptyString(identity.field)) {
    throw new AgronomyEtcModuleTechnicalError(`${fieldName}.identity.field is required`);
  }

  if (!isNonEmptyString(identity.path)) {
    throw new AgronomyEtcModuleTechnicalError(`${fieldName}.identity.path is required`);
  }

  if (identity.domain !== undefined && !isNonEmptyString(identity.domain)) {
    throw new AgronomyEtcModuleTechnicalError(`${fieldName}.identity.domain is invalid`);
  }

  if (
    value.evidence !== undefined &&
    !isTechnicalValueEvidence(value.evidence)
  ) {
    throw new AgronomyEtcModuleTechnicalError(`${fieldName}.evidence is invalid`);
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
      throw new AgronomyEtcModuleTechnicalError(`${fieldName} ${error.message}`);
    }

    throw error;
  }
}

export function createAgronomyEtcModuleInput(
  input: AgronomyEtcModuleInput,
): Readonly<AgronomyEtcModuleInput> {
  return createEtcCalculationInput(input);
}

function parseAgronomyEtcModuleInput(
  value: unknown,
): Readonly<AgronomyEtcModuleInput> {
  if (!isPlainRecord(value)) {
    throw new AgronomyEtcModuleTechnicalError("effectiveParameters must be a plain object");
  }

  return createAgronomyEtcModuleInput({
    eto: parseIdentifiedTechnicalValue(value.eto, "effectiveParameters.eto"),
    kc: parseIdentifiedTechnicalValue(value.kc, "effectiveParameters.kc"),
  });
}

export function createAgronomyEtcIntermediateResult(
  executionId: string,
  input: AgronomyEtcModuleInput,
): Readonly<IntermediateResult> {
  const calculation = calculateEtc(input);

  return createIntermediateResult({
    executionId,
    methodRef: calculation.methodRef,
    dependencyRefs: calculation.dependencyRefs,
    value: calculation.technicalValue,
  });
}

export function createAgronomyEtcModuleExecutor(): Readonly<ModuleExecutor> {
  return Object.freeze({
    async execute(input: Readonly<ModuleExecutorInput>): Promise<Readonly<ModuleExecutionResult>> {
      const validatedInput = createModuleExecutorInput(input);

      if (validatedInput.moduleRef !== AGRONOMY_ETC_MODULE_REF) {
        throw new AgronomyEtcModuleTechnicalError(
          `moduleRef must be ${AGRONOMY_ETC_MODULE_REF}`,
        );
      }

      const moduleInput = parseAgronomyEtcModuleInput(
        validatedInput.executionSnapshot.effectiveParameters,
      );

      const intermediateResult = createAgronomyEtcIntermediateResult(
        validatedInput.executionSnapshot.identity.executionId,
        moduleInput,
      );

      return createModuleExecutionResult(
        {
          status: "COMPLETED",
          intermediateResults: [intermediateResult],
        },
        validatedInput.executionSnapshot,
      );
    },
  });
}
