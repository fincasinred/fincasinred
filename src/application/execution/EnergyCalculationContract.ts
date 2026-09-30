import {
  createIdentifiedTechnicalValue,
  type IdentifiedTechnicalValue,
} from "../../domain/shared/TechnicalValue.js";
import type { TechnicalValueEvidence } from "../../domain/shared/TechnicalValue.js";
import { Provenance } from "../../domain/shared/Provenance.js";
import { ValidationStatus } from "../../domain/shared/ValidationStatus.js";

export const ENERGY_CALCULATION_HYDRAULIC_POWER_UNIT = "kW" as const;
export const ENERGY_CALCULATION_EFFICIENCY_UNIT = "coefficient" as const;
export const ENERGY_CALCULATION_TIME_UNIT = "h" as const;

export interface EnergyCalculationInput {
  readonly sectorId: string;
  readonly hydraulicPower: IdentifiedTechnicalValue<"kW">;
  readonly pumpingEfficiency: IdentifiedTechnicalValue<"coefficient">;
  readonly operatingTime: IdentifiedTechnicalValue<"h">;
}

export interface EnergyCalculationIssue {
  readonly code: string;
  readonly message: string;
  readonly path: string;
}

export interface EnergyCalculationDependencies {
  readonly hydraulicPower?: Readonly<IdentifiedTechnicalValue<"kW">>;
  readonly pumpingEfficiency?: Readonly<IdentifiedTechnicalValue<"coefficient">>;
  readonly operatingTime?: Readonly<IdentifiedTechnicalValue<"h">>;
}

export type EnergyCalculationResult =
  | {
      readonly status: "PENDING";
      readonly dependencies: Readonly<EnergyCalculationDependencies>;
      readonly dependencyRefs: readonly string[];
      readonly missingFields: readonly string[];
      readonly issues: readonly [];
    }
  | {
      readonly status: "BLOCKED";
      readonly dependencies: Readonly<EnergyCalculationDependencies>;
      readonly dependencyRefs: readonly string[];
      readonly missingFields: readonly [];
      readonly issues: readonly EnergyCalculationIssue[];
    }
  | {
      readonly status: "VALIDATED" | "PROVISIONAL";
      readonly dependencies: Readonly<EnergyCalculationDependencies>;
      readonly dependencyRefs: readonly string[];
      readonly missingFields: readonly [];
      readonly issues: readonly [];
      readonly electricalPower: Readonly<IdentifiedTechnicalValue<"kW">>;
      readonly energy: Readonly<IdentifiedTechnicalValue<"kWh">>;
    };

export function hydraulicPowerCalculationPath(sectorId: string): string {
  return `energy.${sectorId}.hydraulicPower`;
}

export function pumpingEfficiencyCalculationPath(sectorId: string): string {
  return `energy.${sectorId}.pumpingEfficiency`;
}

export function operatingTimeCalculationPath(sectorId: string): string {
  return `energy.${sectorId}.operatingTime`;
}

export function electricalPowerResultPath(sectorId: string): string {
  return `energy.${sectorId}.electricalPower`;
}

export function energyResultPath(sectorId: string): string {
  return `energy.${sectorId}.energy`;
}

function deriveStatus(
  values: readonly IdentifiedTechnicalValue[],
): ValidationStatus.VALIDATED | ValidationStatus.PROVISIONAL {
  return values.some((value) => value.status === ValidationStatus.PROVISIONAL)
    ? ValidationStatus.PROVISIONAL
    : ValidationStatus.VALIDATED;
}

function dependencyIssue(
  field: string,
  value: Readonly<IdentifiedTechnicalValue>,
  expectedPath: string,
  expectedUnit: string,
): EnergyCalculationIssue | undefined {
  if (value.identity.path !== expectedPath) {
    return {
      code: "energyCalculation.dependency.path.mismatch",
      message: `${field} dependency path must be ${expectedPath}`,
      path: value.identity.path,
    };
  }

  if (value.unit !== expectedUnit) {
    return {
      code: "energyCalculation.dependency.unit.mismatch",
      message: `${field} dependency must use ${expectedUnit}`,
      path: value.identity.path,
    };
  }

  if (
    value.status === ValidationStatus.BLOCKED ||
    value.status === ValidationStatus.INVALID ||
    value.status === ValidationStatus.OBSOLETE
  ) {
    return {
      code: "energyCalculation.dependency.blocked",
      message: `${field} dependency has status ${value.status}`,
      path: value.identity.path,
    };
  }

  return undefined;
}

function outputValue<Unit extends "kW" | "kWh">(
  value: number,
  unit: Unit,
  field: string,
  path: string,
  status: ValidationStatus.VALIDATED | ValidationStatus.PROVISIONAL,
  evidence?: Readonly<TechnicalValueEvidence>,
): Readonly<IdentifiedTechnicalValue<Unit>> {
  return createIdentifiedTechnicalValue({
    value,
    unit,
    provenance: Provenance.CALCULATED,
    status,
    ...(evidence === undefined ? {} : { evidence }),
    identity: { domain: "energy", field, path },
  });
}

function firstAvailableEvidence(
  values: readonly IdentifiedTechnicalValue[],
): Readonly<TechnicalValueEvidence> | undefined {
  const valueWithEvidence = values.find(
    (value) => value.evidence !== undefined,
  );

  return valueWithEvidence?.evidence === undefined
    ? undefined
    : Object.freeze({ ...valueWithEvidence.evidence });
}

