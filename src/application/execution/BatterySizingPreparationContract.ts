import {
  createIdentifiedTechnicalValue,
  isTechnicalValueEvidence,
  type IdentifiedTechnicalValue,
} from "../../domain/shared/TechnicalValue.js";
import { ValidationStatus } from "../../domain/shared/ValidationStatus.js";
import {
  solarSizingEnergyPath,
  type SolarSizingEnergy,
} from "./SolarSizingPreparationContract.js";

export const BATTERY_FACTOR_UNIT = "coefficient" as const;
export const BATTERY_TEMPERATURE_UNIT = "°C" as const;
export type BatteryDepthOfDischarge = IdentifiedTechnicalValue<typeof BATTERY_FACTOR_UNIT>;
export type BatteryCycleEfficiency = IdentifiedTechnicalValue<typeof BATTERY_FACTOR_UNIT>;
export type BatteryEnergyBoundary = IdentifiedTechnicalValue;
export type BatteryAutonomy = IdentifiedTechnicalValue;
export type BatteryDesignHorizon = IdentifiedTechnicalValue;
export type BatteryInverterLosses = IdentifiedTechnicalValue;
export type BatteryTemperature = IdentifiedTechnicalValue<typeof BATTERY_TEMPERATURE_UNIT>;
export type BatteryReserve = IdentifiedTechnicalValue;

export interface BatterySizingPeriod {
  readonly ref: string;
}

export const BATTERY_TERMINAL = "BATTERY_TERMINAL" as const;

export type BatterySizingEnergyDemand = SolarSizingEnergy & {
  readonly period: Readonly<BatterySizingPeriod>;
};

export type BatterySizingAutonomy = BatteryAutonomy & {
  readonly period: Readonly<BatterySizingPeriod>;
};

export type BatterySizingEnergyBoundary = BatteryEnergyBoundary & {
  readonly terminal: typeof BATTERY_TERMINAL;
};

export interface BatterySizingPreparationInput {
  readonly sectorId: string;
  readonly energyDemand?: SolarSizingEnergy;
  readonly energyBoundary?: BatteryEnergyBoundary;
  readonly autonomy?: BatteryAutonomy;
  readonly designHorizon?: BatteryDesignHorizon;
  readonly depthOfDischarge?: BatteryDepthOfDischarge;
  readonly cycleEfficiency?: BatteryCycleEfficiency;
  readonly inverterLosses?: BatteryInverterLosses;
  readonly temperature?: BatteryTemperature;
  readonly reserve?: BatteryReserve;
  readonly sourceRefs?: readonly string[];
}

export interface BatterySizingPreparationDependencies {
  readonly energyDemand?: Readonly<SolarSizingEnergy>;
  readonly energyBoundary?: Readonly<BatteryEnergyBoundary>;
  readonly autonomy?: Readonly<BatteryAutonomy>;
  readonly designHorizon?: Readonly<BatteryDesignHorizon>;
  readonly depthOfDischarge?: Readonly<BatteryDepthOfDischarge>;
  readonly cycleEfficiency?: Readonly<BatteryCycleEfficiency>;
  readonly inverterLosses?: Readonly<BatteryInverterLosses>;
  readonly temperature?: Readonly<BatteryTemperature>;
  readonly reserve?: Readonly<BatteryReserve>;
}

export interface BatterySizingPreparationIssue {
  readonly code: string;
  readonly message: string;
  readonly path: string;
}

export interface BatterySizingPreparationRequirement
  extends BatterySizingPreparationDependencies {
  readonly sectorId: string;
  readonly energyDemand: Readonly<SolarSizingEnergy>;
  readonly energyBoundary: Readonly<BatteryEnergyBoundary>;
  readonly autonomy: Readonly<BatteryAutonomy>;
  readonly designHorizon: Readonly<BatteryDesignHorizon>;
  readonly depthOfDischarge: Readonly<BatteryDepthOfDischarge>;
  readonly cycleEfficiency: Readonly<BatteryCycleEfficiency>;
  readonly sourceRefs: readonly string[];
}

