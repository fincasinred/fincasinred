import {
  createIdentifiedTechnicalValue,
  type IdentifiedTechnicalValue,
  type TechnicalValueEvidence,
} from "../../../src/domain/shared/TechnicalValue.js";
import { Provenance } from "../../../src/domain/shared/Provenance.js";
import { ValidationStatus } from "../../../src/domain/shared/ValidationStatus.js";
import { AGRONOMY_SECTOR_VOLUME_RESULT_PATH } from "../agronomy/SectorVolumeEvaluation.js";

export const IRRIGATION_DURATION_METHOD_REF =
  "irrigation.compute_sector_duration";

export function irrigationDurationResultPath(sectorId: string): string {
  return `irrigation.${sectorId}.duration`;
}

export function hydraulicSectorFlowResultPath(sectorId: string): string {
  return `hydraulic.${sectorId}.sector.flow`;
}

export interface IrrigationDurationEvaluationInput {
  readonly sectorId: string;
  readonly sectorVolume: IdentifiedTechnicalValue<string>;
  readonly sectorFlow: IdentifiedTechnicalValue<string>;
}

export interface IrrigationDurationEvaluationTrace {
  readonly sectorId: string;
  readonly sectorVolume: Readonly<IdentifiedTechnicalValue<string>>;
  readonly sectorFlow: Readonly<IdentifiedTechnicalValue<string>>;
  readonly flowLitresPerMinute: number;
}

export interface ResolvedIrrigationDurationEvaluation {
  readonly kind: "RESOLVED";
  readonly technicalValue: Readonly<IdentifiedTechnicalValue<"min">>;
  readonly methodRef: typeof IRRIGATION_DURATION_METHOD_REF;
  readonly dependencyRefs: readonly string[];
  readonly trace: Readonly<IrrigationDurationEvaluationTrace>;
}

export type IrrigationDurationEvaluationResult =
  ResolvedIrrigationDurationEvaluation;

export class IrrigationDurationEvaluationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "IrrigationDurationEvaluationError";
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

function isAdmissibleStatus(value: ValidationStatus): boolean {
  return (
    value === ValidationStatus.VALIDATED ||
    value === ValidationStatus.PROVISIONAL ||
    value === ValidationStatus.PENDING ||
    value === ValidationStatus.BLOCKED
  );
}

function deriveStatus(
  sectorVolumeStatus: ValidationStatus,
  sectorFlowStatus: ValidationStatus,
): ValidationStatus {
  if (
    sectorVolumeStatus === ValidationStatus.BLOCKED ||
    sectorFlowStatus === ValidationStatus.BLOCKED
  ) {
    return ValidationStatus.BLOCKED;
  }

  if (
    sectorVolumeStatus === ValidationStatus.PENDING ||
    sectorFlowStatus === ValidationStatus.PENDING
  ) {
    return ValidationStatus.PENDING;
  }

  if (
    sectorVolumeStatus === ValidationStatus.PROVISIONAL ||
    sectorFlowStatus === ValidationStatus.PROVISIONAL
  ) {
    return ValidationStatus.PROVISIONAL;
  }

  return ValidationStatus.VALIDATED;
}

function validateSectorId(value: unknown): string {
  if (!isNonEmptyString(value)) {
    throw new IrrigationDurationEvaluationError("sectorId is required");
  }

  return value;
}

function validateSectorVolume(
  value: IdentifiedTechnicalValue<string>,
): Readonly<IdentifiedTechnicalValue<string>> {
  const technicalValue = createIdentifiedTechnicalValue(value);

  if (technicalValue.unit !== "L") {
    throw new IrrigationDurationEvaluationError("sectorVolume.unit must be L");
  }
  if (technicalValue.value < 0) {
    throw new IrrigationDurationEvaluationError(
      "sectorVolume.value must be greater than or equal to 0",
    );
  }
  if (!isAdmissibleStatus(technicalValue.status)) {
    throw new IrrigationDurationEvaluationError(
      "sectorVolume.status is not admissible for irrigation duration evaluation",
    );
  }
  if (technicalValue.identity.field !== "sectorVolume") {
    throw new IrrigationDurationEvaluationError(
      "sectorVolume.identity.field must be sectorVolume",
    );
  }
  if (technicalValue.identity.path !== AGRONOMY_SECTOR_VOLUME_RESULT_PATH) {
    throw new IrrigationDurationEvaluationError(
      `sectorVolume.identity.path must be ${AGRONOMY_SECTOR_VOLUME_RESULT_PATH}`,
    );
  }

  return technicalValue;
}

