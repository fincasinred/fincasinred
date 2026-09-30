import {
  createIdentifiedTechnicalValue,
  type IdentifiedTechnicalValue,
  type TechnicalValueEvidence,
} from "../../../src/domain/shared/TechnicalValue.js";
import { Provenance } from "../../../src/domain/shared/Provenance.js";
import { ValidationStatus } from "../../../src/domain/shared/ValidationStatus.js";
import {
  createIrrigationSystemEfficiencyContract,
  type IrrigationSystemEfficiencyContract,
  IRRIGATION_SYSTEM_EFFICIENCY_UNIT,
} from "./IrrigationSystemEfficiencyContract.js";
import { AGRONOMY_NET_NEED_RESULT_PATH } from "./NetNeedEvaluation.js";

export const AGRONOMY_GROSS_NEED_METHOD_REF = "agronomy.compute_gross_need";
export const AGRONOMY_GROSS_NEED_RESULT_PATH = "agronomy.grossNeed";

const AGRONOMY_NET_NEED_FIELD = "netNeed";

export interface GrossNeedEvaluationInput {
  readonly netNeed: IdentifiedTechnicalValue<string>;
  readonly irrigationSystemEfficiency: IrrigationSystemEfficiencyContract;
}

export interface GrossNeedEvaluationIssue {
  readonly code: string;
  readonly message: string;
  readonly path: string;
}

export interface GrossNeedEvaluationTrace {
  readonly netNeed: Readonly<IdentifiedTechnicalValue<string>>;
  readonly irrigationSystemEfficiency: Readonly<IrrigationSystemEfficiencyContract>;
}

export interface ResolvedGrossNeedEvaluation {
  readonly kind: "RESOLVED";
  readonly technicalValue: Readonly<IdentifiedTechnicalValue<"mm">>;
  readonly methodRef: typeof AGRONOMY_GROSS_NEED_METHOD_REF;
  readonly dependencyRefs: readonly string[];
  readonly trace: Readonly<GrossNeedEvaluationTrace>;
}

export interface UnresolvedGrossNeedEvaluation {
  readonly kind: "UNRESOLVED";
  readonly status: ValidationStatus;
  readonly issues: readonly GrossNeedEvaluationIssue[];
  readonly trace: Readonly<GrossNeedEvaluationTrace>;
}

export type GrossNeedEvaluationResult =
  | ResolvedGrossNeedEvaluation
  | UnresolvedGrossNeedEvaluation;

export class GrossNeedEvaluationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "GrossNeedEvaluationError";
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

function isAdmissibleInputStatus(value: ValidationStatus): boolean {
  return (
    value === ValidationStatus.VALIDATED ||
    value === ValidationStatus.PROVISIONAL ||
    value === ValidationStatus.PENDING ||
    value === ValidationStatus.BLOCKED
  );
}

function deriveResultStatus(
  netNeedStatus: ValidationStatus,
  efficiencyStatus: ValidationStatus,
): ValidationStatus {
  if (
    netNeedStatus === ValidationStatus.BLOCKED ||
    efficiencyStatus === ValidationStatus.BLOCKED
  ) {
    return ValidationStatus.BLOCKED;
  }

  if (
    netNeedStatus === ValidationStatus.PENDING ||
    efficiencyStatus === ValidationStatus.PENDING
  ) {
    return ValidationStatus.PENDING;
  }

  if (
    netNeedStatus === ValidationStatus.PROVISIONAL ||
    efficiencyStatus === ValidationStatus.PROVISIONAL
  ) {
    return ValidationStatus.PROVISIONAL;
  }

  return ValidationStatus.VALIDATED;
}

