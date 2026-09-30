import type { IdentifiedTechnicalValue } from "../../../src/domain/shared/TechnicalValue.js";
import { ValidationStatus } from "../../../src/domain/shared/ValidationStatus.js";
import type { AgroSourceReference } from "./AgroSourceContract.js";
import {
  createIrrigationSystemEfficiencyContract,
  type IrrigationSystemEfficiencyContract,
  type IrrigationSystemDescriptor,
} from "./IrrigationSystemEfficiencyContract.js";
import type { RainfallTemporalWindow } from "./RainfallTemporalBalanceContract.js";

export const AGRONOMY_ETO_PATH = "agronomy.inputs.eto";
export const AGRONOMY_KC_PATH = "agronomy.inputs.kc";
export const AGRONOMY_RAINFALL_PATH = "agronomy.inputs.rainfall";
export const AGRONOMY_EFFECTIVE_RAINFALL_PATH =
  "agronomy.inputs.effectiveRainfallObserved";

export type AgronomyPendingStatus =
  | ValidationStatus.PENDING
  | ValidationStatus.BLOCKED;
export type AgronomyAvailableStatus =
  | ValidationStatus.VALIDATED
  | ValidationStatus.PROVISIONAL;

interface PendingAgronomyInput {
  readonly status: AgronomyPendingStatus;
  readonly value?: undefined;
  readonly missingReason: string;
}

interface AvailableAgronomyInput<Unit extends string> {
  readonly status: AgronomyAvailableStatus;
  readonly value: IdentifiedTechnicalValue<Unit>;
}

export type AgronomyInputState<Unit extends string> =
  | PendingAgronomyInput
  | AvailableAgronomyInput<Unit>;

export interface EtoExternalContract {
  readonly input: AgronomyInputState<"mm">;
  readonly provider: string;
  readonly sourceRef: string;
  readonly period: RainfallTemporalWindow;
  readonly stationId: string;
  readonly methodology: "PENMAN_MONTEITH";
  readonly temporalResolution: string;
  readonly source?: AgroSourceReference;
}

export interface KcCatalogContract {
  readonly input: AgronomyInputState<"coefficient">;
  readonly cropId: string;
  readonly phase: string;
  readonly catalogVersion: string;
  readonly sourceRef: string;
  readonly source?: AgroSourceReference;
  readonly condition?: string;
}

export interface EffectiveRainfallExternalContract {
  readonly input: AgronomyInputState<"mm">;
  readonly provider: string;
  readonly sourceRef: string;
  readonly period: RainfallTemporalWindow;
  readonly methodology: string;
  readonly source?: AgroSourceReference;
}

export const DOCUMENTED_ORIENTATIVE_APPLICATION_EFFICIENCY = Object.freeze({
  drip: 0.9,
  microSprinkler: 0.85,
  sprinkler: 0.8,
  surface: 0.65,
} as const);

export const APPLICATION_EFFICIENCY_UNIT = "coefficient" as const;
export const APPLICATION_EFFICIENCY_PATH =
  "agronomy.irrigationSystemEfficiency";

export interface ApplicationEfficiencyContract
  extends IrrigationSystemEfficiencyContract {
  readonly efficiencyType: "APPLICATION";
  readonly basis: "DOCUMENTED_ORIENTATIVE";
  readonly sourceRef: string;
}

export interface CreateApplicationEfficiencyContractInput
  extends IrrigationSystemEfficiencyContract {
  readonly sourceRef: string;
}

export function createApplicationEfficiencyContract(
  input: CreateApplicationEfficiencyContractInput,
): Readonly<ApplicationEfficiencyContract> {
  if (typeof input.sourceRef !== "string" || input.sourceRef.trim().length === 0) {
    throw new Error("sourceRef is required for application efficiency");
  }

  if (
    "uniformity" in input ||
    "uniformityCoefficient" in input ||
    "hydraulicLoss" in input ||
    "hydraulicLosses" in input ||
    "pressureLoss" in input
  ) {
    throw new Error(
      "application efficiency must not contain hydraulic uniformity or loss fields",
    );
  }

  const contract = createIrrigationSystemEfficiencyContract(input);
  return Object.freeze({
    ...contract,
    efficiencyType: "APPLICATION",
    basis: "DOCUMENTED_ORIENTATIVE",
    sourceRef: input.sourceRef,
  });
}