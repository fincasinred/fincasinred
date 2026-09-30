import {
  batteryEnergyDemandPath,
  batteryEnergyBoundaryPath,
  BATTERY_TERMINAL,
  type BatterySizingEnergyBoundary,
  type BatterySizingEnergyDemand,
  type BatterySizingPeriod,
} from "./BatterySizingPreparationContract.js";
import {
  createIdentifiedTechnicalValue,
  isTechnicalValueEvidence,
  type IdentifiedTechnicalValue,
} from "../../domain/shared/TechnicalValue.js";
import { ValidationStatus } from "../../domain/shared/ValidationStatus.js";

export interface EnergyToBatteryPreparationInput {
  readonly sectorId: string;
  readonly energy?: Readonly<IdentifiedTechnicalValue<"kWh">>;
  readonly energyBoundary?: Readonly<BatterySizingEnergyBoundary>;
  readonly energyPeriod?: Readonly<BatterySizingPeriod>;
  readonly autonomyPeriod?: Readonly<BatterySizingPeriod>;
  readonly dependencyRefs?: readonly string[];
  readonly sourceRefs?: readonly string[];
}

export type EnergyToBatteryPreparationContext = Omit<
  EnergyToBatteryPreparationInput,
  "energy"
>;

export interface EnergyToBatteryPreparationIssue {
  readonly code: string;
  readonly message: string;
  readonly path: string;
}

export interface EnergyToBatteryPreparationRequirement {
  readonly sectorId: string;
  readonly energyDemand: Readonly<BatterySizingEnergyDemand>;
  readonly energyBoundary: Readonly<BatterySizingEnergyBoundary>;
  readonly period: Readonly<BatterySizingPeriod>;
  readonly dependencyRefs: readonly string[];
  readonly sourceRefs: readonly string[];
}

type EnergyToBatteryDependencies = {
  readonly energy?: Readonly<IdentifiedTechnicalValue<"kWh">>;
  readonly energyBoundary?: Readonly<BatterySizingEnergyBoundary>;
};

export type EnergyToBatteryPreparationResult =
  | {
      readonly status: "PENDING";
      readonly dependencies: Readonly<EnergyToBatteryDependencies>;
      readonly missingFields: readonly string[];
      readonly issues: readonly [];
      readonly dependencyRefs: readonly string[];
      readonly sourceRefs: readonly string[];
    }
  | {
      readonly status: "BLOCKED";
      readonly dependencies: Readonly<EnergyToBatteryDependencies>;
      readonly missingFields: readonly [];
      readonly issues: readonly EnergyToBatteryPreparationIssue[];
      readonly dependencyRefs: readonly string[];
      readonly sourceRefs: readonly string[];
    }
  | {
      readonly status: "READY";
      readonly dependencies: Readonly<{
        readonly energy: Readonly<IdentifiedTechnicalValue<"kWh">>;
        readonly energyBoundary: Readonly<BatterySizingEnergyBoundary>;
      }>;
      readonly requirement: Readonly<EnergyToBatteryPreparationRequirement>;
      readonly missingFields: readonly [];
      readonly issues: readonly [];
      readonly dependencyRefs: readonly string[];
      readonly sourceRefs: readonly string[];
    };

export class EnergyToBatteryPreparationContractError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "EnergyToBatteryPreparationContractError";
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function requireSectorId(sectorId: string): string {
  if (!isNonEmptyString(sectorId)) {
    throw new EnergyToBatteryPreparationContractError("sectorId is required");
  }
  return sectorId;
}

function validateRefs(
  refs: readonly string[] | undefined,
  field: string,
): readonly string[] | undefined {
  if (refs === undefined) return undefined;
  if (!Array.isArray(refs) || refs.some((ref) => !isNonEmptyString(ref))) {
    throw new EnergyToBatteryPreparationContractError(
      `${field} must contain non-empty strings`,
    );
  }
  const uniqueRefs = [...new Set(refs)];
  return uniqueRefs.length === 0 ? undefined : Object.freeze(uniqueRefs);
}

