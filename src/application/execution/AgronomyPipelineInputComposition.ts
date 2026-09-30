import type { IdentifiedTechnicalValue } from "../../domain/shared/TechnicalValue.js";
import type {
  EffectiveRainfallExternalAdapterResult,
  ReadyEffectiveRainfallExternalInput,
  ReadyEtoExternalInput,
  EtoExternalAdapterResult,
} from "../../../engine/domain/agronomy/AgronomyExternalInputAdapters.js";
import type {
  ApplicationEfficiencyAdapterResult,
  KcCatalogAdapterResult,
  ReadyApplicationEfficiency,
  ReadyKcCatalogEntry,
} from "../../../engine/domain/agronomy/AgronomyKcAndEfficiencyAdapters.js";
import type { IrrigationSystemEfficiencyContract } from "../../../engine/domain/agronomy/IrrigationSystemEfficiencyContract.js";
import {
  prepareAgronomyExternalInputs,
  type PreparedAgronomyExternalInputs,
} from "./AgronomyExternalInputPreparation.js";
import type { AgronomyExternalInputPayloads } from "../../../engine/domain/agronomy/AgronomyExternalInputPorts.js";

export interface AgronomyPipelineInputSources {
  readonly eto?: EtoExternalAdapterResult;
  readonly kc?: KcCatalogAdapterResult;
  readonly effectiveRainfall?: EffectiveRainfallExternalAdapterResult;
  readonly applicationEfficiency?: ApplicationEfficiencyAdapterResult;
}

export type AgronomyPipelineInputName =
  | "eto"
  | "kc"
  | "effectiveRainfall"
  | "applicationEfficiency";

export interface PendingAgronomyPipelineInput {
  readonly input: AgronomyPipelineInputName;
  readonly missingFields: readonly string[];
}

export interface AgronomyPipelineInputComposition {
  readonly values: readonly IdentifiedTechnicalValue[];
  readonly sourceRefs: readonly string[];
  readonly pendingInputs: readonly PendingAgronomyPipelineInput[];
  readonly period?: ReadyEtoExternalInput["contract"]["period"];
  readonly irrigationSystemEfficiency?: IrrigationSystemEfficiencyContract;
}

function addValue(
  values: IdentifiedTechnicalValue[],
  value: IdentifiedTechnicalValue,
): void {
  const existingIndex = values.findIndex(
    (existing) => existing.identity.path === value.identity.path,
  );

  if (existingIndex === -1) {
    values.push(value);
  } else {
    values[existingIndex] = value;
  }
}

function addReadyInput(
  values: IdentifiedTechnicalValue[],
  sourceRefs: string[],
  pendingInputs: PendingAgronomyPipelineInput[],
  input: AgronomyPipelineInputName,
  result:
    | ReadyEtoExternalInput
    | ReadyKcCatalogEntry
    | ReadyEffectiveRainfallExternalInput
    | ReadyApplicationEfficiency,
): void {
  if ("input" in result.contract) {
    if (result.contract.input.value === undefined) {
      pendingInputs.push({ input, missingFields: Object.freeze(["value"]) });
      return;
    }

    addValue(values, result.contract.input.value);
  }

  sourceRefs.push(result.contract.sourceRef);
}

export function composeAgronomyPipelineInputs(
  existingValues: readonly IdentifiedTechnicalValue[],
  sources: AgronomyPipelineInputSources | undefined,
  externalInputs?: AgronomyPipelineExternalInputs,
): Readonly<AgronomyPipelineInputComposition> {
  const preparedExternal: PreparedAgronomyExternalInputs | undefined =
    externalInputs === undefined
      ? undefined
      : prepareAgronomyExternalInputs(externalInputs.payloads);
  const resolvedSources: AgronomyPipelineInputSources | undefined =
    preparedExternal === undefined
      ? sources
      : {
          eto: sources?.eto ?? preparedExternal.eto,
          kc: sources?.kc ?? preparedExternal.kc,
          effectiveRainfall:
            sources?.effectiveRainfall ?? preparedExternal.effectiveRainfall,
          ...(sources?.applicationEfficiency === undefined
            ? {}
            : { applicationEfficiency: sources.applicationEfficiency }),
        };
  const values = [...existingValues];
  const sourceRefs: string[] = [];
  const pendingInputs: PendingAgronomyPipelineInput[] = [];

  if (resolvedSources?.eto?.status === "PENDING") {
    pendingInputs.push({ input: "eto", missingFields: resolvedSources.eto.missingFields });
  } else if (resolvedSources?.eto?.status === "READY") {
    addReadyInput(values, sourceRefs, pendingInputs, "eto", resolvedSources.eto);
  }

  if (resolvedSources?.kc?.status === "PENDING") {
    pendingInputs.push({ input: "kc", missingFields: resolvedSources.kc.missingFields });
  } else if (resolvedSources?.kc?.status === "READY") {
    addReadyInput(values, sourceRefs, pendingInputs, "kc", resolvedSources.kc);
  }

  if (resolvedSources?.effectiveRainfall?.status === "PENDING") {
    pendingInputs.push({
      input: "effectiveRainfall",
      missingFields: resolvedSources.effectiveRainfall.missingFields,
    });
  } else if (resolvedSources?.effectiveRainfall?.status === "READY") {
    addReadyInput(
      values,
      sourceRefs,
      pendingInputs,
      "effectiveRainfall",
      resolvedSources.effectiveRainfall,
    );
  }

  let irrigationSystemEfficiency: IrrigationSystemEfficiencyContract | undefined;
  if (resolvedSources?.applicationEfficiency?.status === "PENDING") {
    pendingInputs.push({
      input: "applicationEfficiency",
      missingFields: resolvedSources.applicationEfficiency.missingFields,
    });
  } else if (resolvedSources?.applicationEfficiency?.status === "READY") {
    irrigationSystemEfficiency = resolvedSources.applicationEfficiency.contract;
    sourceRefs.push(resolvedSources.applicationEfficiency.contract.sourceRef);
  }

  const etoPeriod = resolvedSources?.eto?.status === "READY"
    ? resolvedSources.eto.contract.period
    : undefined;

  return Object.freeze({
    values: Object.freeze(values),
    sourceRefs: Object.freeze([...new Set(sourceRefs)]),
    pendingInputs: Object.freeze(pendingInputs),
    ...(etoPeriod === undefined ? {} : { period: etoPeriod }),
    ...(irrigationSystemEfficiency === undefined
      ? {}
      : { irrigationSystemEfficiency }),
  });
}

export interface AgronomyPipelineExternalInputs {
  readonly payloads: AgronomyExternalInputPayloads;
}