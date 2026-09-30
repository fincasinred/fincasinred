import {
  AGRONOMY_KC_PATH,
  DOCUMENTED_ORIENTATIVE_APPLICATION_EFFICIENCY,
  createApplicationEfficiencyContract,
  type AgronomyAvailableStatus,
  type ApplicationEfficiencyContract,
  type KcCatalogContract,
} from "./AgronomyInputContracts.js";
import {
  IrrigationSystemKind,
  type IrrigationSystemDescriptor,
} from "./IrrigationSystemEfficiencyContract.js";
import {
  createIdentifiedTechnicalValue,
  type IdentifiedTechnicalValue,
} from "../../../src/domain/shared/TechnicalValue.js";
import type { Provenance } from "../../../src/domain/shared/Provenance.js";
import type { AgroSourceReference } from "./AgroSourceContract.js";

export interface KcCatalogAdapterInput {
  readonly value?: number;
  readonly status?: AgronomyAvailableStatus;
  readonly provenance?: Provenance;
  readonly cropId?: string;
  readonly phase?: string;
  readonly catalogVersion?: string;
  readonly sourceRef?: string;
  readonly source?: AgroSourceReference;
  readonly condition?: string;
}

export interface PendingKcCatalogEntry {
  readonly status: "PENDING";
  readonly missingFields: readonly string[];
}

export interface ReadyKcCatalogEntry {
  readonly status: "READY";
  readonly contract: Readonly<KcCatalogContract>;
}

export type KcCatalogAdapterResult =
  | PendingKcCatalogEntry
  | ReadyKcCatalogEntry;

export interface ApplicationEfficiencyAdapterInput {
  readonly irrigationSystem: IrrigationSystemDescriptor;
  readonly sourceRef?: string;
  readonly provenance?: Provenance;
  readonly status?: AgronomyAvailableStatus;
}

export interface PendingApplicationEfficiency {
  readonly status: "PENDING";
  readonly missingFields: readonly string[];
}

export interface ReadyApplicationEfficiency {
  readonly status: "READY";
  readonly contract: Readonly<ApplicationEfficiencyContract>;
}

export type ApplicationEfficiencyAdapterResult =
  | PendingApplicationEfficiency
  | ReadyApplicationEfficiency;

function isNonEmptyString(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}

function pendingKc(missingFields: readonly string[]): PendingKcCatalogEntry {
  return Object.freeze({ status: "PENDING", missingFields: Object.freeze([...missingFields]) });
}

export function adaptKcCatalogEntry(
  input: KcCatalogAdapterInput,
): KcCatalogAdapterResult {
  const missingFields: string[] = [];
  if (input.value === undefined) missingFields.push("value");
  if (input.status === undefined) missingFields.push("status");
  if (input.provenance === undefined) missingFields.push("provenance");
  if (!isNonEmptyString(input.cropId)) missingFields.push("cropId");
  if (!isNonEmptyString(input.phase)) missingFields.push("phase");
  if (!isNonEmptyString(input.catalogVersion)) missingFields.push("catalogVersion");
  if (!isNonEmptyString(input.sourceRef)) missingFields.push("sourceRef");

  if (missingFields.length > 0) return pendingKc(missingFields);

  const value: Readonly<IdentifiedTechnicalValue<"coefficient">> =
    createIdentifiedTechnicalValue({
      value: input.value as number,
      unit: "coefficient",
      provenance: input.provenance as Provenance,
      status: input.status as AgronomyAvailableStatus,
      identity: {
        domain: "agronomy",
        field: "kc",
        path: AGRONOMY_KC_PATH,
      },
      evidence: { sourceReference: input.sourceRef as string },
    });

  return Object.freeze({
    status: "READY",
    contract: Object.freeze({
      input: { status: input.status as AgronomyAvailableStatus, value },
      cropId: input.cropId as string,
      phase: input.phase as string,
      catalogVersion: input.catalogVersion as string,
      sourceRef: input.sourceRef as string,
      ...(input.source === undefined ? {} : { source: input.source }),
      ...(input.condition === undefined ? {} : { condition: input.condition }),
    }),
  });
}

function documentedEfficiencyValue(
  irrigationSystem: IrrigationSystemDescriptor,
): number | undefined {
  if (irrigationSystem.kind === IrrigationSystemKind.DRIP) {
    return DOCUMENTED_ORIENTATIVE_APPLICATION_EFFICIENCY.drip;
  }

  if (irrigationSystem.kind === IrrigationSystemKind.SPRINKLER) {
    return DOCUMENTED_ORIENTATIVE_APPLICATION_EFFICIENCY.sprinkler;
  }

  if (irrigationSystem.systemId === "microaspersion") {
    return DOCUMENTED_ORIENTATIVE_APPLICATION_EFFICIENCY.microSprinkler;
  }

  if (irrigationSystem.systemId === "surface") {
    return DOCUMENTED_ORIENTATIVE_APPLICATION_EFFICIENCY.surface;
  }

  return undefined;
}

export function adaptDocumentedApplicationEfficiency(
  input: ApplicationEfficiencyAdapterInput,
): ApplicationEfficiencyAdapterResult {
  const missingFields: string[] = [];
  if (!isNonEmptyString(input.sourceRef)) missingFields.push("sourceRef");
  if (input.provenance === undefined) missingFields.push("provenance");
  if (input.status === undefined) missingFields.push("status");

  const value = documentedEfficiencyValue(input.irrigationSystem);
  if (value === undefined) missingFields.push("irrigationSystem.efficiency");

  if (missingFields.length > 0) {
    return Object.freeze({
      status: "PENDING",
      missingFields: Object.freeze(missingFields),
    });
  }

  if (value === undefined) {
    return Object.freeze({
      status: "PENDING",
      missingFields: Object.freeze(["irrigationSystem.efficiency"]),
    });
  }

  const contract = createApplicationEfficiencyContract({
    sourceRef: input.sourceRef as string,
    irrigationSystem: input.irrigationSystem,
    efficiency: {
      value,
      unit: "coefficient",
      provenance: input.provenance as Provenance,
      status: input.status as AgronomyAvailableStatus,
      identity: {
        domain: "agronomy",
        field: "irrigationSystemEfficiency",
        path: "agronomy.irrigationSystemEfficiency",
      },
      evidence: { sourceReference: input.sourceRef as string },
    },
  });

  return Object.freeze({ status: "READY", contract });
}