export function calculateEnergy(
  input: Partial<EnergyCalculationInput> & { readonly sectorId: string },
): Readonly<EnergyCalculationResult> {
  const expected = {
    hydraulicPower: hydraulicPowerCalculationPath(input.sectorId),
    pumpingEfficiency: pumpingEfficiencyCalculationPath(input.sectorId),
    operatingTime: operatingTimeCalculationPath(input.sectorId),
  } as const;
  const dependencies: {
    hydraulicPower?: Readonly<IdentifiedTechnicalValue<"kW">>;
    pumpingEfficiency?: Readonly<IdentifiedTechnicalValue<"coefficient">>;
    operatingTime?: Readonly<IdentifiedTechnicalValue<"h">>;
  } = {};
  const dependencyRefs: string[] = [];
  const missingFields: string[] = [];
  const issues: EnergyCalculationIssue[] = [];

  const hydraulicPower = input.hydraulicPower;
  const pumpingEfficiency = input.pumpingEfficiency;
  const operatingTime = input.operatingTime;

  const validate = <Unit extends string>(
    field: string,
    value: IdentifiedTechnicalValue<Unit> | undefined,
    expectedPath: string,
    expectedUnit: string,
  ): Readonly<IdentifiedTechnicalValue<Unit>> | undefined => {
    if (value === undefined) {
      missingFields.push(field);
      return undefined;
    }

    const validated = createIdentifiedTechnicalValue(value);
    const issue = dependencyIssue(field, validated, expectedPath, expectedUnit);
    if (issue !== undefined) {
      issues.push(issue);
    }
    dependencyRefs.push(validated.identity.path);
    return validated;
  };

  const validatedHydraulicPower = validate(
    "hydraulicPower",
    hydraulicPower,
    expected.hydraulicPower,
    "kW",
  );
  const validatedPumpingEfficiency = validate(
    "pumpingEfficiency",
    pumpingEfficiency,
    expected.pumpingEfficiency,
    "coefficient",
  );
  const validatedOperatingTime = validate(
    "operatingTime",
    operatingTime,
    expected.operatingTime,
    "h",
  );

  if (validatedHydraulicPower !== undefined) {
    dependencies.hydraulicPower = validatedHydraulicPower;
  }
  if (validatedPumpingEfficiency !== undefined) {
    dependencies.pumpingEfficiency = validatedPumpingEfficiency;
  }
  if (validatedOperatingTime !== undefined) {
    dependencies.operatingTime = validatedOperatingTime;
  }

  if (issues.length > 0) {
    return Object.freeze({
      status: "BLOCKED" as const,
      dependencies: Object.freeze(dependencies),
      dependencyRefs: Object.freeze(dependencyRefs),
      missingFields: Object.freeze([]) as readonly [],
      issues: Object.freeze(issues),
    });
  }

  if (missingFields.length > 0) {
    return Object.freeze({
      status: "PENDING" as const,
      dependencies: Object.freeze(dependencies),
      dependencyRefs: Object.freeze(dependencyRefs),
      missingFields: Object.freeze(missingFields),
      issues: Object.freeze([]) as readonly [],
    });
  }

  if (
    dependencies.hydraulicPower === undefined ||
    dependencies.pumpingEfficiency === undefined ||
    dependencies.operatingTime === undefined
  ) {
    throw new Error("energy calculation dependencies are incomplete");
  }

  const hydraulicPowerValue = dependencies.hydraulicPower;
  const efficiencyValue = dependencies.pumpingEfficiency;
  const operatingTimeValue = dependencies.operatingTime;

  if (hydraulicPowerValue.value < 0) {
    issues.push({
      code: "energyCalculation.value.invalid",
      message: "hydraulicPower must be >= 0",
      path: hydraulicPowerValue.identity.path,
    });
  }
  if (efficiencyValue.value <= 0 || efficiencyValue.value > 1) {
    issues.push({
      code: "energyCalculation.efficiency.invalid",
      message: "pumpingEfficiency must be greater than 0 and <= 1",
      path: efficiencyValue.identity.path,
    });
  }
  if (operatingTimeValue.value < 0) {
    issues.push({
      code: "energyCalculation.value.invalid",
      message: "operatingTime must be >= 0",
      path: operatingTimeValue.identity.path,
    });
  }

  if (issues.length > 0) {
    return Object.freeze({
      status: "BLOCKED" as const,
      dependencies: Object.freeze(dependencies),
      dependencyRefs: Object.freeze(dependencyRefs),
      missingFields: Object.freeze([]) as readonly [],
      issues: Object.freeze(issues),
    });
  }

  const status = deriveStatus([
    hydraulicPowerValue,
    efficiencyValue,
    operatingTimeValue,
  ]);
  const evidence = firstAvailableEvidence([
    hydraulicPowerValue,
    efficiencyValue,
    operatingTimeValue,
  ]);
  const electricalPower = outputValue(
    hydraulicPowerValue.value / efficiencyValue.value,
    "kW",
    "electricalPower",
    electricalPowerResultPath(input.sectorId),
    status,
    evidence,
  );
  const energy = outputValue(
    electricalPower.value * operatingTimeValue.value,
    "kWh",
    "energy",
    energyResultPath(input.sectorId),
    status,
    evidence,
  );

  return Object.freeze({
    status,
    dependencies: Object.freeze(dependencies),
    dependencyRefs: Object.freeze(dependencyRefs),
    missingFields: Object.freeze([]) as readonly [],
    issues: Object.freeze([]) as readonly [],
    electricalPower,
    energy,
  });
}