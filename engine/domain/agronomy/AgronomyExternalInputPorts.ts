import type {
  EffectiveRainfallExternalAdapterInput,
  EtoExternalAdapterInput,
} from "./AgronomyExternalInputAdapters.js";
import type { KcCatalogAdapterInput } from "./AgronomyKcAndEfficiencyAdapters.js";

/** Puertos para providers futuros: sin transporte, autenticacion ni seleccion. */
export interface SiarEtoProvider {
  fetchEto(
    request: Readonly<Record<string, unknown>>,
  ): Promise<Readonly<EtoExternalAdapterInput>>;
}

export interface SiarEffectiveRainfallProvider {
  fetchEffectiveRainfall(
    request: Readonly<Record<string, unknown>>,
  ): Promise<Readonly<EffectiveRainfallExternalAdapterInput>>;
}

export interface VersionedKcCatalogProvider {
  findKc(
    request: Readonly<Record<string, unknown>>,
  ): Promise<Readonly<KcCatalogAdapterInput>>;
}

export interface AgronomyExternalInputPayloads {
  readonly eto?: EtoExternalAdapterInput;
  readonly effectiveRainfall?: EffectiveRainfallExternalAdapterInput;
  readonly kc?: KcCatalogAdapterInput;
}