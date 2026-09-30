import {
  createIdentifiedTechnicalValue,
  type IdentifiedTechnicalValue,
  type TechnicalValueEvidence,
} from "../../../src/domain/shared/TechnicalValue.js";
import { Provenance } from "../../../src/domain/shared/Provenance.js";
import { ValidationStatus } from "../../../src/domain/shared/ValidationStatus.js";
import { RainfallTemporalWindow } from "./RainfallTemporalBalanceContract.js";

export const AGRONOMY_NET_NEED_METHOD_REF = "agronomy.compute_net_need";
export const AGRONOMY_NET_NEED_RESULT_PATH = "agronomy.netNeed";

export interface NetNeedEvaluationInput {
  readonly etc: IdentifiedTechnicalValue<string>;
  readonly effectiveRainfall: IdentifiedTechnicalValue<string>;
  readonly period: RainfallTemporalWindow;
}

export interface NetNeedEvaluationIssue {
  readonly code: string;
  readonly message: string;
  readonly path: string;
}

export interface NetNeedEvaluationTrace {
  readonly etc: Readonly<IdentifiedTechnicalValue<string>>;
  readonly effectiveRainfall: Readonly<IdentifiedTechnicalValue<string>>;
  readonly period: Readonly<RainfallTemporalWindow>;
}

export interface ResolvedNetNeedEvaluation {
  readonly kind: "RESOLVED";
  readonly technicalValue: Readonly<IdentifiedTechnicalValue<"mm">>;
  readonly methodRef: typeof AGRONOMY_NET_NEED_METHOD_REF;
  readonly dependencyRefs: readonly string[];
  readonly trace: Readonly<NetNeedEvaluationTrace>;
}

export interface UnresolvedNetNeedEvaluation {
  readonly kind: "UNRESOLVED";
  readonly status: ValidationStatus;
  readonly issues: readonly NetNeedEvaluationIssue[];
  readonly trace: Readonly<NetNeedEvaluationTrace>;
}

export type NetNeedEvaluationResult =
  | ResolvedNetNeedEvaluation
  | UnresolvedNetNeedEvaluation;

export class NetNeedEvaluationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "NetNeedEvaluationError";
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

function isAdmissibleInputStatus(value: ValidationStatus): boolean {
  return (
    value === ValidationStatus.VALIDATED ||
    value === ValidationStatus.PROVISIONAL ||
    value === ValidationStatus.PENDING ||
    value === ValidationStatus.BLOCKED
  );
}

function deriveResultStatus(
  etcStatus: ValidationStatus,
  effectiveRainfallStatus: ValidationStatus,
): ValidationStatus {
  if (
    etcStatus === ValidationStatus.BLOCKED ||
    effectiveRainfallStatus === ValidationStatus.BLOCKED
  ) {
    return ValidationStatus.BLOCKED;
  }

  if (
    etcStatus === ValidationStatus.PENDING ||
    effectiveRainfallStatus === ValidationStatus.PENDING
  ) {
    return ValidationStatus.PENDING;
  }

  if (
    etcStatus === ValidationStatus.PROVISIONAL ||
    effectiveRainfallStatus === ValidationStatus.PROVISIONAL
  ) {
    return ValidationStatus.PROVISIONAL;
  }

  return ValidationStatus.VALIDATED;
}

function deriveUnresolvedStatus(
  etcStatus: ValidationStatus,
  effectiveRainfallStatus: ValidationStatus,
): ValidationStatus {
  const derivedStatus = deriveResultStatus(etcStatus, effectiveRainfallStatus);

  return derivedStatus === ValidationStatus.VALIDATED
    ? ValidationStatus.BLOCKED
    : derivedStatus;
}

function clonePeriod(period: RainfallTemporalWindow): Readonly<RainfallTemporalWindow> {
  return Object.freeze({
    start: period.start,
    end: period.end,
    ...(period.timezone === undefined ? {} : { timezone: period.timezone }),
  });
}

function issue(
  code: string,
  message: string,
  path: string,
): Readonly<NetNeedEvaluationIssue> {
  return Object.freeze({ code, message, path });
}

function validateMmValue(
  value: IdentifiedTechnicalValue<string>,
  fieldName: string,
): Readonly<IdentifiedTechnicalValue<string>> {
  const technicalValue = createIdentifiedTechnicalValue(value);

  if (technicalValue.unit !== "mm") {
    throw new NetNeedEvaluationError(fieldName + ".unit must be mm");
  }

  if (technicalValue.value < 0) {
    throw new NetNeedEvaluationError(
      fieldName + ".value must be greater than or equal to 0",
    );
  }

  if (!isAdmissibleInputStatus(technicalValue.status)) {
    throw new NetNeedEvaluationError(
      fieldName + ".status is not admissible for net need evaluation",
    );
  }

  return technicalValue;
}