function flowLitresPerMinute(
  value: Readonly<IdentifiedTechnicalValue<string>>,
): number {
  if (value.unit === "lpm") return value.value;
  if (value.unit === "L/h") return value.value / 60;
  if (value.unit === "m3/h") return (value.value * 1000) / 60;

  throw new IrrigationDurationEvaluationError(
    "sectorFlow.unit must be lpm, L/h or m3/h",
  );
}

function validateSectorFlow(
  sectorId: string,
  value: IdentifiedTechnicalValue<string>,
): Readonly<IdentifiedTechnicalValue<string>> {
  const technicalValue = createIdentifiedTechnicalValue(value);

  if (!isAdmissibleStatus(technicalValue.status)) {
    throw new IrrigationDurationEvaluationError(
      "sectorFlow.status is not admissible for irrigation duration evaluation",
    );
  }
  if (technicalValue.identity.field !== "sectorFlow") {
    throw new IrrigationDurationEvaluationError(
      "sectorFlow.identity.field must be sectorFlow",
    );
  }
  const expectedPath = hydraulicSectorFlowResultPath(sectorId);
  if (technicalValue.identity.path !== expectedPath) {
    throw new IrrigationDurationEvaluationError(
      `sectorFlow.identity.path must be ${expectedPath}`,
    );
  }

  const litresPerMinute = flowLitresPerMinute(technicalValue);
  if (!Number.isFinite(litresPerMinute) || litresPerMinute <= 0) {
    throw new IrrigationDurationEvaluationError(
      "sectorFlow.value must be greater than 0",
    );
  }

  return technicalValue;
}

function selectEvidence(
  sectorVolume: Readonly<IdentifiedTechnicalValue<string>>,
  sectorFlow: Readonly<IdentifiedTechnicalValue<string>>,
): TechnicalValueEvidence | undefined {
  return sectorVolume.evidence ?? sectorFlow.evidence;
}

export function evaluateIrrigationDuration(
  input: IrrigationDurationEvaluationInput,
): Readonly<IrrigationDurationEvaluationResult> {
  if (!isPlainRecord(input)) {
    throw new IrrigationDurationEvaluationError(
      "irrigation duration evaluation input is required",
    );
  }

  const sectorId = validateSectorId(input.sectorId);
  const sectorVolume = validateSectorVolume(input.sectorVolume);
  const sectorFlow = validateSectorFlow(sectorId, input.sectorFlow);
  const litresPerMinute = flowLitresPerMinute(sectorFlow);
  const evidence = selectEvidence(sectorVolume, sectorFlow);

  const technicalValue = createIdentifiedTechnicalValue({
    value: sectorVolume.value / litresPerMinute,
    unit: "min",
    provenance: Provenance.CALCULATED,
    status: deriveStatus(sectorVolume.status, sectorFlow.status),
    ...(evidence === undefined ? {} : { evidence }),
    identity: {
      domain: "irrigation",
      field: "irrigationDuration",
      path: irrigationDurationResultPath(sectorId),
    },
  });

  return Object.freeze({
    kind: "RESOLVED",
    technicalValue,
    methodRef: IRRIGATION_DURATION_METHOD_REF,
    dependencyRefs: Object.freeze([
      sectorVolume.identity.path,
      sectorFlow.identity.path,
    ]),
    trace: Object.freeze({
      sectorId,
      sectorVolume,
      sectorFlow,
      flowLitresPerMinute: litresPerMinute,
    }),
  });
}