export type BatterySizingPreparationResult =
  | {
      readonly status: "PENDING";
      readonly dependencies: Readonly<BatterySizingPreparationDependencies>;
      readonly dependencyRefs: readonly string[];
      readonly missingFields: readonly string[];
      readonly issues: readonly [];
      readonly sourceRefs: readonly string[];
    }
  | {
      readonly status: "BLOCKED";
      readonly dependencies: Readonly<BatterySizingPreparationDependencies>;
      readonly dependencyRefs: readonly string[];
      readonly missingFields: readonly [];
      readonly issues: readonly BatterySizingPreparationIssue[];
      readonly sourceRefs: readonly string[];
    }
  | {
      readonly status: "READY";
      readonly dependencies: Readonly<BatterySizingPreparationDependencies>;
      readonly requirement: Readonly<BatterySizingPreparationRequirement>;
      readonly dependencyRefs: readonly string[];
      readonly missingFields: readonly [];
      readonly issues: readonly [];
      readonly sourceRefs: readonly string[];
    };

export class BatterySizingPreparationContractError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "BatterySizingPreparationContractError";
  }
}

export function batteryEnergyDemandPath(sectorId: string): string {
  return solarSizingEnergyPath(sectorId);
}

export function batteryEnergyBoundaryPath(sectorId: string): string {
  return `energy.${sectorId}.battery.energyBoundary`;
}

export function batteryAutonomyPath(sectorId: string): string {
  return `energy.${sectorId}.battery.autonomy`;
}

export function batteryDesignHorizonPath(sectorId: string): string {
  return `energy.${sectorId}.battery.designHorizon`;
}

export function batteryDepthOfDischargePath(sectorId: string): string {
  return `energy.${sectorId}.battery.depthOfDischarge`;
}

export function batteryCycleEfficiencyPath(sectorId: string): string {
  return `energy.${sectorId}.battery.cycleEfficiency`;
}

export function batteryInverterLossesPath(sectorId: string): string {
  return `energy.${sectorId}.battery.inverterLosses`;
}

export function batteryTemperaturePath(sectorId: string): string {
  return `energy.${sectorId}.battery.temperature`;
}

export function batteryReservePath(sectorId: string): string {
  return `energy.${sectorId}.battery.reserve`;
}

function requireSectorId(sectorId: string): string {
  if (typeof sectorId !== "string" || sectorId.trim().length === 0) {
    throw new BatterySizingPreparationContractError("sectorId is required");
  }

  return sectorId;
}

function validateSourceRefs(
  sourceRefs: readonly string[] | undefined,
): readonly string[] {
  if (sourceRefs === undefined) {
    return Object.freeze([]);
  }

  if (
    !Array.isArray(sourceRefs) ||
    sourceRefs.some(
      (sourceRef) => typeof sourceRef !== "string" || sourceRef.trim().length === 0,
    )
  ) {
    throw new BatterySizingPreparationContractError(
      "sourceRefs must contain non-empty strings",
    );
  }

  return Object.freeze([...new Set(sourceRefs)]);
}

function isBlockedStatus(value: ValidationStatus): boolean {
  return (
    value === ValidationStatus.PENDING ||
    value === ValidationStatus.BLOCKED ||
    value === ValidationStatus.INVALID ||
    value === ValidationStatus.OBSOLETE
  );
}

