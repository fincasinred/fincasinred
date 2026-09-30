import {
  AGRONOMY_EFFECTIVE_RAINFALL_PATH,
  AGRONOMY_ETO_PATH,
  type EffectiveRainfallExternalContract,
  type EtoExternalContract,
  type AgronomyAvailableStatus,
} from "./AgronomyInputContracts.js";
import { createIdentifiedTechnicalValue } from "../../../src/domain/shared/TechnicalValue.js";
import type { Provenance } from "../../../src/domain/shared/Provenance.js";
import type { RainfallTemporalWindow } from "./RainfallTemporalBalanceContract.js";
import type { AgroSourceReference } from "./AgroSourceContract.js";

export const SIAR_PROVIDER = "SIAR" as const;
export const PENMAN_MONTEITH_METHODOLOGY = "PENMAN_MONTEITH" as const;

interface ExternalTechnicalInput<Unit extends string> {
  readonly value?: number;
  readonly status?: AgronomyAvailableStatus;
  readonly provenance?: Provenance;
  readonly period?: RainfallTemporalWindow;
  readonly sourceRef?: string;
  readonly source?: AgroSourceReference;
}

export interface EtoExternalAdapterInput extends ExternalTechnicalInput<"mm"> {
  readonly stationId?: string;
  readonly temporalResolution?: string;
}

export interface EffectiveRainfallExternalAdapterInput
  extends ExternalTechnicalInput<"mm"> {
  readonly methodology?: string;
}

export interface PendingExternalInput {
  readonly status: "PENDING";
  readonly missingFields: readonly string[];
}

export interface ReadyEtoExternalInput {
  readonly status: "READY";
  readonly contract: Readonly<EtoExternalContract>;
}

export interface ReadyEffectiveRainfallExternalInput {
  readonly status: "READY";
  readonly contract: Readonly<EffectiveRainfallExternalContract>;
}

export type EtoExternalAdapterResult =
  | PendingExternalInput
  | ReadyEtoExternalInput;

export type EffectiveRainfallExternalAdapterResult =
  | PendingExternalInput
  | ReadyEffectiveRainfallExternalInput;

function missingExternalFields<Unit extends string>(
  input: ExternalTechnicalInput<Unit>,
  extraFields: Readonly<Record<string, unknown>>,
): readonly string[] {
  const missing: string[] = [];

  if (input.value === undefined) missing.push("value");
  if (input.status === undefined) missing.push("status");
  if (input.provenance === undefined) missing.push("provenance");
  if (input.period === undefined) missing.push("period");
  if (input.sourceRef === undefined) missing.push("sourceRef");

  for (const [field, value] of Object.entries(extraFields)) {
    if (value === undefined) missing.push(field);
  }

  return Object.freeze(missing);
}

function pending(missingFields: readonly string[]): PendingExternalInput {
  return Object.freeze({ status: "PENDING", missingFields });
}

export function adaptExternalEto(
  input: EtoExternalAdapterInput,
): EtoExternalAdapterResult {
  const missingFields = missingExternalFields(input, {
    stationId: input.stationId,
    temporalResolution: input.temporalResolution,
  });

  if (missingFields.length > 0) return pending(missingFields);

  const value = createIdentifiedTechnicalValue({
    value: input.value as number,
    unit: "mm",
    provenance: input.provenance as Provenance,
    status: input.status as AgronomyAvailableStatus,
    identity: {
      domain: "agronomy",
      field: "eto",
      path: AGRONOMY_ETO_PATH,
    },
    evidence: { sourceReference: input.sourceRef as string },
  });

  return Object.freeze({
    status: "READY",
    contract: Object.freeze({
      input: { status: input.status as AgronomyAvailableStatus, value },
      provider: SIAR_PROVIDER,
      sourceRef: input.sourceRef as string,
      period: input.period as RainfallTemporalWindow,
      stationId: input.stationId as string,
      methodology: PENMAN_MONTEITH_METHODOLOGY,
      temporalResolution: input.temporalResolution as string,
      ...(input.source === undefined ? {} : { source: input.source }),
    }),
  });
}

export function adaptExternalEffectiveRainfall(
  input: EffectiveRainfallExternalAdapterInput,
): EffectiveRainfallExternalAdapterResult {
  const missingFields = missingExternalFields(input, {
    methodology: input.methodology,
  });

  if (missingFields.length > 0) return pending(missingFields);

  const value = createIdentifiedTechnicalValue({
    value: input.value as number,
    unit: "mm",
    provenance: input.provenance as Provenance,
    status: input.status as AgronomyAvailableStatus,
    identity: {
      domain: "agronomy",
      field: "effectiveRainfallObserved",
      path: AGRONOMY_EFFECTIVE_RAINFALL_PATH,
    },
    evidence: { sourceReference: input.sourceRef as string },
  });

  return Object.freeze({
    status: "READY",
    contract: Object.freeze({
      input: { status: input.status as AgronomyAvailableStatus, value },
      provider: SIAR_PROVIDER,
      sourceRef: input.sourceRef as string,
      period: input.period as RainfallTemporalWindow,
      methodology: input.methodology as string,
      ...(input.source === undefined ? {} : { source: input.source }),
    }),
  });
}