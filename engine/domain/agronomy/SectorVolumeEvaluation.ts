import {
  createIdentifiedTechnicalValue,
  type IdentifiedTechnicalValue,
  type TechnicalValueEvidence,
} from "../../../src/domain/shared/TechnicalValue.js";
import { Provenance } from "../../../src/domain/shared/Provenance.js";
import { ValidationStatus } from "../../../src/domain/shared/ValidationStatus.js";
import { AGRONOMY_GROSS_NEED_RESULT_PATH } from "./GrossNeedEvaluation.js";

export const AGRONOMY_SECTOR_VOLUME_METHOD_REF =
  "agronomy.compute_sector_volume";
export const AGRONOMY_SECTOR_VOLUME_RESULT_PATH = "agronomy.sectorVolume";

const AGRONOMY_GROSS_NEED_FIELD = "grossNeed";
const AGRONOMY_SECTOR_AREA_FIELD = "sectorArea";

export interface SectorVolumeEvaluationInput {
  readonly grossNeed: IdentifiedTechnicalValue<string>;
  readonly sectorAreaM2: IdentifiedTechnicalValue<"m2">;
}

type ValidatedSectorVolumeEvaluationInput = Readonly<{
  readonly grossNeed: Readonly<IdentifiedTechnicalValue<"mm">>;
  readonly sectorAreaM2: Readonly<IdentifiedTechnicalValue<"m2">>;
}>;

export interface SectorVolumeEvaluationIssue {
  readonly code: string;
  readonly message: string;
  readonly path: string;
}

export interface SectorVolumeEvaluationTrace {
  readonly grossNeed: Readonly<IdentifiedTechnicalValue<"mm">>;
  readonly sectorAreaM2: Readonly<IdentifiedTechnicalValue<"m2">>;
}

export interface ResolvedSectorVolumeEvaluation {
  readonly kind: "RESOLVED";
  readonly technicalValue: Readonly<IdentifiedTechnicalValue<"L">>;
  readonly methodRef: typeof AGRONOMY_SECTOR_VOLUME_METHOD_REF;
  readonly dependencyRefs: readonly string[];
  readonly trace: Readonly<SectorVolumeEvaluationTrace>;
}

export interface UnresolvedSectorVolumeEvaluation {
  readonly kind: "UNRESOLVED";
  readonly status: ValidationStatus;
  readonly issues: readonly SectorVolumeEvaluationIssue[];
  readonly trace: Readonly<SectorVolumeEvaluationTrace>;
}

export type SectorVolumeEvaluationResult =
  | ResolvedSectorVolumeEvaluation
  | UnresolvedSectorVolumeEvaluation;

export class SectorVolumeEvaluationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "SectorVolumeEvaluationError";
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

function isAdmissibleStatus(value: ValidationStatus): boolean {
  return (
    value === ValidationStatus.VALIDATED ||
    value === ValidationStatus.PROVISIONAL ||
    value === ValidationStatus.PENDING ||
    value === ValidationStatus.BLOCKED
  );
}

function deriveStatus(
  grossNeedStatus: ValidationStatus,
  sectorAreaStatus: ValidationStatus,
): ValidationStatus {
  if (
    grossNeedStatus === ValidationStatus.BLOCKED ||
    sectorAreaStatus === ValidationStatus.BLOCKED
  ) {
    return ValidationStatus.BLOCKED;
  }

  if (
    grossNeedStatus === ValidationStatus.PENDING ||
    sectorAreaStatus === ValidationStatus.PENDING
  ) {
    return ValidationStatus.PENDING;
  }

  if (
    grossNeedStatus === ValidationStatus.PROVISIONAL ||
    sectorAreaStatus === ValidationStatus.PROVISIONAL
  ) {
    return ValidationStatus.PROVISIONAL;
  }

  return ValidationStatus.VALIDATED;
}

