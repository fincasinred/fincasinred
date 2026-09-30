import {
  createIdentifiedTechnicalValue,
  type IdentifiedTechnicalValue,
} from "../../domain/shared/TechnicalValue.js";
import { ValidationStatus } from "../../domain/shared/ValidationStatus.js";

export const BATTERY_SIZING_RESULT_ENERGY_UNIT = "kWh" as const;

export type BatterySizingResultEnergy = IdentifiedTechnicalValue<
  typeof BATTERY_SIZING_RESULT_ENERGY_UNIT
>;

export interface BatterySizingResultInput {
  readonly sectorId: string;
  readonly usableEnergyRequired?: BatterySizingResultEnergy;
  readonly nominalCapacityRequired?: BatterySizingResultEnergy;
  readonly dependencyRefs?: readonly string[];
  readonly sourceRefs?: readonly string[];
}

export interface BatterySizingResultIssue {
  readonly code: string;
  readonly message: string;
  readonly path: string;
}

export interface BatterySizingResultDependencies {
  readonly usableEnergyRequired?: Readonly<BatterySizingResultEnergy>;
  readonly nominalCapacityRequired?: Readonly<BatterySizingResultEnergy>;
}

export type BatterySizingResult =
  | {
      readonly status: "PENDING";
      readonly sectorId: string;
      readonly dependencies: Readonly<BatterySizingResultDependencies>;
      readonly dependencyRefs: readonly string[];
      readonly missingFields: readonly string[];
      readonly issues: readonly [];
      readonly sourceRefs: readonly string[];
    }
  | {
      readonly status: "BLOCKED";
      readonly sectorId: string;
      readonly dependencies: Readonly<BatterySizingResultDependencies>;
      readonly dependencyRefs: readonly string[];
      readonly missingFields: readonly [];
      readonly issues: readonly BatterySizingResultIssue[];
      readonly sourceRefs: readonly string[];
    }
  | {
      readonly status: "READY";
      readonly sectorId: string;
      readonly dependencies: Readonly<BatterySizingResultDependencies>;
      readonly usableEnergyRequired: Readonly<BatterySizingResultEnergy>;
      readonly nominalCapacityRequired: Readonly<BatterySizingResultEnergy>;
      readonly dependencyRefs: readonly string[];
      readonly missingFields: readonly [];
      readonly issues: readonly [];
      readonly sourceRefs: readonly string[];
    };

export class BatterySizingResultContractError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "BatterySizingResultContractError";
  }
}

export function batteryUsableEnergyRequiredPath(sectorId: string): string {
  return `energy.${sectorId}.battery.usableEnergyRequired`;
}

export function batteryNominalCapacityRequiredPath(sectorId: string): string {
  return `energy.${sectorId}.battery.nominalCapacityRequired`;
}

function requireSectorId(sectorId: string): string {
  if (typeof sectorId !== "string" || sectorId.trim().length === 0) {
    throw new BatterySizingResultContractError("sectorId is required");
  }

  return sectorId;
}

function validateRefs(
  refs: readonly string[] | undefined,
  field: string,
): readonly string[] {
  if (refs === undefined) {
    return Object.freeze([]);
  }

  if (
    !Array.isArray(refs) ||
    refs.some((ref) => typeof ref !== "string" || ref.trim().length === 0)
  ) {
    throw new BatterySizingResultContractError(
      `${field} must contain non-empty strings`,
    );
  }

  return Object.freeze([...new Set(refs)]);
}

function validateResultValue(
  field: string,
  value: BatterySizingResultEnergy | undefined,
  expectedPath: string,
): {
  readonly value?: Readonly<BatterySizingResultEnergy>;
  readonly missing?: string;
  readonly pending?: string;
  readonly issue?: BatterySizingResultIssue;
} {
  if (value === undefined) {
    return { missing: field };
  }

  let validated: Readonly<BatterySizingResultEnergy>;
  try {
    validated = createIdentifiedTechnicalValue(value);
  } catch (error) {
    return {
      issue: {
        code: "batterySizingResult.value.invalid",
        message: error instanceof Error ? error.message : `${field} is invalid`,
        path: expectedPath,
      },
    };
  }

  if (validated.identity.path !== expectedPath) {
    return {
      issue: {
        code: "batterySizingResult.value.path.mismatch",
        message: `${field} path must be ${expectedPath}`,
        path: validated.identity.path,
      },
    };
  }

  if (validated.unit !== BATTERY_SIZING_RESULT_ENERGY_UNIT) {
    return {
      issue: {
        code: "batterySizingResult.value.unit.mismatch",
        message: `${field} must use ${BATTERY_SIZING_RESULT_ENERGY_UNIT}`,
        path: validated.identity.path,
      },
    };
  }

  if (validated.status === ValidationStatus.PENDING) {
    return { pending: field };
  }

  if (
    validated.status === ValidationStatus.BLOCKED ||
    validated.status === ValidationStatus.INVALID ||
    validated.status === ValidationStatus.OBSOLETE
  ) {
    return {
      issue: {
        code: "batterySizingResult.value.blocked",
        message: `${field} has status ${validated.status}`,
        path: validated.identity.path,
      },
    };
  }

  return { value: validated };
}

export function createBatterySizingResult(
  input: BatterySizingResultInput,
): Readonly<BatterySizingResult> {
  const sectorId = requireSectorId(input.sectorId);
  const dependencyRefs = validateRefs(input.dependencyRefs, "dependencyRefs");
  const sourceRefs = validateRefs(input.sourceRefs, "sourceRefs");
  const usable = validateResultValue(
    "usableEnergyRequired",
    input.usableEnergyRequired,
    batteryUsableEnergyRequiredPath(sectorId),
  );
  const nominal = validateResultValue(
    "nominalCapacityRequired",
    input.nominalCapacityRequired,
    batteryNominalCapacityRequiredPath(sectorId),
  );
  const dependencies: BatterySizingResultDependencies = {
    ...(usable.value === undefined ? {} : { usableEnergyRequired: usable.value }),
    ...(nominal.value === undefined
      ? {}
      : { nominalCapacityRequired: nominal.value }),
  };
  const issues = [usable.issue, nominal.issue].filter(
    (issue): issue is BatterySizingResultIssue => issue !== undefined,
  );

  if (issues.length > 0) {
    return Object.freeze({
      status: "BLOCKED" as const,
      sectorId,
      dependencies: Object.freeze(dependencies),
      dependencyRefs,
      missingFields: Object.freeze([]) as readonly [],
      issues: Object.freeze(issues),
      sourceRefs,
    });
  }

  const missingFields = [usable.missing, nominal.missing, usable.pending, nominal.pending].filter(
    (field): field is string => field !== undefined,
  );
  if (missingFields.length > 0) {
    return Object.freeze({
      status: "PENDING" as const,
      sectorId,
      dependencies: Object.freeze(dependencies),
      dependencyRefs,
      missingFields: Object.freeze([...new Set(missingFields)]),
      issues: Object.freeze([]) as readonly [],
      sourceRefs,
    });
  }

  const usableEnergyRequired = usable.value;
  const nominalCapacityRequired = nominal.value;
  if (usableEnergyRequired === undefined || nominalCapacityRequired === undefined) {
    throw new BatterySizingResultContractError(
      "battery sizing result values could not be resolved",
    );
  }

  return Object.freeze({
    status: "READY" as const,
    sectorId,
    dependencies: Object.freeze(dependencies),
    usableEnergyRequired,
    nominalCapacityRequired,
    dependencyRefs,
    missingFields: Object.freeze([]) as readonly [],
    issues: Object.freeze([]) as readonly [],
    sourceRefs,
  });
}
