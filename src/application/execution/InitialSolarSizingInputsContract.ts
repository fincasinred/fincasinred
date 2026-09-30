import {
  SOLAR_RESOURCE_PROVIDER,
  SOLAR_SIZING_RULES_UNIT,
  type SolarResource,
  type SolarSizingRules,
  solarResourcePath,
  solarSizingRulesPath,
} from "./SolarSizingPreparationContract.js";
import {
  createIdentifiedTechnicalValue,
  isTechnicalValueEvidence,
} from "../../domain/shared/TechnicalValue.js";
import { Provenance } from "../../domain/shared/Provenance.js";
import { ValidationStatus } from "../../domain/shared/ValidationStatus.js";

export type InitialSolarSizingInputs =
  | {
      readonly status: "AVAILABLE";
      readonly sectorId: string;
      readonly solarResource: Readonly<SolarResource>;
      readonly solarSizingRules: Readonly<SolarSizingRules>;
    }
  | {
      readonly status: "ABSENT";
    }
  | {
      readonly status: "BLOCKED";
      readonly issue: string;
    };

export class InitialSolarSizingInputsError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "InitialSolarSizingInputsError";
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function isBlockedStatus(value: ValidationStatus): boolean {
  return (
    value === ValidationStatus.PENDING ||
    value === ValidationStatus.BLOCKED ||
    value === ValidationStatus.INVALID ||
    value === ValidationStatus.OBSOLETE
  );
}

function validateSolarResource(
  value: unknown,
  sectorId: string,
): asserts value is Readonly<SolarResource> {
  const expectedPath = solarResourcePath(sectorId);
  if (!isPlainRecord(value)) {
    throw new InitialSolarSizingInputsError("solarResource must be an object");
  }
  if (!isPlainRecord(value.identity) || value.identity.path !== expectedPath) {
    throw new InitialSolarSizingInputsError(
      `solarResource identity.path must be ${expectedPath}`,
    );
  }
  if (value.sectorId !== undefined && value.sectorId !== sectorId) {
    throw new InitialSolarSizingInputsError(
      `solarResource sectorId must be ${sectorId}`,
    );
  }
  if (!Object.values(Provenance).includes(value.provenance as Provenance)) {
    throw new InitialSolarSizingInputsError("solarResource provenance is invalid");
  }
  if (isBlockedStatus(value.status as ValidationStatus)) {
    throw new InitialSolarSizingInputsError(
      `solarResource dependency has status ${value.status}`,
    );
  }
  if (!isTechnicalValueEvidence(value.evidence)) {
    throw new InitialSolarSizingInputsError("solarResource evidence is required");
  }
  if (
    !isPlainRecord(value.source) ||
    value.source.provider !== SOLAR_RESOURCE_PROVIDER ||
    !isNonEmptyString(value.source.reference)
  ) {
    throw new InitialSolarSizingInputsError("solarResource source is invalid");
  }

  try {
    createIdentifiedTechnicalValue(value.metric as never);
  } catch {
    throw new InitialSolarSizingInputsError("solarResource metric is invalid");
  }

  if (
    !isPlainRecord(value.location) ||
    typeof value.location.latitude !== "number" ||
    !Number.isFinite(value.location.latitude) ||
    value.location.latitude < -90 ||
    value.location.latitude > 90 ||
    typeof value.location.longitude !== "number" ||
    !Number.isFinite(value.location.longitude) ||
    value.location.longitude < -180 ||
    value.location.longitude > 180
  ) {
    throw new InitialSolarSizingInputsError("solarResource location is invalid");
  }
  if (
    !isPlainRecord(value.period) ||
    !isNonEmptyString(value.period.start) ||
    !isNonEmptyString(value.period.end) ||
    !Number.isFinite(Date.parse(value.period.start)) ||
    !Number.isFinite(Date.parse(value.period.end)) ||
    Date.parse(value.period.end) < Date.parse(value.period.start)
  ) {
    throw new InitialSolarSizingInputsError("solarResource period is invalid");
  }
  if (!isPlainRecord(value.configuration)) {
    throw new InitialSolarSizingInputsError(
      "solarResource configuration is required",
    );
  }
}

