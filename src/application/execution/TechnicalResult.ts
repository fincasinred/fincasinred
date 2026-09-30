import { ValidationStatus } from "../../domain/shared/ValidationStatus.js";
import { IntermediateResult } from "./IntermediateResult.js";
import { ValidationIssue } from "../validation/ValidationResult.js";

export type TechnicalResultCompleteness = "PARTIAL" | "FINAL";

/**
 * Resultado técnico agregado de una ejecución.
 *
 * No contiene valores embebidos: `intermediateRefs` referencia todos los
 * `IntermediateResult` que lo sustentan y `finalValueRefs` es el subconjunto
 * de esas mismas referencias que constituye la salida entregable
 * (finalValueRefs ⊆ intermediateRefs). El valor real, su unidad, procedencia,
 * estado y evidencia siguen viviendo únicamente en cada `IntermediateResult`.
 */
export interface TechnicalResult {
  readonly calculationId: string;
  readonly executionId: string;
  readonly configurationRef: string;
  readonly engineVersion: string;
  readonly rulesVersion: string;
  readonly resultVersion: string;
  readonly createdAt: string;
  readonly status: ValidationStatus;
  readonly completeness: TechnicalResultCompleteness;
  readonly intermediateRefs: readonly string[];
  readonly finalValueRefs: readonly string[];
  readonly issues?: readonly ValidationIssue[];
}

export interface CreateTechnicalResultInput {
  readonly calculationId: string;
  readonly executionId: string;
  readonly configurationRef: string;
  readonly engineVersion: string;
  readonly rulesVersion: string;
  readonly resultVersion: string;
  readonly createdAt: string;
  readonly status: ValidationStatus;
  readonly completeness: TechnicalResultCompleteness;
  readonly intermediateResults: readonly IntermediateResult[];
  readonly finalValueRefs?: readonly string[];
  readonly issues?: readonly ValidationIssue[];
}

export class TechnicalResultError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "TechnicalResultError";
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasDuplicates(refs: readonly string[]): boolean {
  return new Set(refs).size !== refs.length;
}

function isValidationStatus(value: unknown): value is ValidationStatus {
  return Object.values(ValidationStatus).includes(value as ValidationStatus);
}

function isCompleteness(value: unknown): value is TechnicalResultCompleteness {
  return value === "PARTIAL" || value === "FINAL";
}

export function createTechnicalResult(
  input: CreateTechnicalResultInput,
): Readonly<TechnicalResult> {
  const requiredStrings: ReadonlyArray<[string, unknown]> = [
    ["calculationId", input.calculationId],
    ["executionId", input.executionId],
    ["configurationRef", input.configurationRef],
    ["engineVersion", input.engineVersion],
    ["rulesVersion", input.rulesVersion],
    ["resultVersion", input.resultVersion],
    ["createdAt", input.createdAt],
  ];

  for (const [fieldName, fieldValue] of requiredStrings) {
    if (!isNonEmptyString(fieldValue)) {
      throw new TechnicalResultError(`${fieldName} is required`);
    }
  }

  if (!isValidationStatus(input.status)) {
    throw new TechnicalResultError("status is invalid");
  }

  if (!isCompleteness(input.completeness)) {
    throw new TechnicalResultError("completeness is invalid");
  }

  if (!Array.isArray(input.intermediateResults)) {
    throw new TechnicalResultError("intermediateResults must be an array");
  }

  for (const intermediateResult of input.intermediateResults) {
    if (intermediateResult.executionId !== input.executionId) {
      throw new TechnicalResultError(
        "intermediateResults must belong to the same executionId as the TechnicalResult",
      );
    }
  }

  const intermediateRefs = input.intermediateResults.map(
    (intermediateResult) => intermediateResult.value.identity.path,
  );

  if (hasDuplicates(intermediateRefs)) {
    throw new TechnicalResultError("intermediateRefs must not contain duplicate references");
  }

  const finalValueRefsInput = input.finalValueRefs ?? [];

  if (!Array.isArray(finalValueRefsInput)) {
    throw new TechnicalResultError("finalValueRefs must be an array");
  }

  if (finalValueRefsInput.some((ref) => !isNonEmptyString(ref))) {
    throw new TechnicalResultError("finalValueRefs must contain non-empty references");
  }

  if (hasDuplicates(finalValueRefsInput)) {
    throw new TechnicalResultError("finalValueRefs must not contain duplicate references");
  }

  const intermediateRefSet = new Set(intermediateRefs);
  if (finalValueRefsInput.some((ref) => !intermediateRefSet.has(ref))) {
    throw new TechnicalResultError("finalValueRefs must be a subset of intermediateRefs");
  }

  if (input.completeness === "FINAL" && finalValueRefsInput.length === 0) {
    throw new TechnicalResultError(
      "a FINAL result requires at least one finalValueRef",
    );
  }

  const issues = input.issues ?? [];
  if (!Array.isArray(issues)) {
    throw new TechnicalResultError("issues must be an array");
  }

  return Object.freeze({
    calculationId: input.calculationId,
    executionId: input.executionId,
    configurationRef: input.configurationRef,
    engineVersion: input.engineVersion,
    rulesVersion: input.rulesVersion,
    resultVersion: input.resultVersion,
    createdAt: input.createdAt,
    status: input.status,
    completeness: input.completeness,
    intermediateRefs: Object.freeze([...intermediateRefs]),
    finalValueRefs: Object.freeze([...finalValueRefsInput]),
    issues: Object.freeze([...issues]),
  });
}