function validatePeriod(period: RainfallTemporalWindow): Readonly<RainfallTemporalWindow> {
  if (!isPlainRecord(period)) {
    throw new NetNeedEvaluationError("period is required");
  }

  if (!isNonEmptyString(period.start)) {
    throw new NetNeedEvaluationError("period.start is required");
  }

  if (!isNonEmptyString(period.end)) {
    throw new NetNeedEvaluationError("period.end is required");
  }

  if (period.timezone !== undefined && !isNonEmptyString(period.timezone)) {
    throw new NetNeedEvaluationError("period.timezone is invalid");
  }

  const start = Date.parse(period.start);
  const end = Date.parse(period.end);

  if (!Number.isFinite(start)) {
    throw new NetNeedEvaluationError("period.start must be a valid datetime");
  }

  if (!Number.isFinite(end)) {
    throw new NetNeedEvaluationError("period.end must be a valid datetime");
  }

  if (end < start) {
    throw new NetNeedEvaluationError(
      "period.end must be greater than or equal to period.start",
    );
  }

  return clonePeriod(period);
}

function buildTrace(
  input: Readonly<NetNeedEvaluationInput>,
): Readonly<NetNeedEvaluationTrace> {
  return Object.freeze({
    etc: input.etc,
    effectiveRainfall: input.effectiveRainfall,
    period: input.period,
  });
}

function sameEvidence(
  left: TechnicalValueEvidence,
  right: TechnicalValueEvidence,
): boolean {
  return (
    left.sourceReference === right.sourceReference &&
    left.evidenceReference === right.evidenceReference
  );
}

function selectResultEvidence(
  etc: Readonly<IdentifiedTechnicalValue<string>>,
  effectiveRainfall: Readonly<IdentifiedTechnicalValue<string>>,
): TechnicalValueEvidence | undefined {
  if (etc.evidence !== undefined && effectiveRainfall.evidence !== undefined) {
    return sameEvidence(etc.evidence, effectiveRainfall.evidence)
      ? etc.evidence
      : undefined;
  }

  return etc.evidence ?? effectiveRainfall.evidence;
}

export function createNetNeedEvaluationInput(
  input: NetNeedEvaluationInput,
): Readonly<NetNeedEvaluationInput> {
  const etc = validateMmValue(input.etc, "etc");
  const effectiveRainfall = validateMmValue(
    input.effectiveRainfall,
    "effectiveRainfall",
  );
  const period = validatePeriod(input.period);

  if (etc.identity.path === effectiveRainfall.identity.path) {
    throw new NetNeedEvaluationError(
      "etc.identity.path and effectiveRainfall.identity.path must be different",
    );
  }

  return Object.freeze({
    etc,
    effectiveRainfall,
    period,
  });
}

export function evaluateNetNeed(
  input: NetNeedEvaluationInput,
): Readonly<NetNeedEvaluationResult> {
  const validatedInput = createNetNeedEvaluationInput(input);
  const trace = buildTrace(validatedInput);
  const value = validatedInput.etc.value - validatedInput.effectiveRainfall.value;

  if (value < 0) {
    return Object.freeze({
      kind: "UNRESOLVED",
      status: deriveUnresolvedStatus(
        validatedInput.etc.status,
        validatedInput.effectiveRainfall.status,
      ),
      issues: Object.freeze([
        issue(
          "netNeed.excessRainfall.unspecified",
          "Current contracts do not define how to represent effective rainfall exceeding ETc",
          "effectiveRainfall.value",
        ),
      ]),
      trace,
    });
  }

  const status = deriveResultStatus(
    validatedInput.etc.status,
    validatedInput.effectiveRainfall.status,
  );
  const evidence = selectResultEvidence(
    validatedInput.etc,
    validatedInput.effectiveRainfall,
  );

  const technicalValue = createIdentifiedTechnicalValue({
    value,
    unit: "mm",
    provenance: Provenance.CALCULATED,
    status,
    ...(evidence === undefined ? {} : { evidence }),
    identity: {
      domain: "agronomy",
      field: "netNeed",
      path: AGRONOMY_NET_NEED_RESULT_PATH,
    },
  });

  return Object.freeze({
    kind: "RESOLVED",
    technicalValue,
    methodRef: AGRONOMY_NET_NEED_METHOD_REF,
    dependencyRefs: Object.freeze([
      validatedInput.etc.identity.path,
      validatedInput.effectiveRainfall.identity.path,
    ]),
    trace,
  });
}
