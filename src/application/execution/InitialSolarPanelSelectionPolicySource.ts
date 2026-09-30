import type { TechnicalValueEvidence } from "../../domain/shared/TechnicalValue.js";
import { Provenance } from "../../domain/shared/Provenance.js";
import {
  prepareSolarPanelSelectionPolicy,
  SolarPanelSelectionPolicyContractError,
  type SolarPanelSelectionPolicyReference,
} from "../../domain/catalog/SolarPanelSelectionPolicyContract.js";

export const SOLAR_PANEL_SELECTION_POLICY_PATH_SUFFIX =
  "solarPanelSelectionPolicy";

export type InitialSolarPanelSelectionPolicySource =
  | {
      readonly status: "AVAILABLE";
      readonly policy: Readonly<SolarPanelSelectionPolicyReference>;
      readonly policyId: string;
      readonly policyVersion: string;
      readonly provenance: Provenance;
      readonly evidence?: Readonly<TechnicalValueEvidence>;
      readonly identityPath: string;
    }
  | {
      readonly status: "ABSENT";
    }
  | {
      readonly status: "BLOCKED";
      readonly issue: string;
    };

export class InitialSolarPanelSelectionPolicySourceError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "InitialSolarPanelSelectionPolicySourceError";
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

function validateEvidence(value: unknown): Readonly<TechnicalValueEvidence> | undefined {
  if (value === undefined) return undefined;
  if (!isPlainRecord(value)) {
    throw new InitialSolarPanelSelectionPolicySourceError(
      "evidence must be an object",
    );
  }

  const sourceReference = value.sourceReference;
  const evidenceReference = value.evidenceReference;
  if (
    (sourceReference !== undefined && !isNonEmptyString(sourceReference)) ||
    (evidenceReference !== undefined && !isNonEmptyString(evidenceReference))
  ) {
    throw new InitialSolarPanelSelectionPolicySourceError(
      "evidence references must be non-empty strings",
    );
  }
  if (sourceReference === undefined && evidenceReference === undefined) {
    throw new InitialSolarPanelSelectionPolicySourceError(
      "evidence must contain a sourceReference or evidenceReference",
    );
  }

  return value as Readonly<TechnicalValueEvidence>;
}

function validatePolicy(
  value: unknown,
): Readonly<SolarPanelSelectionPolicyReference> {
  if (!isPlainRecord(value)) {
    throw new InitialSolarPanelSelectionPolicySourceError(
      "policy is required",
    );
  }

  try {
    const result = prepareSolarPanelSelectionPolicy({
      policy: value as unknown as SolarPanelSelectionPolicyReference,
    });
    if (result.issues.length > 0 || result.dependencies.policy === undefined) {
      throw new InitialSolarPanelSelectionPolicySourceError(
        result.issues[0]?.message ?? "policy is invalid",
      );
    }
  } catch (error) {
    if (error instanceof SolarPanelSelectionPolicyContractError) {
      throw new InitialSolarPanelSelectionPolicySourceError(error.message);
    }
    throw error;
  }

  return value as unknown as Readonly<SolarPanelSelectionPolicyReference>;
}

function validateAvailable(
  value: Record<string, unknown>,
): Readonly<InitialSolarPanelSelectionPolicySource> {
  const policy = validatePolicy(value.policy);
  const evidence = validateEvidence(value.evidence);

  if (!isNonEmptyString(value.policyId)) {
    throw new InitialSolarPanelSelectionPolicySourceError(
      "policyId is required",
    );
  }
  if (value.policyId !== policy.policyId) {
    throw new InitialSolarPanelSelectionPolicySourceError(
      "policyId must match policy.policyId",
    );
  }
  if (!isNonEmptyString(value.policyVersion)) {
    throw new InitialSolarPanelSelectionPolicySourceError(
      "policyVersion is required",
    );
  }
  if (value.policyVersion !== policy.policyVersion) {
    throw new InitialSolarPanelSelectionPolicySourceError(
      "policyVersion must match policy.policyVersion",
    );
  }
  if (value.provenance !== policy.provenance) {
    throw new InitialSolarPanelSelectionPolicySourceError(
      "provenance must match policy.provenance",
    );
  }
  if (!isNonEmptyString(value.identityPath)) {
    throw new InitialSolarPanelSelectionPolicySourceError(
      "identityPath is required",
    );
  }
  const policyEvidence = policy.evidence;
  if (
    evidence !== undefined &&
    (evidence.sourceReference !== policyEvidence?.sourceReference ||
      evidence.evidenceReference !== policyEvidence?.evidenceReference)
  ) {
    throw new InitialSolarPanelSelectionPolicySourceError(
      "evidence must match policy.evidence",
    );
  }

  if (Object.isFrozen(value)) {
    return value as unknown as Readonly<InitialSolarPanelSelectionPolicySource>;
  }

  return Object.freeze({
    status: "AVAILABLE",
    policy,
    policyId: value.policyId,
    policyVersion: value.policyVersion,
    provenance: value.provenance as Provenance,
    ...(evidence === undefined && policyEvidence === undefined
      ? {}
      : { evidence: evidence ?? policyEvidence }),
    identityPath: value.identityPath,
  });
}

export function createInitialSolarPanelSelectionPolicySource(
  input: InitialSolarPanelSelectionPolicySource,
): Readonly<InitialSolarPanelSelectionPolicySource> {
  if (!isPlainRecord(input)) {
    throw new InitialSolarPanelSelectionPolicySourceError(
      "input must be an object",
    );
  }

  if (input.status === "ABSENT") {
    return Object.freeze({ status: "ABSENT" });
  }

  if (input.status === "BLOCKED") {
    if (!isNonEmptyString(input.issue)) {
      throw new InitialSolarPanelSelectionPolicySourceError(
        "issue is required for a blocked policy",
      );
    }
    return Object.freeze({ status: "BLOCKED", issue: input.issue });
  }

  if (input.status !== "AVAILABLE") {
    throw new InitialSolarPanelSelectionPolicySourceError(
      "status must be AVAILABLE, ABSENT, or BLOCKED",
    );
  }

  const source = validateAvailable(input);
  return validateInitialSolarPanelSelectionPolicySource(source);
}

export function validateInitialSolarPanelSelectionPolicySource(
  value: unknown,
): Readonly<InitialSolarPanelSelectionPolicySource> {
  if (!isPlainRecord(value) || !Object.isFrozen(value)) {
    throw new InitialSolarPanelSelectionPolicySourceError(
      "initialSolarPanelSelectionPolicySource must be an authorized frozen source",
    );
  }

  if (value.status === "ABSENT") {
    return value as unknown as Readonly<InitialSolarPanelSelectionPolicySource>;
  }

  if (value.status === "BLOCKED") {
    if (!isNonEmptyString(value.issue)) {
      throw new InitialSolarPanelSelectionPolicySourceError(
        "initialSolarPanelSelectionPolicySource.issue is required when status is BLOCKED",
      );
    }
    return value as unknown as Readonly<InitialSolarPanelSelectionPolicySource>;
  }

  if (value.status !== "AVAILABLE") {
    throw new InitialSolarPanelSelectionPolicySourceError(
      "initialSolarPanelSelectionPolicySource.status is invalid",
    );
  }

  return validateAvailable(value);
}