function validateGrossNeed(
  value: IdentifiedTechnicalValue<string>,
): Readonly<IdentifiedTechnicalValue<"mm">> {
  const technicalValue = createIdentifiedTechnicalValue(value);

  if (technicalValue.unit !== "mm") {
    throw new SectorVolumeEvaluationError("grossNeed.unit must be mm");
  }

  if (technicalValue.value < 0) {
    throw new SectorVolumeEvaluationError(
      "grossNeed.value must be greater than or equal to 0",
    );
  }

  if (!isAdmissibleStatus(technicalValue.status)) {
    throw new SectorVolumeEvaluationError(
      "grossNeed.status is not admissible for sector volume evaluation",
    );
  }

  if (technicalValue.identity.field !== AGRONOMY_GROSS_NEED_FIELD) {
    throw new SectorVolumeEvaluationError(
      `grossNeed.identity.field must be ${AGRONOMY_GROSS_NEED_FIELD}`,
    );
  }

  if (technicalValue.identity.path !== AGRONOMY_GROSS_NEED_RESULT_PATH) {
    throw new SectorVolumeEvaluationError(
      `grossNeed.identity.path must be ${AGRONOMY_GROSS_NEED_RESULT_PATH}`,
    );
  }

  return technicalValue as Readonly<IdentifiedTechnicalValue<"mm">>;
}

function validateSectorArea(
  value: IdentifiedTechnicalValue<"m2">,
): Readonly<IdentifiedTechnicalValue<"m2">> {
  const technicalValue = createIdentifiedTechnicalValue(value);

  if (technicalValue.unit !== "m2") {
    throw new SectorVolumeEvaluationError("sectorAreaM2.unit must be m2");
  }

  if (technicalValue.value < 0) {
    throw new SectorVolumeEvaluationError(
      "sectorAreaM2.value must be greater than or equal to 0",
    );
  }

  if (!isAdmissibleStatus(technicalValue.status)) {
    throw new SectorVolumeEvaluationError(
      "sectorAreaM2.status is not admissible for sector volume evaluation",
    );
  }

  if (technicalValue.identity.field !== AGRONOMY_SECTOR_AREA_FIELD) {
    throw new SectorVolumeEvaluationError(
      `sectorAreaM2.identity.field must be ${AGRONOMY_SECTOR_AREA_FIELD}`,
    );
  }

  return technicalValue;
}

function selectEvidence(
  grossNeed: Readonly<IdentifiedTechnicalValue<"mm">>,
  sectorAreaM2: Readonly<IdentifiedTechnicalValue<"m2">>,
): TechnicalValueEvidence | undefined {
  return grossNeed.evidence ?? sectorAreaM2.evidence;
}

export function createSectorVolumeEvaluationInput(
  input: SectorVolumeEvaluationInput,
): ValidatedSectorVolumeEvaluationInput {
  if (!isPlainRecord(input)) {
    throw new SectorVolumeEvaluationError("sector volume evaluation input is required");
  }

  const grossNeed = validateGrossNeed(input.grossNeed);
  const sectorAreaM2 = validateSectorArea(input.sectorAreaM2);

  return Object.freeze({ grossNeed, sectorAreaM2 });
}

export function evaluateSectorVolume(
  input: SectorVolumeEvaluationInput,
): Readonly<SectorVolumeEvaluationResult> {
  const validatedInput = createSectorVolumeEvaluationInput(input);
  const status = deriveStatus(
    validatedInput.grossNeed.status,
    validatedInput.sectorAreaM2.status,
  );
  const evidence = selectEvidence(
    validatedInput.grossNeed,
    validatedInput.sectorAreaM2,
  );
  const technicalValue = createIdentifiedTechnicalValue({
    value: validatedInput.grossNeed.value * validatedInput.sectorAreaM2.value,
    unit: "L",
    provenance: Provenance.CALCULATED,
    status,
    ...(evidence === undefined ? {} : { evidence }),
    identity: {
      domain: "irrigation",
      field: "sectorVolume",
      path: AGRONOMY_SECTOR_VOLUME_RESULT_PATH,
    },
  });

  return Object.freeze({
    kind: "RESOLVED",
    technicalValue,
    methodRef: AGRONOMY_SECTOR_VOLUME_METHOD_REF,
    dependencyRefs: Object.freeze([
      validatedInput.grossNeed.identity.path,
      validatedInput.sectorAreaM2.identity.path,
    ]),
    trace: Object.freeze({
      grossNeed: validatedInput.grossNeed,
      sectorAreaM2: validatedInput.sectorAreaM2,
    }),
  });
}