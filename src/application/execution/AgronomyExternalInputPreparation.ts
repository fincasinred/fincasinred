import {
  adaptExternalEffectiveRainfall,
  adaptExternalEto,
  type EffectiveRainfallExternalAdapterResult,
  type EtoExternalAdapterResult,
} from "../../../engine/domain/agronomy/AgronomyExternalInputAdapters.js";
import {
  adaptKcCatalogEntry,
  type KcCatalogAdapterResult,
} from "../../../engine/domain/agronomy/AgronomyKcAndEfficiencyAdapters.js";
import type { AgronomyExternalInputPayloads } from "../../../engine/domain/agronomy/AgronomyExternalInputPorts.js";

export interface PreparedAgronomyExternalInputs {
  readonly eto: EtoExternalAdapterResult;
  readonly effectiveRainfall: EffectiveRainfallExternalAdapterResult;
  readonly kc: KcCatalogAdapterResult;
}

export function prepareAgronomyExternalInputs(
  payloads: AgronomyExternalInputPayloads,
): Readonly<PreparedAgronomyExternalInputs> {
  return Object.freeze({
    eto: adaptExternalEto(payloads.eto ?? {}),
    effectiveRainfall: adaptExternalEffectiveRainfall(
      payloads.effectiveRainfall ?? {},
    ),
    kc: adaptKcCatalogEntry(payloads.kc ?? {}),
  });
}