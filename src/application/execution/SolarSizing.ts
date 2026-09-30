import {
  prepareSolarSizing,
  solarResourcePath,
  type SolarSizingPreparationInput,
  type SolarSizingPreparationIssue,
  type SolarSizingPreparationResult,
} from "./SolarSizingPreparationContract.js";
import {
  createIdentifiedTechnicalValue,
  type IdentifiedTechnicalValue,
} from "../../domain/shared/TechnicalValue.js";
import { Provenance } from "../../domain/shared/Provenance.js";
import { ValidationStatus } from "../../domain/shared/ValidationStatus.js";

export const SOLAR_SIZING_POWER_UNIT = "kWp" as const;
export const SOLAR_SIZING_SPECIFIC_PRODUCTION_UNIT = "kWh/kWp" as const;

export type RequiredPvPowerKwp = IdentifiedTechnicalValue<typeof SOLAR_SIZING_POWER_UNIT>;

export type SolarSizingResult =
  | {
      readonly status: "PENDING";
      readonly missingFields: readonly string[];
      readonly issues: readonly [];
      readonly sourceRefs: readonly string[];
    }
  | {
      readonly status: "BLOCKED";
      readonly missingFields: readonly [];
      readonly issues: readonly SolarSizingPreparationIssue[];
      readonly sourceRefs: readonly string[];
    }
  | {
      readonly status: "READY";
      readonly sectorId: string;
      readonly requiredPvPowerKwp: Readonly<RequiredPvPowerKwp>;
      readonly sourceRefs: readonly string[];
    };

function blocked(
  message: string,
  path: string,
  sourceRefs: readonly string[],
): Readonly<SolarSizingResult> {
  return Object.freeze({
    status: "BLOCKED" as const,
    missingFields: Object.freeze([]) as readonly [],
    issues: Object.freeze([
      {
        code: "solarSizing.invalid",
        message,
        path,
      },
    ]),
    sourceRefs: Object.freeze([...sourceRefs]),
  });
}

function preparedResult(
  input: SolarSizingPreparationInput,
): Readonly<SolarSizingPreparationResult> {
  return prepareSolarSizing(input);
}

export function calculateSolarSizing(
  input: SolarSizingPreparationInput,
): Readonly<SolarSizingResult> {
  const prepared = preparedResult(input);

  if (prepared.status === "PENDING") {
    return Object.freeze({
      status: "PENDING" as const,
      missingFields: prepared.missingFields,
      issues: Object.freeze([]) as readonly [],
      sourceRefs: prepared.sourceRefs,
    });
  }

  if (prepared.status === "BLOCKED") {
    return Object.freeze({
      status: "BLOCKED" as const,
      missingFields: Object.freeze([]) as readonly [],
      issues: prepared.issues,
      sourceRefs: prepared.sourceRefs,
    });
  }

  const energy = prepared.requirement.energy;
  const solarResource = prepared.requirement.solarResource;
  const production = solarResource.metric;
  const productionPath = `${solarResourcePath(input.sectorId)}.specificProductionKwhPerKwp`;

  if (
    production.unit !== SOLAR_SIZING_SPECIFIC_PRODUCTION_UNIT ||
    production.identity.path !== productionPath ||
    production.value <= 0 ||
    !Number.isFinite(production.value)
  ) {
    return blocked(
      "specificProductionKwhPerKwp must be finite and greater than zero",
      production.identity.path,
      prepared.requirement.sourceRefs,
    );
  }

  if (
    energy.value < 0 ||
    !Number.isFinite(energy.value) ||
    energy.status === ValidationStatus.PENDING ||
    energy.status === ValidationStatus.BLOCKED ||
    energy.status === ValidationStatus.INVALID ||
    energy.status === ValidationStatus.OBSOLETE
  ) {
    return blocked(
      "energy must be finite and non-negative",
      energy.identity.path,
      prepared.requirement.sourceRefs,
    );
  }

  const requiredPvPowerKwp = createIdentifiedTechnicalValue({
    value: energy.value / production.value,
    unit: SOLAR_SIZING_POWER_UNIT,
    provenance: Provenance.CALCULATED,
    status: ValidationStatus.VALIDATED,
    evidence: {
      ...(production.evidence?.sourceReference === undefined
        ? energy.evidence?.sourceReference === undefined
          ? {}
          : { sourceReference: energy.evidence.sourceReference }
        : { sourceReference: production.evidence.sourceReference }),
      ...(production.evidence?.evidenceReference === undefined
        ? energy.evidence?.evidenceReference === undefined
          ? {}
          : { evidenceReference: energy.evidence.evidenceReference }
        : { evidenceReference: production.evidence.evidenceReference }),
    },
    identity: {
      domain: "energy",
      field: "requiredPvPowerKwp",
      path: `energy.${input.sectorId}.solarSizing.requiredPvPowerKwp`,
    },
  });

  return Object.freeze({
    status: "READY" as const,
    sectorId: input.sectorId,
    requiredPvPowerKwp,
    sourceRefs: Object.freeze([...new Set([
      ...prepared.requirement.sourceRefs,
      ...(production.evidence?.sourceReference === undefined
        ? []
        : [production.evidence.sourceReference]),
      ...(energy.evidence?.sourceReference === undefined
        ? []
        : [energy.evidence.sourceReference]),
    ])]),
  });
}
