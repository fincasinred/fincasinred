import {
  EffectiveRainfallContract,
  EffectiveRainfallMode,
} from "./EffectiveRainfallContract.js";
import { AgroRuleState } from "./AgroRuleContract.js";
import { RainfallMonthlyPrecipitation } from "./RainfallDailySeries.js";
import {
  createIdentifiedTechnicalValue,
  type IdentifiedTechnicalValue,
} from "../../../src/domain/shared/TechnicalValue.js";
import { Provenance } from "../../../src/domain/shared/Provenance.js";
import { ValidationStatus } from "../../../src/domain/shared/ValidationStatus.js";

/**
 * Fuente documental del método V1 de lluvia efectiva mensual (única fuente
 * aceptada hasta la fecha para el modo ESTIMATION).
 */
export const FAO_EFFECTIVE_RAINFALL_MONTHLY_METHOD_REF =
  "fao.effective-rainfall.monthly.v1";
export const FAO_EFFECTIVE_RAINFALL_MONTHLY_SOURCE_REFERENCE =
  "FAO, Irrigation Water Needs / Effective Rainfall (monthly method V1)";
export const AGRONOMY_MONTHLY_EFFECTIVE_RAINFALL_ESTIMATION_PATH =
  "agronomy.effectiveRainfall.monthlyEstimation";

/** Umbral mensual (mm) que separa los dos tramos del método FAO V1. */
const FAO_V1_PRECIPITATION_THRESHOLD_MM = 75;
/** Límite superior de la pendiente para la que la fuente indica aplicabilidad (documentado como "4-5 %"). */
const FAO_V1_MAX_APPLICABLE_SLOPE_PERCENT = 5;

/**
 * P > 75 mm/mes -> Pe = 0,8*P - 25 ; P <= 75 mm/mes -> Pe = 0,6*P - 10 ; Pe >= 0.
 * Ningún coeficiente distinto de los publicados por la fuente se introduce aquí.
 */
function applyFaoMonthlyEffectiveRainfallV1(totalPrecipitationMm: number): number {
  const rawValue =
    totalPrecipitationMm > FAO_V1_PRECIPITATION_THRESHOLD_MM
      ? 0.8 * totalPrecipitationMm - 25
      : 0.6 * totalPrecipitationMm - 10;

  return Math.max(rawValue, 0);
}

export interface MonthlyEffectiveRainfallEstimationInput {
  readonly monthly: RainfallMonthlyPrecipitation;
  readonly contract: EffectiveRainfallContract;
  readonly conditions?: Readonly<Record<string, unknown>>;
}

export interface MonthlyEffectiveRainfallEstimationIssue {
  readonly code: string;
  readonly message: string;
  readonly path: string;
}

export interface MonthlyEffectiveRainfallEstimationTrace {
  readonly monthly: Readonly<RainfallMonthlyPrecipitation>;
  readonly contract: Readonly<EffectiveRainfallContract>;
  readonly conditions?: Readonly<Record<string, unknown>>;
}

export interface ResolvedMonthlyEffectiveRainfallEstimation {
  readonly kind: "RESOLVED";
  readonly technicalValue: Readonly<IdentifiedTechnicalValue<"mm">>;
  readonly methodRef: string;
  readonly dependencyRefs: readonly string[];
  readonly trace: Readonly<MonthlyEffectiveRainfallEstimationTrace>;
}

export interface UnresolvedMonthlyEffectiveRainfallEstimation {
  readonly kind: "UNRESOLVED";
  readonly status: ValidationStatus;
  readonly issues: readonly MonthlyEffectiveRainfallEstimationIssue[];
  readonly trace: Readonly<MonthlyEffectiveRainfallEstimationTrace>;
}

export type MonthlyEffectiveRainfallEstimationResult =
  | ResolvedMonthlyEffectiveRainfallEstimation
  | UnresolvedMonthlyEffectiveRainfallEstimation;

export class MonthlyEffectiveRainfallEstimationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "MonthlyEffectiveRainfallEstimationError";
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

function issue(
  code: string,
  message: string,
  path: string,
): Readonly<MonthlyEffectiveRainfallEstimationIssue> {
  return Object.freeze({ code, message, path });
}

function validateMonthly(
  monthly: RainfallMonthlyPrecipitation,
): Readonly<RainfallMonthlyPrecipitation> {
  if (!isPlainRecord(monthly)) {
    throw new MonthlyEffectiveRainfallEstimationError("monthly is required");
  }

  if (typeof monthly.totalPrecipitationMm !== "number" || monthly.totalPrecipitationMm < 0) {
    throw new MonthlyEffectiveRainfallEstimationError(
      "monthly.totalPrecipitationMm must be a non-negative number",
    );
  }

  return monthly;
}

function validateContract(
  contract: EffectiveRainfallContract,
): Readonly<EffectiveRainfallContract> {
  if (!isPlainRecord(contract)) {
    throw new MonthlyEffectiveRainfallEstimationError("contract is required");
  }

  if (contract.mode !== EffectiveRainfallMode.ESTIMATION) {
    throw new MonthlyEffectiveRainfallEstimationError("contract.mode must be ESTIMATION");
  }

  return contract;
}

function buildTrace(
  input: Readonly<MonthlyEffectiveRainfallEstimationInput>,
): Readonly<MonthlyEffectiveRainfallEstimationTrace> {
  return Object.freeze({
    monthly: input.monthly,
    contract: input.contract,
    ...(input.conditions === undefined ? {} : { conditions: input.conditions }),
  });
}