function validateDependency<Unit extends string>(
  field: string,
  value: IdentifiedTechnicalValue<Unit> | undefined,
  expectedPath: string,
  expectedUnit?: Unit,
): {
  readonly value?: Readonly<IdentifiedTechnicalValue<Unit>>;
  readonly missingField?: string;
  readonly dependencyRef?: string;
  readonly issue?: BatterySizingPreparationIssue;
} {
  if (value === undefined) {
    return { missingField: field };
  }

  let validated: Readonly<IdentifiedTechnicalValue<Unit>>;
  try {
    validated = createIdentifiedTechnicalValue(value);
  } catch (error) {
    return {
      issue: {
        code: "batterySizingPreparation.dependency.invalid",
        message: error instanceof Error ? error.message : `${field} dependency is invalid`,
        path: expectedPath,
      },
    };
  }

  if (validated.identity.path !== expectedPath) {
    return {
      dependencyRef: validated.identity.path,
      issue: {
        code: "batterySizingPreparation.dependency.path.mismatch",
        message: `${field} dependency path must be ${expectedPath}`,
        path: validated.identity.path,
      },
    };
  }

  if (expectedUnit !== undefined && validated.unit !== expectedUnit) {
    return {
      dependencyRef: validated.identity.path,
      issue: {
        code: "batterySizingPreparation.dependency.unit.mismatch",
        message: `${field} dependency must use ${expectedUnit}`,
        path: validated.identity.path,
      },
    };
  }

  if (isBlockedStatus(validated.status)) {
    return {
      value: validated,
      dependencyRef: validated.identity.path,
      issue: {
        code: "batterySizingPreparation.dependency.blocked",
        message: `${field} dependency has status ${validated.status}`,
        path: validated.identity.path,
      },
    };
  }

  if (
    validated.evidence !== undefined &&
    !isTechnicalValueEvidence(validated.evidence)
  ) {
    return {
      dependencyRef: validated.identity.path,
      issue: {
        code: "batterySizingPreparation.dependency.evidence.invalid",
        message: `${field} dependency evidence is invalid`,
        path: validated.identity.path,
      },
    };
  }

  return {
    value: validated,
    dependencyRef: validated.identity.path,
  };
}

function createResult(
  status: BatterySizingPreparationResult["status"],
  dependencies: BatterySizingPreparationDependencies,
  dependencyRefs: readonly string[],
  missingFields: readonly string[],
  issues: readonly BatterySizingPreparationIssue[],
  sourceRefs: readonly string[],
  sectorId: string,
): Readonly<BatterySizingPreparationResult> {
  const required =
    status === "READY" &&
    dependencies.energyDemand !== undefined &&
    dependencies.energyBoundary !== undefined &&
    dependencies.autonomy !== undefined &&
    dependencies.designHorizon !== undefined &&
    dependencies.depthOfDischarge !== undefined &&
    dependencies.cycleEfficiency !== undefined
      ? {
          sectorId,
          ...dependencies,
          energyDemand: dependencies.energyDemand,
          depthOfDischarge: dependencies.depthOfDischarge,
          cycleEfficiency: dependencies.cycleEfficiency,
          sourceRefs: Object.freeze([...sourceRefs]),
        }
      : undefined;

  return Object.freeze({
    status,
    dependencies: Object.freeze({ ...dependencies }),
    ...(required === undefined ? {} : { requirement: Object.freeze(required) }),
    dependencyRefs: Object.freeze([...dependencyRefs]),
    missingFields: Object.freeze([...missingFields]),
    issues: Object.freeze([...issues]),
    sourceRefs: Object.freeze([...sourceRefs]),
  }) as Readonly<BatterySizingPreparationResult>;
}