function validateSolarSizingRules(
  value: unknown,
  sectorId: string,
): asserts value is Readonly<SolarSizingRules> {
  if (!isPlainRecord(value)) {
    throw new InitialSolarSizingInputsError(
      "solarSizingRules must be an object",
    );
  }
  let rules: Readonly<SolarSizingRules>;
  try {
    rules = createIdentifiedTechnicalValue(value as never) as Readonly<SolarSizingRules>;
  } catch {
    throw new InitialSolarSizingInputsError("solarSizingRules is invalid");
  }
  if (rules.unit !== SOLAR_SIZING_RULES_UNIT) {
    throw new InitialSolarSizingInputsError(
      `solarSizingRules must use ${SOLAR_SIZING_RULES_UNIT}`,
    );
  }
  if (rules.identity.path !== solarSizingRulesPath(sectorId)) {
    throw new InitialSolarSizingInputsError(
      `solarSizingRules identity.path must be ${solarSizingRulesPath(sectorId)}`,
    );
  }
  if (isBlockedStatus(rules.status)) {
    throw new InitialSolarSizingInputsError(
      `solarSizingRules dependency has status ${rules.status}`,
    );
  }
}

function validateAvailable(value: Record<string, unknown>): void {
  if (!isNonEmptyString(value.sectorId)) {
    throw new InitialSolarSizingInputsError(
      "sectorId is required for available solar sizing inputs",
    );
  }

  if (value.solarResource === undefined) {
    throw new InitialSolarSizingInputsError("solarResource is required");
  }

  if (value.solarSizingRules === undefined) {
    throw new InitialSolarSizingInputsError("solarSizingRules is required");
  }

  validateSolarResource(value.solarResource, value.sectorId);
  validateSolarSizingRules(value.solarSizingRules, value.sectorId);
}

export function createInitialSolarSizingInputs(
  input: InitialSolarSizingInputs,
): Readonly<InitialSolarSizingInputs> {
  if (!isPlainRecord(input)) {
    throw new InitialSolarSizingInputsError("input must be an object");
  }

  if (input.status === "ABSENT") {
    return Object.freeze({ status: "ABSENT" });
  }

  if (input.status === "BLOCKED") {
    if (!isNonEmptyString(input.issue)) {
      throw new InitialSolarSizingInputsError(
        "issue is required for blocked solar sizing inputs",
      );
    }

    return Object.freeze({ status: "BLOCKED", issue: input.issue });
  }

  if (input.status !== "AVAILABLE") {
    throw new InitialSolarSizingInputsError(
      "status must be AVAILABLE, ABSENT, or BLOCKED",
    );
  }

  validateAvailable(input);
  const source = Object.freeze({
    status: "AVAILABLE",
    sectorId: input.sectorId,
    solarResource: input.solarResource,
    solarSizingRules: input.solarSizingRules,
  });

  return validateInitialSolarSizingInputs(source);
}

export function validateInitialSolarSizingInputs(
  value: unknown,
): Readonly<InitialSolarSizingInputs> {
  if (!isPlainRecord(value) || !Object.isFrozen(value)) {
    throw new InitialSolarSizingInputsError(
      "initialSolarSizingInputs must be an authorized frozen source",
    );
  }

  if (value.status === "ABSENT") {
    if (Object.keys(value).length !== 1) {
      throw new InitialSolarSizingInputsError(
        "ABSENT solar sizing inputs must not contain data",
      );
    }
    return value as unknown as Readonly<InitialSolarSizingInputs>;
  }

  if (value.status === "BLOCKED") {
    if (!isNonEmptyString(value.issue)) {
      throw new InitialSolarSizingInputsError(
        "initialSolarSizingInputs.issue is required when status is BLOCKED",
      );
    }
    return value as unknown as Readonly<InitialSolarSizingInputs>;
  }

  if (value.status !== "AVAILABLE") {
    throw new InitialSolarSizingInputsError(
      "initialSolarSizingInputs.status is invalid",
    );
  }

  validateAvailable(value);
  return value as unknown as Readonly<InitialSolarSizingInputs>;
}
