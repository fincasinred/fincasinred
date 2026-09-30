import {
  EffectiveRainfallContract,
  EffectiveRainfallMode,
} from "./EffectiveRainfallContract.js";
import {
  RainfallTemporalBalanceContract,
  RainfallTemporalWindow,
} from "./RainfallTemporalBalanceContract.js";
import { RainfallExcessContract } from "./RainfallExcessContract.js";
import { AgroRuleState } from "./AgroRuleContract.js";
import { AgroSourceContract } from "./AgroSourceContract.js";
import type { MonthlyEffectiveRainfallEstimationResult } from "./MonthlyEffectiveRainfallEstimation.js";
import {
  createIdentifiedTechnicalValue,
  type IdentifiedTechnicalValue,
} from "../../../src/domain/shared/TechnicalValue.js";
import { ValidationStatus } from "../../../src/domain/shared/ValidationStatus.js";

export const AGRONOMY_EFFECTIVE_RAINFALL_RESULT_PATH =
  "agronomy.effectiveRainfall";

export interface EffectiveRainfallEvaluationInput {
  readonly rainfall: IdentifiedTechnicalValue<string>;
  readonly period: RainfallTemporalWindow;
  readonly contract?: EffectiveRainfallContract;
  readonly sourceContract?: AgroSourceContract;
  readonly temporalBalance?: RainfallTemporalBalanceContract;
  readonly excess?: RainfallExcessContract;
  readonly effectiveRainfall?: IdentifiedTechnicalValue<string>;
  readonly monthlyEstimation?: Readonly<MonthlyEffectiveRainfallEstimationResult>;
  readonly conditions?: Readonly<Record<string, unknown>>;
}

export interface EffectiveRainfallEvaluationIssue {
  readonly code: string;
  readonly message: string;
  readonly path: string;
}

export interface EffectiveRainfallEvaluationTrace {
  readonly rainfall: Readonly<IdentifiedTechnicalValue<string>>;
  readonly period: Readonly<RainfallTemporalWindow>;
  readonly contract?: EffectiveRainfallContract;
  readonly sourceContract?: AgroSourceContract;
  readonly temporalBalance?: RainfallTemporalBalanceContract;
  readonly excess?: RainfallExcessContract;
  readonly effectiveRainfall?: Readonly<IdentifiedTechnicalValue<string>>;
  readonly monthlyEstimation?: Readonly<MonthlyEffectiveRainfallEstimationResult>;
  readonly conditions?: Readonly<Record<string, unknown>>;
}

export interface ResolvedEffectiveRainfallEvaluation {
  readonly kind: "RESOLVED";
  readonly technicalValue: Readonly<IdentifiedTechnicalValue<"mm">>;
  readonly methodRef: string;
  readonly dependencyRefs: readonly string[];
  readonly trace: Readonly<EffectiveRainfallEvaluationTrace>;
}

export interface UnresolvedEffectiveRainfallEvaluation {
  readonly kind: "UNRESOLVED";
  readonly status: ValidationStatus;
  readonly issues: readonly EffectiveRainfallEvaluationIssue[];
  readonly trace: Readonly<EffectiveRainfallEvaluationTrace>;
}

export type EffectiveRainfallEvaluationResult =
  | ResolvedEffectiveRainfallEvaluation
  | UnresolvedEffectiveRainfallEvaluation;

export class EffectiveRainfallEvaluationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "EffectiveRainfallEvaluationError";
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
  rainfallStatus: ValidationStatus,
  effectiveRainfallStatus: ValidationStatus,
): ValidationStatus {
  if (
    rainfallStatus === ValidationStatus.BLOCKED ||
    effectiveRainfallStatus === ValidationStatus.BLOCKED
  ) {
    return ValidationStatus.BLOCKED;
  }

  if (
    rainfallStatus === ValidationStatus.PENDING ||
    effectiveRainfallStatus === ValidationStatus.PENDING
  ) {
    return ValidationStatus.PENDING;
  }

  if (
    rainfallStatus === ValidationStatus.PROVISIONAL ||
    effectiveRainfallStatus === ValidationStatus.PROVISIONAL
  ) {
    return ValidationStatus.PROVISIONAL;
  }

  return ValidationStatus.VALIDATED;
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
): Readonly<EffectiveRainfallEvaluationIssue> {
  return Object.freeze({ code, message, path });
}