function validateNetNeed(
  value: IdentifiedTechnicalValue<string>,
): Readonly<IdentifiedTechnicalValue<"mm">> {
  const technicalValue = createIdentifiedTechnicalValue(value);

  if (technicalValue.unit !== "mm") {
    throw new GrossNeedEvaluationError("netNeed.unit must be mm");
  }

  if (technicalValue.value < 0) {
    throw new GrossNeedEvaluationError(
      "netNeed.value must be greater than or equal to 0",
    );
  }

  if (!isAdmissibleInputStatus(technicalValue.status)) {
    throw new GrossNeedEvaluationError(
      "netNeed.status is not admissible for gross need evaluation",
    );
  }

  if (technicalValue.identity.field !== AGRONOMY_NET_NEED_FIELD) {
    throw new GrossNeedEvaluationError(
      `netNeed.identity.field must be ${AGRONOMY_NET_NEED_FIELD}`,
    );
  }

  if (technicalValue.identity.path !== AGRONOMY_NET_NEED_RESULT_PATH) {
    throw new GrossNeedEvaluationError(
      `netNeed.identity.path must be ${AGRONOMY_NET_NEED_RESULT_PATH}`,
    );
  }

  if (
    technicalValue.identity.domain !== undefined &&
    technicalValue.identity.domain !== "agronomy"
  ) {
    throw new GrossNeedEvaluationError(
      'netNeed.identity.domain must be "agronomy" when provided',
    );
  }

  return technicalValue as Readonly<IdentifiedTechnicalValue<"mm">>;
}

function validateIrrigationSystemEfficiency(
  value: IrrigationSystemEfficiencyContract,
): Readonly<IrrigationSystemEfficiencyContract> {
  try {
    return createIrrigationSystemEfficiencyContract(value);
  } catch (error) {
    if (error instanceof Error) {
      throw new GrossNeedEvaluationError(error.message);
    }

    throw error;
  }
}

function buildTrace(
  input: Readonly<GrossNeedEvaluationInput>,
): Readonly<GrossNeedEvaluationTrace> {
  return Object.freeze({
    netNeed: input.netNeed,
    irrigationSystemEfficiency: input.irrigationSystemEfficiency,
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
  netNeed: Readonly<IdentifiedTechnicalValue<string>>,
  efficiency: Readonly<IdentifiedTechnicalValue<typeof IRRIGATION_SYSTEM_EFFICIENCY_UNIT>>,
): TechnicalValueEvidence | undefined {
  if (netNeed.evidence !== undefined && efficiency.evidence !== undefined) {
    return sameEvidence(netNeed.evidence, efficiency.evidence)
      ? netNeed.evidence
      : undefined;
  }

  return netNeed.evidence ?? efficiency.evidence;
}

export function createGrossNeedEvaluationInput(
  input: GrossNeedEvaluationInput,
): Readonly<GrossNeedEvaluationInput> {
  if (!isPlainRecord(input)) {
    throw new GrossNeedEvaluationError("gross need evaluation input is required");
  }

  const netNeed = validateNetNeed(input.netNeed);
  const irrigationSystemEfficiency = validateIrrigationSystemEfficiency(
    input.irrigationSystemEfficiency,
  );

  if (
    netNeed.identity.path ===
    irrigationSystemEfficiency.efficiency.identity.path
  ) {
    throw new GrossNeedEvaluationError(
      "netNeed.identity.path and irrigationSystemEfficiency.efficiency.identity.path must be different",
    );
  }

  return Object.freeze({
    netNeed,
    irrigationSystemEfficiency,
  });
}

export function evaluateGrossNeed(
  input: GrossNeedEvaluationInput,
): Readonly<GrossNeedEvaluationResult> {
  const validatedInput = createGrossNeedEvaluationInput(input);
  const trace = buildTrace(validatedInput);
  const efficiency = validatedInput.irrigationSystemEfficiency.efficiency;
  const status = deriveResultStatus(validatedInput.netNeed.status, efficiency.status);
  const evidence = selectResultEvidence(validatedInput.netNeed, efficiency);

  const technicalValue = createIdentifiedTechnicalValue({
    value: validatedInput.netNeed.value / efficiency.value,
    unit: "mm",
    provenance: Provenance.CALCULATED,
    status,
    ...(evidence === undefined ? {} : { evidence }),
    identity: {
      domain: "agronomy",
      field: "grossNeed",
      path: AGRONOMY_GROSS_NEED_RESULT_PATH,
    },
  });

  return Object.freeze({
    kind: "RESOLVED",
    technicalValue,
    methodRef: AGRONOMY_GROSS_NEED_METHOD_REF,
    dependencyRefs: Object.freeze([
      validatedInput.netNeed.identity.path,
      validatedInput.irrigationSystemEfficiency.efficiency.identity.path,
    ]),
    trace,
  });
}
