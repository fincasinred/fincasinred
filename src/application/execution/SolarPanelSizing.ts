import {
  createIdentifiedTechnicalValue,
  type IdentifiedTechnicalValue,
} from "../../domain/shared/TechnicalValue.js";
import {
  TechnicalProductCategory,
  type TechnicalSolarPanelProduct,
} from "../../domain/catalog/TechnicalProduct.js";
import { Provenance } from "../../domain/shared/Provenance.js";
import { ValidationStatus } from "../../domain/shared/ValidationStatus.js";

export const SOLAR_PANEL_POWER_UNIT = "Wp" as const;
export const SOLAR_PANEL_COUNT_UNIT = "panel" as const;
export const INSTALLED_PV_POWER_UNIT = "kWp" as const;

export type SolarPanelCount = IdentifiedTechnicalValue<typeof SOLAR_PANEL_COUNT_UNIT>;
export type InstalledPvPowerKwp = IdentifiedTechnicalValue<typeof INSTALLED_PV_POWER_UNIT>;

export interface SolarPanelSizingInput {
  readonly sectorId: string;
  readonly requiredPvPowerKwp?: Readonly<IdentifiedTechnicalValue>;
  readonly solarPanelProduct?: Readonly<TechnicalSolarPanelProduct>;
  readonly sourceRefs?: readonly string[];
}

export type SolarPanelSizingIssue = {
  readonly code: string;
  readonly message: string;
  readonly path: string;
};

export type SolarPanelSizingResult =
  | {
      readonly status: "PENDING";
      readonly missingFields: readonly string[];
      readonly issues: readonly [];
      readonly sourceRefs: readonly string[];
    }
  | {
      readonly status: "BLOCKED";
      readonly missingFields: readonly [];
      readonly issues: readonly SolarPanelSizingIssue[];
      readonly sourceRefs: readonly string[];
    }
  | {
      readonly status: "READY";
      readonly sectorId: string;
      readonly panelCount: Readonly<SolarPanelCount>;
      readonly installedPvPowerKwp: Readonly<InstalledPvPowerKwp>;
      readonly sourceRefs: readonly string[];
    };

const unusableStatuses = new Set([
  ValidationStatus.PENDING,
  ValidationStatus.BLOCKED,
  ValidationStatus.INVALID,
  ValidationStatus.OBSOLETE,
]);

function issue(code: string, message: string, path: string): SolarPanelSizingIssue {
  return { code, message, path };
}

function sourceRefs(input: SolarPanelSizingInput): readonly string[] {
  return Object.freeze([
    ...new Set([
      ...(input.sourceRefs ?? []),
      ...(input.requiredPvPowerKwp?.evidence?.sourceReference === undefined
        ? []
        : [input.requiredPvPowerKwp.evidence.sourceReference]),
      ...(input.requiredPvPowerKwp?.evidence?.evidenceReference === undefined
        ? []
        : [input.requiredPvPowerKwp.evidence.evidenceReference]),
      ...(input.solarPanelProduct === undefined
        ? []
        : [
            input.solarPanelProduct.technicalSource.documentReference,
            input.solarPanelProduct.technicalSource.sourceUrl,
          ]),
    ]),
  ]);
}

function blocked(
  code: string,
  message: string,
  path: string,
  refs: readonly string[],
): Readonly<SolarPanelSizingResult> {
  return Object.freeze({
    status: "BLOCKED" as const,
    missingFields: Object.freeze([]) as readonly [],
    issues: Object.freeze([issue(code, message, path)]),
    sourceRefs: refs,
  });
}

export function calculateSolarPanelSizing(
  input: SolarPanelSizingInput,
): Readonly<SolarPanelSizingResult> {
  const refs = sourceRefs(input);
  const required = input.requiredPvPowerKwp;
  const requiredPath = `energy.${input.sectorId}.solarSizing.requiredPvPowerKwp`;
  const productPath = `energy.${input.sectorId}.solarPanelProduct`;

  if (input.sectorId.trim().length === 0) {
    return blocked("solarPanelSizing.sector.required", "sectorId is required", productPath, refs);
  }

  if (required === undefined || input.solarPanelProduct === undefined) {
    return Object.freeze({
      status: "PENDING" as const,
      missingFields: Object.freeze([
        ...(required === undefined ? ["requiredPvPowerKwp"] : []),
        ...(input.solarPanelProduct === undefined ? ["solarPanelProduct"] : []),
      ]),
      issues: Object.freeze([]) as readonly [],
      sourceRefs: refs,
    });
  }

  if (
    required.unit !== INSTALLED_PV_POWER_UNIT ||
    required.identity.path !== requiredPath ||
    !Number.isFinite(required.value) ||
    required.value <= 0 ||
    unusableStatuses.has(required.status)
  ) {
    return blocked(
      "solarPanelSizing.requiredPower.invalid",
      "requiredPvPowerKwp must be finite, positive, sector-scoped and usable",
      required.identity.path,
      refs,
    );
  }

  const product = input.solarPanelProduct;
  const nominalPowerWp = product.technicalSpecification.nominalPowerWp;
  if (
    product.category !== TechnicalProductCategory.SOLAR_PANEL ||
    !Number.isFinite(nominalPowerWp) ||
    nominalPowerWp <= 0 ||
    product.technicalStatus === ValidationStatus.PENDING ||
    product.technicalStatus === ValidationStatus.BLOCKED ||
    product.technicalStatus === ValidationStatus.INVALID ||
    product.technicalStatus === ValidationStatus.OBSOLETE
  ) {
    return blocked(
      "solarPanelSizing.product.invalid",
      "solar panel product must have a positive nominalPowerWp and usable technical status",
      productPath,
      refs,
    );
  }

  const panelPowerKwp = nominalPowerWp / 1000;
  const panelCount = Math.ceil(required.value / panelPowerKwp);
  const installedPvPowerKwp = panelCount * panelPowerKwp;
  const evidence = {
    ...(required.evidence?.sourceReference === undefined
      ? {}
      : { sourceReference: required.evidence.sourceReference }),
    ...(required.evidence?.evidenceReference === undefined
      ? {}
      : { evidenceReference: required.evidence.evidenceReference }),
    sourceReference: product.technicalSource.documentReference,
    evidenceReference: product.technicalSource.sourceUrl,
  };

  return Object.freeze({
    status: "READY" as const,
    sectorId: input.sectorId,
    panelCount: createIdentifiedTechnicalValue({
      value: panelCount,
      unit: SOLAR_PANEL_COUNT_UNIT,
      provenance: Provenance.CALCULATED,
      status: ValidationStatus.VALIDATED,
      evidence,
      identity: {
        domain: "energy",
        field: "panelCount",
        path: `energy.${input.sectorId}.solarSizing.panelCount`,
      },
    }),
    installedPvPowerKwp: createIdentifiedTechnicalValue({
      value: installedPvPowerKwp,
      unit: INSTALLED_PV_POWER_UNIT,
      provenance: Provenance.CALCULATED,
      status: ValidationStatus.VALIDATED,
      evidence,
      identity: {
        domain: "energy",
        field: "installedPvPowerKwp",
        path: `energy.${input.sectorId}.solarSizing.installedPvPowerKwp`,
      },
    }),
    sourceRefs: refs,
  });
}
