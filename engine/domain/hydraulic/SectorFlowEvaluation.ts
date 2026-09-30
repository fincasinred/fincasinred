import {
  createIdentifiedTechnicalValue,
  type IdentifiedTechnicalValue,
  type TechnicalValueEvidence,
} from "../../../src/domain/shared/TechnicalValue.js";
import { Provenance } from "../../../src/domain/shared/Provenance.js";
import { ValidationStatus } from "../../../src/domain/shared/ValidationStatus.js";

export const HYDRAULIC_SECTOR_FLOW_METHOD_REF =
  "hydraulic.calculate_sector_flow";
export const HYDRAULIC_SECTOR_FLOW_RESULT_PATH = "hydraulic.sector.flow";

export interface SectorEmitterGroupInput {
  readonly groupId: string;
  readonly activeSimultaneously: boolean;
  readonly emitterCount: IdentifiedTechnicalValue<"count">;
  readonly emitterFlow: IdentifiedTechnicalValue<"lpm">;
}

export interface SectorFlowEvaluationInput {
  readonly sectorId: string;
  readonly emitterGroups: readonly SectorEmitterGroupInput[];
}

export interface SectorFlowEvaluationIssue {
  readonly code: string;
  readonly message: string;
  readonly path: string;
}

export interface SectorFlowEvaluationTrace {
  readonly sectorId: string;
  readonly activeGroups: readonly string[];
  readonly emitterGroups: readonly SectorEmitterGroupInput[];
}

export interface ResolvedSectorFlowEvaluation {
  readonly kind: "RESOLVED";
  readonly technicalValue: Readonly<IdentifiedTechnicalValue<"lpm">>;
  readonly methodRef: typeof HYDRAULIC_SECTOR_FLOW_METHOD_REF;
  readonly dependencyRefs: readonly string[];
  readonly trace: Readonly<SectorFlowEvaluationTrace>;
}

export interface UnresolvedSectorFlowEvaluation {
  readonly kind: "UNRESOLVED";
  readonly status: ValidationStatus;
  readonly issues: readonly SectorFlowEvaluationIssue[];
  readonly trace: Readonly<SectorFlowEvaluationTrace>;
}

export type SectorFlowEvaluationResult =
  | ResolvedSectorFlowEvaluation
  | UnresolvedSectorFlowEvaluation;

export class SectorFlowEvaluationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "SectorFlowEvaluationError";
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
  values: readonly IdentifiedTechnicalValue[],
): ValidationStatus {
  if (values.some((value) => value.status === ValidationStatus.BLOCKED)) {
    return ValidationStatus.BLOCKED;
  }

  if (values.some((value) => value.status === ValidationStatus.PENDING)) {
    return ValidationStatus.PENDING;
  }

  if (values.some((value) => value.status === ValidationStatus.PROVISIONAL)) {
    return ValidationStatus.PROVISIONAL;
  }

  return ValidationStatus.VALIDATED;
}

function validateSectorId(value: unknown): string {
  if (!isNonEmptyString(value)) {
    throw new SectorFlowEvaluationError("sectorId is required");
  }

  return value;
}

function validateGroupId(value: unknown, index: number): string {
  if (!isNonEmptyString(value)) {
    throw new SectorFlowEvaluationError(
      `emitterGroups[${index}].groupId is required`,
    );
  }

  return value;
}

function validateTechnicalValue<Unit extends string>(
  value: IdentifiedTechnicalValue<Unit>,
  unit: Unit,
  path: string,
): Readonly<IdentifiedTechnicalValue<Unit>> {
  const technicalValue = createIdentifiedTechnicalValue(value);

  if (technicalValue.unit !== unit) {
    throw new SectorFlowEvaluationError(`${path}.unit must be ${unit}`);
  }

  if (!isAdmissibleStatus(technicalValue.status)) {
    throw new SectorFlowEvaluationError(`${path}.status is not admissible`);
  }

  return technicalValue;
}