/** Solo detecta la condición ya conocida hoy: pendiente porcentual no disponible. */
function findUnresolvedSlopeCondition(
  contract: Readonly<EffectiveRainfallContract>,
  conditions: Readonly<Record<string, unknown>> | undefined,
): Readonly<MonthlyEffectiveRainfallEstimationIssue> | undefined {
  const requiresSlope = contract.inputSpecs.some((spec) => spec.field === "slopePercent");

  if (!requiresSlope) {
    return undefined;
  }

  if (conditions?.slopePercent !== undefined) {
    return undefined;
  }

  return issue(
    "effectiveRainfall.condition.slopeUnresolved",
    "slopePercent is required by the contract but only absolute elevation difference and " +
      "distance are available; slope is not inferred automatically",
    "conditions.slopePercent",
  );
}

/** La fuente FAO documenta aplicabilidad aproximada hasta una pendiente máxima de 4-5 %. */
function findSlopeExceedingApplicability(
  conditions: Readonly<Record<string, unknown>> | undefined,
): Readonly<MonthlyEffectiveRainfallEstimationIssue> | undefined {
  const slopePercent = conditions?.slopePercent;

  if (typeof slopePercent !== "number" || !Number.isFinite(slopePercent)) {
    return undefined;
  }

  if (slopePercent <= FAO_V1_MAX_APPLICABLE_SLOPE_PERCENT) {
    return undefined;
  }

  return issue(
    "effectiveRainfall.condition.slopeExceedsApplicability",
    `The FAO monthly method V1 documents applicability up to approximately ${FAO_V1_MAX_APPLICABLE_SLOPE_PERCENT}% slope`,
    "conditions.slopePercent",
  );
}

/**
 * Aplica el método FAO mensual declarado en el contrato ESTIMATION.
 *
 * Método V1 (FAO, Irrigation Water Needs / Effective Rainfall): P > 75 mm/mes
 * -> Pe = 0,8*P - 25 ; P <= 75 mm/mes -> Pe = 0,6*P - 10 ; Pe nunca negativo.
 * Aplicable hasta una pendiente máxima aproximada de 4-5 %; si la pendiente
 * requerida no está disponible o excede ese límite, el resultado se bloquea
 * en vez de inventarse.
 */
export function evaluateMonthlyEffectiveRainfallEstimation(
  input: MonthlyEffectiveRainfallEstimationInput,
): Readonly<MonthlyEffectiveRainfallEstimationResult> {
  const monthly = validateMonthly(input.monthly);
  const contract = validateContract(input.contract);
  const trace = buildTrace({
    monthly,
    contract,
    ...(input.conditions === undefined ? {} : { conditions: input.conditions }),
  });

  if (contract.ruleContract === undefined || contract.ruleContract.state !== AgroRuleState.READY) {
    return Object.freeze({
      kind: "UNRESOLVED",
      status: ValidationStatus.BLOCKED,
      issues: Object.freeze([
        issue(
          "effectiveRainfall.method.missing",
          "Monthly effective rainfall estimation requires a ready executable rule contract",
          "contract.ruleContract",
        ),
      ]),
      trace,
    });
  }

  const slopeIssue = findUnresolvedSlopeCondition(contract, input.conditions);
  if (slopeIssue !== undefined) {
    return Object.freeze({
      kind: "UNRESOLVED",
      status: ValidationStatus.BLOCKED,
      issues: Object.freeze([slopeIssue]),
      trace,
    });
  }

  const slopeExceedsIssue = findSlopeExceedingApplicability(input.conditions);
  if (slopeExceedsIssue !== undefined) {
    return Object.freeze({
      kind: "UNRESOLVED",
      status: ValidationStatus.BLOCKED,
      issues: Object.freeze([slopeExceedsIssue]),
      trace,
    });
  }

  if (monthly.status === ValidationStatus.BLOCKED) {
    return Object.freeze({
      kind: "UNRESOLVED",
      status: ValidationStatus.BLOCKED,
      issues: Object.freeze([
        issue(
          "effectiveRainfall.data.insufficient",
          "The monthly precipitation total has no observed days",
          "monthly.observedDayCount",
        ),
      ]),
      trace,
    });
  }

  const status =
    monthly.status === ValidationStatus.VALIDATED
      ? ValidationStatus.VALIDATED
      : ValidationStatus.PROVISIONAL;

  const technicalValue = createIdentifiedTechnicalValue({
    value: applyFaoMonthlyEffectiveRainfallV1(monthly.totalPrecipitationMm),
    unit: "mm",
    provenance: Provenance.CALCULATED,
    status,
    evidence: {
      sourceReference: FAO_EFFECTIVE_RAINFALL_MONTHLY_SOURCE_REFERENCE,
      evidenceReference: `${monthly.sourceReference}:${monthly.stationId}:${monthly.month}`,
    },
    identity: {
      domain: "agronomy",
      field: "effectiveRainfallEstimation",
      path: AGRONOMY_MONTHLY_EFFECTIVE_RAINFALL_ESTIMATION_PATH,
    },
  });

  return Object.freeze({
    kind: "RESOLVED",
    technicalValue,
    methodRef: FAO_EFFECTIVE_RAINFALL_MONTHLY_METHOD_REF,
    dependencyRefs: Object.freeze([contract.ruleContract.ruleId]),
    trace,
  });
}
