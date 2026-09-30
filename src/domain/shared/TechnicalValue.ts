import { Provenance } from "./Provenance.js";
import { ValidationStatus } from "./ValidationStatus.js";

export interface TechnicalValue<Unit extends string = string> {
  readonly value: number;
  readonly unit: Unit;
  readonly provenance: Provenance;
  readonly status: ValidationStatus;
  readonly evidence?: TechnicalValueEvidence;
}

/**
 * Referencias disponibles que respaldan la procedencia de un valor técnico.
 * No sustituyen a `provenance`: esta clasifica el origen y las referencias
 * identifican la fuente o evidencia concreta cuando se conocen.
 */
export interface TechnicalValueEvidence {
  readonly sourceReference?: string;
  readonly evidenceReference?: string;
}

/**
 * Identidad semántica estable de un valor dentro del modelo técnico.
 *
 * `field` nombra la magnitud técnica; `domain` la sitúa cuando procede; y
 * `path` conserva su localizador lógico estable, sin depender del índice de
 * una colección.
 */
export interface TechnicalValueIdentity {
  readonly field: string;
  readonly domain?: string;
  readonly path: string;
}

export type IdentifiedTechnicalValue<Unit extends string = string> =
  TechnicalValue<Unit> & {
    readonly identity: TechnicalValueIdentity;
  };

export class TechnicalValueError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "TechnicalValueError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isProvenance(value: unknown): value is Provenance {
  return Object.values(Provenance).includes(value as Provenance);
}

function isValidationStatus(value: unknown): value is ValidationStatus {
  return Object.values(ValidationStatus).includes(value as ValidationStatus);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isTechnicalValueEvidence(
  value: unknown,
): value is TechnicalValueEvidence {
  if (!isRecord(value) || Array.isArray(value)) {
    return false;
  }

  const sourceReference = value.sourceReference;
  const evidenceReference = value.evidenceReference;

  return (
    (sourceReference === undefined || isNonEmptyString(sourceReference)) &&
    (evidenceReference === undefined || isNonEmptyString(evidenceReference)) &&
    (sourceReference !== undefined || evidenceReference !== undefined)
  );
}

export function createTechnicalValue<Unit extends string>(
  input: TechnicalValue<Unit>,
): Readonly<TechnicalValue<Unit>> {
  if (!isRecord(input) || typeof input.value !== "number" || !Number.isFinite(input.value)) {
    throw new TechnicalValueError("value must be finite");
  }

  if (!("unit" in input) || input.unit === undefined || input.unit === null) {
    throw new TechnicalValueError("unit is missing");
  }

  if (typeof input.unit !== "string") {
    throw new TechnicalValueError("unit is invalid");
  }

  if (input.unit.trim().length === 0) {
    throw new TechnicalValueError("unit is empty");
  }

  if (!isProvenance(input.provenance)) {
    throw new TechnicalValueError("provenance is invalid");
  }

  if (!isValidationStatus(input.status)) {
    throw new TechnicalValueError("status is invalid");
  }

  if (
    input.evidence !== undefined &&
    !isTechnicalValueEvidence(input.evidence)
  ) {
    throw new TechnicalValueError("evidence is invalid");
  }

  const evidence =
    input.evidence === undefined
      ? undefined
      : Object.freeze({ ...input.evidence });

  return Object.freeze({
    ...input,
    ...(evidence === undefined ? {} : { evidence }),
  });
}

export function createIdentifiedTechnicalValue<Unit extends string>(
  input: IdentifiedTechnicalValue<Unit>,
): Readonly<IdentifiedTechnicalValue<Unit>> {
  const technicalValue = createTechnicalValue(input);
  const identity = input.identity;

  if (!isRecord(identity)) {
    throw new TechnicalValueError("identity is required");
  }

  if (!isNonEmptyString(identity.field)) {
    throw new TechnicalValueError("identity.field is required");
  }

  if (!isNonEmptyString(identity.path)) {
    throw new TechnicalValueError("identity.path is required");
  }

  if (identity.domain !== undefined && !isNonEmptyString(identity.domain)) {
    throw new TechnicalValueError("identity.domain is invalid");
  }

  return Object.freeze({
    ...technicalValue,
    identity: Object.freeze({ ...identity }),
  });
}