function issue(
  code: string,
  message: string,
  path: string,
): EnergyToBatteryPreparationIssue {
  return { code, message, path };
}

function isUnusableStatus(status: ValidationStatus): boolean {
  return (
    status === ValidationStatus.PENDING ||
    status === ValidationStatus.BLOCKED ||
    status === ValidationStatus.INVALID ||
    status === ValidationStatus.OBSOLETE
  );
}

function createBaseResult(
  status: "PENDING" | "BLOCKED",
  dependencies: EnergyToBatteryDependencies,
  missingFields: readonly string[],
  issues: readonly EnergyToBatteryPreparationIssue[],
  dependencyRefs: readonly string[],
  sourceRefs: readonly string[],
): Readonly<EnergyToBatteryPreparationResult> {
  return Object.freeze({
    status,
    dependencies: Object.freeze({ ...dependencies }),
    missingFields: Object.freeze([...missingFields]),
    issues: Object.freeze([...issues]),
    dependencyRefs: Object.freeze([...dependencyRefs]),
    sourceRefs: Object.freeze([...sourceRefs]),
  }) as Readonly<EnergyToBatteryPreparationResult>;
}

export function prepareEnergyForBattery(
  input: EnergyToBatteryPreparationInput,
): Readonly<EnergyToBatteryPreparationResult> {
  const sectorId = requireSectorId(input.sectorId);
  const expectedEnergyPath = batteryEnergyDemandPath(sectorId);
  const expectedBoundaryPath = batteryEnergyBoundaryPath(sectorId);
  const dependencyRefs = validateRefs(input.dependencyRefs, "dependencyRefs");
  const sourceRefs = validateRefs(input.sourceRefs, "sourceRefs");
  const missingFields: string[] = [];
  const issues: EnergyToBatteryPreparationIssue[] = [];
  const dependencies: {
    energy?: Readonly<IdentifiedTechnicalValue<"kWh">>;
    energyBoundary?: Readonly<BatterySizingEnergyBoundary>;
  } = {};

  if (input.energy === undefined) {
    missingFields.push("energy");
  } else {
    try {
      const energy = createIdentifiedTechnicalValue(input.energy);
      if (energy.identity.path !== expectedEnergyPath) {
        issues.push(
          issue(
            "energyToBattery.energy.path.mismatch",
            `energy identity.path must be ${expectedEnergyPath}`,
            energy.identity.path,
          ),
        );
      } else if (energy.unit !== "kWh") {
        issues.push(
          issue(
            "energyToBattery.energy.unit.mismatch",
            "energy must use kWh",
            energy.identity.path,
          ),
        );
      } else {
        dependencies.energy = energy;
        if (isUnusableStatus(energy.status)) {
          issues.push(
            issue(
              "energyToBattery.energy.status.unusable",
              `energy has status ${energy.status}`,
              energy.identity.path,
            ),
          );
        }
        if (!isTechnicalValueEvidence(energy.evidence)) {
          missingFields.push("energy.evidence");
        }
      }
    } catch (error) {
      issues.push(
        issue(
          "energyToBattery.energy.invalid",
          error instanceof Error ? error.message : "energy is invalid",
          expectedEnergyPath,
        ),
      );
    }
  }

  if (input.energyBoundary === undefined) {
    missingFields.push("energyBoundary");
  } else {
    try {
      const energyBoundary = createIdentifiedTechnicalValue(input.energyBoundary);
      if (energyBoundary.identity.path !== expectedBoundaryPath) {
        issues.push(
          issue(
            "energyToBattery.energyBoundary.path.mismatch",
            `energyBoundary identity.path must be ${expectedBoundaryPath}`,
            energyBoundary.identity.path,
          ),
        );
      } else if (input.energyBoundary.terminal !== BATTERY_TERMINAL) {
        issues.push(
          issue(
            "energyToBattery.energyBoundary.terminal.mismatch",
            `energyBoundary.terminal must be ${BATTERY_TERMINAL}`,
            expectedBoundaryPath,
          ),
        );
      } else {
        dependencies.energyBoundary = Object.freeze({
          ...energyBoundary,
          terminal: input.energyBoundary.terminal,
        });
        if (isUnusableStatus(energyBoundary.status)) {
          issues.push(
            issue(
              "energyToBattery.energyBoundary.status.unusable",
              `energyBoundary has status ${energyBoundary.status}`,
              energyBoundary.identity.path,
            ),
          );
        }
        if (!isTechnicalValueEvidence(energyBoundary.evidence)) {
          missingFields.push("energyBoundary.evidence");
        }
      }
    } catch (error) {
      issues.push(
        issue(
          "energyToBattery.energyBoundary.invalid",
          error instanceof Error
            ? error.message
            : "energyBoundary is invalid",
          expectedBoundaryPath,
        ),
      );
    }
  }

  if (input.energyPeriod === undefined) {
    missingFields.push("energyPeriod");
  } else if (!isNonEmptyString(input.energyPeriod.ref)) {
    issues.push(
      issue(
        "energyToBattery.energyPeriod.invalid",
        "energyPeriod.ref is required",
        "energy.period",
      ),
    );
  }

  if (input.autonomyPeriod === undefined) {
    missingFields.push("autonomyPeriod");
  } else if (!isNonEmptyString(input.autonomyPeriod.ref)) {
    issues.push(
      issue(
        "energyToBattery.autonomyPeriod.invalid",
        "autonomyPeriod.ref is required",
        "autonomy.period",
      ),
    );
  }

  if (
    input.energyPeriod !== undefined &&
    input.autonomyPeriod !== undefined &&
    input.energyPeriod.ref !== input.autonomyPeriod.ref
  ) {
    issues.push(
      issue(
        "energyToBattery.period.mismatch",
        "energyPeriod.ref must match autonomyPeriod.ref",
        "energy.period",
      ),
    );
  }

  if (dependencyRefs === undefined) missingFields.push("dependencyRefs");
  if (sourceRefs === undefined) missingFields.push("sourceRefs");

  const resolvedDependencyRefs = dependencyRefs ?? [];
  const resolvedSourceRefs = sourceRefs ?? [];

  if (issues.length > 0) {
    return createBaseResult(
      "BLOCKED",
      dependencies,
      [],
      issues,
      resolvedDependencyRefs,
      resolvedSourceRefs,
    );
  }

  const uniqueMissingFields = [...new Set(missingFields)];
  if (uniqueMissingFields.length > 0) {
    return createBaseResult(
      "PENDING",
      dependencies,
      uniqueMissingFields,
      [],
      resolvedDependencyRefs,
      resolvedSourceRefs,
    );
  }

  if (
    dependencies.energy === undefined ||
    dependencies.energyBoundary === undefined ||
    input.energyPeriod === undefined ||
    dependencyRefs === undefined ||
    sourceRefs === undefined
  ) {
    throw new EnergyToBatteryPreparationContractError(
      "energy to battery preparation dependencies are incomplete",
    );
  }

  const energyDemand = Object.freeze({
    ...dependencies.energy,
    period: Object.freeze({ ref: input.energyPeriod.ref }),
  }) as Readonly<BatterySizingEnergyDemand>;

  const requirement = Object.freeze({
    sectorId,
    energyDemand,
    energyBoundary: dependencies.energyBoundary,
    period: Object.freeze({ ref: input.energyPeriod.ref }),
    dependencyRefs: Object.freeze([...dependencyRefs]),
    sourceRefs: Object.freeze([...sourceRefs]),
  });

  return Object.freeze({
    status: "READY" as const,
    dependencies: Object.freeze({
      energy: dependencies.energy,
      energyBoundary: dependencies.energyBoundary,
    }),
    requirement,
    missingFields: Object.freeze([]) as readonly [],
    issues: Object.freeze([]) as readonly [],
    dependencyRefs: Object.freeze([...dependencyRefs]),
    sourceRefs: Object.freeze([...sourceRefs]),
  });
}