function validateEmitterGroup(
  value: SectorEmitterGroupInput,
  index: number,
): Readonly<SectorEmitterGroupInput> {
  if (!isPlainRecord(value)) {
    throw new SectorFlowEvaluationError(`emitterGroups[${index}] is required`);
  }

  const groupId = validateGroupId(value.groupId, index);

  if (typeof value.activeSimultaneously !== "boolean") {
    throw new SectorFlowEvaluationError(
      `emitterGroups[${index}].activeSimultaneously must be a boolean`,
    );
  }

  const emitterCount = validateTechnicalValue(
    value.emitterCount,
    "count",
    `emitterGroups[${index}].emitterCount`,
  );
  if (!Number.isInteger(emitterCount.value) || emitterCount.value <= 0) {
    throw new SectorFlowEvaluationError(
      `emitterGroups[${index}].emitterCount.value must be a positive integer`,
    );
  }

  const emitterFlow = validateTechnicalValue(
    value.emitterFlow,
    "lpm",
    `emitterGroups[${index}].emitterFlow`,
  );
  if (!Number.isFinite(emitterFlow.value) || emitterFlow.value <= 0) {
    throw new SectorFlowEvaluationError(
      `emitterGroups[${index}].emitterFlow.value must be greater than 0`,
    );
  }

  return Object.freeze({
    groupId,
    activeSimultaneously: value.activeSimultaneously,
    emitterCount,
    emitterFlow,
  });
}

function selectEvidence(
  groups: readonly SectorEmitterGroupInput[],
): TechnicalValueEvidence | undefined {
  for (const group of groups) {
    if (group.activeSimultaneously) {
      return group.emitterFlow.evidence ?? group.emitterCount.evidence;
    }
  }

  return undefined;
}

function buildTrace(
  sectorId: string,
  emitterGroups: readonly SectorEmitterGroupInput[],
): Readonly<SectorFlowEvaluationTrace> {
  return Object.freeze({
    sectorId,
    activeGroups: Object.freeze(
      emitterGroups
        .filter((group) => group.activeSimultaneously)
        .map((group) => group.groupId),
    ),
    emitterGroups: Object.freeze([...emitterGroups]),
  });
}

export function createSectorFlowEvaluationInput(
  input: SectorFlowEvaluationInput,
): Readonly<SectorFlowEvaluationInput> {
  if (!isPlainRecord(input)) {
    throw new SectorFlowEvaluationError("sector flow evaluation input is required");
  }

  const sectorId = validateSectorId(input.sectorId);
  if (!Array.isArray(input.emitterGroups) || input.emitterGroups.length === 0) {
    throw new SectorFlowEvaluationError("emitterGroups is required");
  }

  const emitterGroups = input.emitterGroups.map(validateEmitterGroup);
  const groupIds = emitterGroups.map((group) => group.groupId);
  if (new Set(groupIds).size !== groupIds.length) {
    throw new SectorFlowEvaluationError("emitterGroups.groupId must be unique");
  }

  return Object.freeze({ sectorId, emitterGroups: Object.freeze(emitterGroups) });
}

export function evaluateSectorFlow(
  input: SectorFlowEvaluationInput,
): Readonly<SectorFlowEvaluationResult> {
  const validatedInput = createSectorFlowEvaluationInput(input);
  const activeGroups = validatedInput.emitterGroups.filter(
    (group) => group.activeSimultaneously,
  );
  const trace = buildTrace(validatedInput.sectorId, validatedInput.emitterGroups);

  if (activeGroups.length === 0) {
    return Object.freeze({
      kind: "UNRESOLVED",
      status: ValidationStatus.BLOCKED,
      issues: Object.freeze([
        {
          code: "sectorFlow.activeGroups.missing",
          message: "at least one emitter group must be active simultaneously",
          path: "emitterGroups",
        },
      ]),
      trace,
    });
  }

  const inputValues = activeGroups.flatMap((group) => [
    group.emitterCount,
    group.emitterFlow,
  ]);
  const value = activeGroups.reduce(
    (total, group) => total + group.emitterCount.value * group.emitterFlow.value,
    0,
  );
  const dependencyRefs = activeGroups.flatMap((group) => [
    group.emitterCount.identity.path,
    group.emitterFlow.identity.path,
  ]);
  const evidence = selectEvidence(activeGroups);

  return Object.freeze({
    kind: "RESOLVED",
    technicalValue: createIdentifiedTechnicalValue({
      value,
      unit: "lpm",
      provenance: Provenance.CALCULATED,
      status: deriveStatus(inputValues),
      ...(evidence === undefined ? {} : { evidence }),
      identity: {
        domain: "hydraulic",
        field: "sectorFlow",
        path: HYDRAULIC_SECTOR_FLOW_RESULT_PATH,
      },
    }),
    methodRef: HYDRAULIC_SECTOR_FLOW_METHOD_REF,
    dependencyRefs: Object.freeze(dependencyRefs),
    trace,
  });
}