function validateMmValue(
  value: IdentifiedTechnicalValue<string>,
  fieldName: string,
): Readonly<IdentifiedTechnicalValue<string>> {
  const technicalValue = createIdentifiedTechnicalValue(value);

  if (technicalValue.unit !== "mm") {
    throw new EffectiveRainfallEvaluationError(`${fieldName}.unit must be mm`);
  }

  if (technicalValue.value < 0) {
    throw new EffectiveRainfallEvaluationError(
      `${fieldName}.value must be greater than or equal to 0`,
    );
  }

  if (!isAdmissibleInputStatus(technicalValue.status)) {
    throw new EffectiveRainfallEvaluationError(
      `${fieldName}.status is not admissible for effective rainfall evaluation`,
    );
  }

  return technicalValue;
}

function validatePeriod(period: RainfallTemporalWindow): Readonly<RainfallTemporalWindow> {
  if (!isPlainRecord(period)) {
    throw new EffectiveRainfallEvaluationError("period is required");
  }

  if (!isNonEmptyString(period.start)) {
    throw new EffectiveRainfallEvaluationError("period.start is required");
  }

  if (!isNonEmptyString(period.end)) {
    throw new EffectiveRainfallEvaluationError("period.end is required");
  }

  const start = new Date(period.start);
  const end = new Date(period.end);

  if (Number.isNaN(start.getTime())) {
    throw new EffectiveRainfallEvaluationError("period.start must be a valid ISO date");
  }

  if (Number.isNaN(end.getTime())) {
    throw new EffectiveRainfallEvaluationError("period.end must be a valid ISO date");
  }

  if (end.getTime() < start.getTime()) {
    throw new EffectiveRainfallEvaluationError(
      "period.end must be greater than or equal to period.start",
    );
  }

  if (period.timezone !== undefined && !isNonEmptyString(period.timezone)) {
    throw new EffectiveRainfallEvaluationError("period.timezone is invalid");
  }

  return clonePeriod(period);
}

function validateContract(
  contract: EffectiveRainfallContract | undefined,
): EffectiveRainfallContract | undefined {
  if (contract === undefined) {
    return undefined;
  }

  if (!isPlainRecord(contract)) {
    throw new EffectiveRainfallEvaluationError("contract must be a plain object");
  }

  if (!Object.values(EffectiveRainfallMode).includes(contract.mode)) {
    throw new EffectiveRainfallEvaluationError("contract.mode is invalid");
  }

  if (!isPlainRecord(contract.metadata) || !isNonEmptyString(contract.metadata.ruleId)) {
    throw new EffectiveRainfallEvaluationError("contract.metadata.ruleId is required");
  }

  if (
    contract.ruleContract !== undefined &&
    (!isPlainRecord(contract.ruleContract) ||
      !isNonEmptyString(contract.ruleContract.ruleId) ||
      !Object.values(AgroRuleState).includes(contract.ruleContract.state))
  ) {
    throw new EffectiveRainfallEvaluationError("contract.ruleContract is invalid");
  }

  return contract;
}