export function prepareBatterySizing(
  input: BatterySizingPreparationInput,
): Readonly<BatterySizingPreparationResult> {
  const sectorId = requireSectorId(input.sectorId);
  const sourceRefs = validateSourceRefs(input.sourceRefs);
  const missingFields: string[] = [];
  const issues: BatterySizingPreparationIssue[] = [];
  const dependencyRefs: string[] = [];
  const dependencies: BatterySizingPreparationDependencies = {};

  const validated = [
    validateDependency(
      "energyDemand",
      input.energyDemand,
      batteryEnergyDemandPath(sectorId),
      "kWh",
    ),
    validateDependency(
      "energyBoundary",
      input.energyBoundary,
      batteryEnergyBoundaryPath(sectorId),
    ),
    validateDependency(
      "autonomy",
      input.autonomy,
      batteryAutonomyPath(sectorId),
    ),
    validateDependency(
      "designHorizon",
      input.designHorizon,
      batteryDesignHorizonPath(sectorId),
    ),
    validateDependency(
      "depthOfDischarge",
      input.depthOfDischarge,
      batteryDepthOfDischargePath(sectorId),
      BATTERY_FACTOR_UNIT,
    ),
    validateDependency(
      "cycleEfficiency",
      input.cycleEfficiency,
      batteryCycleEfficiencyPath(sectorId),
      BATTERY_FACTOR_UNIT,
    ),
    validateDependency(
      "inverterLosses",
      input.inverterLosses,
      batteryInverterLossesPath(sectorId),
    ),
    validateDependency(
      "temperature",
      input.temperature,
      batteryTemperaturePath(sectorId),
      BATTERY_TEMPERATURE_UNIT,
    ),
    validateDependency(
      "reserve",
      input.reserve,
      batteryReservePath(sectorId),
    ),
  ];

  const requiredIndexes = new Set([0, 1, 2, 3, 4, 5]);
  for (const [index, dependency] of validated.entries()) {
    if (dependency.missingField !== undefined && requiredIndexes.has(index)) {
      missingFields.push(dependency.missingField);
    }
    if (dependency.dependencyRef !== undefined) {
      dependencyRefs.push(dependency.dependencyRef);
    }
    if (dependency.issue !== undefined) {
      issues.push(dependency.issue);
    }
  }

  const energyDemandValue = validated[0]?.value;
  const energyBoundaryValue = validated[1]?.value;
  const autonomyValue = validated[2]?.value;
  const designHorizonValue = validated[3]?.value;
  const depthOfDischargeValue = validated[4]?.value;
  const cycleEfficiencyValue = validated[5]?.value;
  const inverterLossesValue = validated[6]?.value;
  const temperatureValue = validated[7]?.value;
  const reserveValue = validated[8]?.value;

  const resolvedDependencies: BatterySizingPreparationDependencies = {
    ...(energyDemandValue === undefined
      ? {}
      : { energyDemand: energyDemandValue as SolarSizingEnergy }),
    ...(energyBoundaryValue === undefined
      ? {}
      : { energyBoundary: energyBoundaryValue as BatteryEnergyBoundary }),
    ...(autonomyValue === undefined
      ? {}
      : { autonomy: autonomyValue as BatteryAutonomy }),
    ...(designHorizonValue === undefined
      ? {}
      : { designHorizon: designHorizonValue as BatteryDesignHorizon }),
    ...(depthOfDischargeValue === undefined
      ? {}
      : { depthOfDischarge: depthOfDischargeValue as BatteryDepthOfDischarge }),
    ...(cycleEfficiencyValue === undefined
      ? {}
      : { cycleEfficiency: cycleEfficiencyValue as BatteryCycleEfficiency }),
    ...(inverterLossesValue === undefined
      ? {}
      : { inverterLosses: inverterLossesValue as BatteryInverterLosses }),
    ...(temperatureValue === undefined
      ? {}
      : { temperature: temperatureValue as BatteryTemperature }),
    ...(reserveValue === undefined
      ? {}
      : { reserve: reserveValue as BatteryReserve }),
  };

  if (issues.length > 0) {
    return createResult(
      "BLOCKED",
      resolvedDependencies,
      dependencyRefs,
      [],
      issues,
      sourceRefs,
      sectorId,
    );
  }

  if (missingFields.length > 0) {
    return createResult(
      "PENDING",
      resolvedDependencies,
      dependencyRefs,
      [...new Set(missingFields)],
      [],
      sourceRefs,
      sectorId,
    );
  }

  return createResult(
    "READY",
    resolvedDependencies,
    dependencyRefs,
    [],
    [],
    sourceRefs,
    sectorId,
  );
}