function validateConditions(
  conditions: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> | undefined {
  if (conditions === undefined) {
    return undefined;
  }

  if (!isPlainRecord(conditions)) {
    throw new EffectiveRainfallEvaluationError("conditions must be a plain object");
  }

  return Object.freeze({ ...conditions });
}

function buildTrace(
  input: Readonly<EffectiveRainfallEvaluationInput>,
): Readonly<EffectiveRainfallEvaluationTrace> {
  return Object.freeze({
    rainfall: input.rainfall,
    period: input.period,
    ...(input.contract === undefined ? {} : { contract: input.contract }),
    ...(input.sourceContract === undefined
      ? {}
      : { sourceContract: input.sourceContract }),
    ...(input.temporalBalance === undefined
      ? {}
      : { temporalBalance: input.temporalBalance }),
    ...(input.excess === undefined ? {} : { excess: input.excess }),
    ...(input.effectiveRainfall === undefined
      ? {}
      : { effectiveRainfall: input.effectiveRainfall }),
    ...(input.monthlyEstimation === undefined
      ? {}
      : { monthlyEstimation: input.monthlyEstimation }),
    ...(input.conditions === undefined ? {} : { conditions: input.conditions }),
  });
}

export function createEffectiveRainfallEvaluationInput(
  input: EffectiveRainfallEvaluationInput,
): Readonly<EffectiveRainfallEvaluationInput> {
  const rainfall = validateMmValue(input.rainfall, "rainfall");
  const period = validatePeriod(input.period);
  const contract = validateContract(input.contract);
  const conditions = validateConditions(input.conditions);

  let effectiveRainfall: Readonly<IdentifiedTechnicalValue<string>> | undefined;
  if (input.effectiveRainfall !== undefined) {
    effectiveRainfall = validateMmValue(
      input.effectiveRainfall,
      "effectiveRainfall",
    );
  }

  if (
    effectiveRainfall !== undefined &&
    rainfall.identity.path === effectiveRainfall.identity.path
  ) {
    throw new EffectiveRainfallEvaluationError(
      "rainfall.identity.path and effectiveRainfall.identity.path must be different",
    );
  }

  return Object.freeze({
    rainfall,
    period,
    ...(contract === undefined ? {} : { contract }),
    ...(input.sourceContract === undefined
      ? {}
      : { sourceContract: input.sourceContract }),
    ...(input.temporalBalance === undefined
      ? {}
      : { temporalBalance: input.temporalBalance }),
    ...(input.excess === undefined ? {} : { excess: input.excess }),
    ...(effectiveRainfall === undefined ? {} : { effectiveRainfall }),
    ...(input.monthlyEstimation === undefined
      ? {}
      : { monthlyEstimation: input.monthlyEstimation }),
    ...(conditions === undefined ? {} : { conditions }),
  });
}

export function evaluateEffectiveRainfall(
  input: EffectiveRainfallEvaluationInput,
): Readonly<EffectiveRainfallEvaluationResult> {
  const validatedInput = createEffectiveRainfallEvaluationInput(input);
  const trace = buildTrace(validatedInput);
  const rainfallStatus = validatedInput.rainfall.status;

  if (validatedInput.conditions?.rainfallApplicable === false) {
    return Object.freeze({
      kind: "UNRESOLVED",
      status: ValidationStatus.BLOCKED,
      issues: Object.freeze([
        issue(
          "effectiveRainfall.notApplicable",
          "Effective rainfall is not applicable under the current conditions",
          "conditions.rainfallApplicable",
        ),
      ]),
      trace,
    });
  }

  if (
    validatedInput.contract === undefined ||
    validatedInput.contract.ruleContract === undefined
  ) {
    return Object.freeze({
      kind: "UNRESOLVED",
      status:
        rainfallStatus === ValidationStatus.PENDING
          ? ValidationStatus.PENDING
          : ValidationStatus.BLOCKED,
      issues: Object.freeze([
        issue(
          "effectiveRainfall.method.missing",
          "Effective rainfall requires a ready executable rule contract",
          "contract.ruleContract",
        ),
      ]),
      trace,
    });
  }

  if (validatedInput.contract.ruleContract.state !== AgroRuleState.READY) {
    return Object.freeze({
      kind: "UNRESOLVED",
      status: ValidationStatus.BLOCKED,
      issues: Object.freeze([
        issue(
          "effectiveRainfall.method.unavailable",
          "Effective rainfall rule contract is not ready for execution",
          "contract.ruleContract.state",
        ),
      ]),
      trace,
    });
  }

  if (validatedInput.contract.mode === EffectiveRainfallMode.ESTIMATION) {
    if (validatedInput.monthlyEstimation === undefined) {
      return Object.freeze({
        kind: "UNRESOLVED",
        status:
          rainfallStatus === ValidationStatus.PENDING
            ? ValidationStatus.PENDING
            : ValidationStatus.BLOCKED,
        issues: Object.freeze([
          issue(
            "effectiveRainfall.data.insufficient",
            "A monthly effective rainfall estimation is required for ESTIMATION mode",
            "monthlyEstimation",
          ),
        ]),
        trace,
      });
    }

    if (validatedInput.monthlyEstimation.kind === "UNRESOLVED") {
      return Object.freeze({
        kind: "UNRESOLVED",
        status: validatedInput.monthlyEstimation.status,
        issues: Object.freeze(
          validatedInput.monthlyEstimation.issues.map((estimationIssue) =>
            issue(estimationIssue.code, estimationIssue.message, estimationIssue.path),
          ),
        ),
        trace,
      });
    }

    const estimationStatus = deriveResultStatus(
      validatedInput.rainfall.status,
      validatedInput.monthlyEstimation.technicalValue.status,
    );

    const estimationTechnicalValue = createIdentifiedTechnicalValue({
      value: validatedInput.monthlyEstimation.technicalValue.value,
      unit: "mm",
      provenance: validatedInput.monthlyEstimation.technicalValue.provenance,
      status: estimationStatus,
      ...(validatedInput.monthlyEstimation.technicalValue.evidence === undefined
        ? {}
        : { evidence: validatedInput.monthlyEstimation.technicalValue.evidence }),
      identity: {
        domain: "agronomy",
        field: "effectiveRainfall",
        path: AGRONOMY_EFFECTIVE_RAINFALL_RESULT_PATH,
      },
    });

    return Object.freeze({
      kind: "RESOLVED",
      technicalValue: estimationTechnicalValue,
      methodRef: validatedInput.monthlyEstimation.methodRef,
      dependencyRefs: Object.freeze([validatedInput.rainfall.identity.path]),
      trace,
    });
  }

  if (validatedInput.contract.mode !== EffectiveRainfallMode.OBSERVED) {
    return Object.freeze({
      kind: "UNRESOLVED",
      status: ValidationStatus.BLOCKED,
      issues: Object.freeze([
        issue(
          "effectiveRainfall.method.notSupported",
          "This mission only executes OBSERVED effective rainfall inputs",
          "contract.mode",
        ),
      ]),
      trace,
    });
  }

  if (validatedInput.effectiveRainfall === undefined) {
    return Object.freeze({
      kind: "UNRESOLVED",
      status:
        rainfallStatus === ValidationStatus.PENDING
          ? ValidationStatus.PENDING
          : ValidationStatus.BLOCKED,
      issues: Object.freeze([
        issue(
          "effectiveRainfall.data.insufficient",
          "Observed effective rainfall data is required for OBSERVED mode",
          "effectiveRainfall",
        ),
      ]),
      trace,
    });
  }

  const status = deriveResultStatus(
    validatedInput.rainfall.status,
    validatedInput.effectiveRainfall.status,
  );

  const technicalValue = createIdentifiedTechnicalValue({
    value: validatedInput.effectiveRainfall.value,
    unit: "mm",
    provenance: validatedInput.effectiveRainfall.provenance,
    status,
    ...(validatedInput.effectiveRainfall.evidence === undefined
      ? {}
      : { evidence: validatedInput.effectiveRainfall.evidence }),
    identity: {
      domain: "agronomy",
      field: "effectiveRainfall",
      path: AGRONOMY_EFFECTIVE_RAINFALL_RESULT_PATH,
    },
  });

  return Object.freeze({
    kind: "RESOLVED",
    technicalValue,
    methodRef: validatedInput.contract.ruleContract.ruleId,
    dependencyRefs: Object.freeze([
      validatedInput.rainfall.identity.path,
      validatedInput.effectiveRainfall.identity.path,
    ]),
    trace,
  });
}
