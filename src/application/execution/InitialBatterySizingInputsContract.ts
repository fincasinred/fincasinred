import {
  batteryAutonomyPath,
  batteryCycleEfficiencyPath,
  batteryDepthOfDischargePath,
  batteryDesignHorizonPath,
  batteryEnergyBoundaryPath,
  batteryEnergyDemandPath,
  batteryReservePath,
  BATTERY_FACTOR_UNIT,
  BATTERY_TERMINAL,
  type BatteryCycleEfficiency,
  type BatteryDepthOfDischarge,
  type BatteryDesignHorizon,
  type BatteryReserve,
  type BatterySizingAutonomy,
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

type InitialBatterySizingAvailableInput = {
  readonly status: "AVAILABLE";
  readonly sectorId: string;
  readonly energyDemand: Readonly<BatterySizingEnergyDemand>;
  readonly energyBoundary: Readonly<BatterySizingEnergyBoundary>;
  readonly autonomy: Readonly<BatterySizingAutonomy>;
  readonly designHorizon: Readonly<BatteryDesignHorizon>;
  readonly reserve: Readonly<BatteryReserve>;
  readonly depthOfDischarge: Readonly<BatteryDepthOfDischarge>;
  readonly cycleEfficiency?: Readonly<BatteryCycleEfficiency>;
  readonly dependencyRefs: readonly string[];
  readonly sourceRefs: readonly string[];
};

export type InitialBatterySizingInput = Omit<
  InitialBatterySizingAvailableInput,
  "dependencyRefs" | "sourceRefs"
> & {
  readonly dependencyRefs?: readonly string[];
  readonly sourceRefs?: readonly string[];
};

export type InitialBatterySizingInputs =
  | InitialBatterySizingAvailableInput
  | {
      readonly status: "ABSENT";
    }
  | {
      readonly status: "BLOCKED";
      readonly issue: string;
    };

export class InitialBatterySizingInputsError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "InitialBatterySizingInputsError";
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function isBlockedStatus(value: ValidationStatus): boolean {
  return (
    value === ValidationStatus.PENDING ||
    value === ValidationStatus.BLOCKED ||
    value === ValidationStatus.INVALID ||
    value === ValidationStatus.OBSOLETE
  );
}

function validateRefs(value: unknown, field: string): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.some((ref) => !isNonEmptyString(ref))
  ) {
    throw new InitialBatterySizingInputsError(
      `${field} must contain non-empty strings`,
    );
  }

  return Object.freeze([...new Set(value)]);
}

function validateSizingPeriod(
  value: unknown,
  field: string,
): asserts value is Readonly<BatterySizingPeriod> {
  if (!isPlainRecord(value) || !isNonEmptyString(value.ref)) {
    throw new InitialBatterySizingInputsError(
      `${field}.period.ref is required`,
    );
  }
}

function validateBatteryTerminal(
  value: unknown,
  field: string,
): asserts value is Readonly<{ readonly terminal: typeof BATTERY_TERMINAL }> {
  if (!isPlainRecord(value) || value.terminal !== BATTERY_TERMINAL) {
    throw new InitialBatterySizingInputsError(
      `${field}.terminal must be ${BATTERY_TERMINAL}`,
    );
  }
}

function validateDependency<Unit extends string = string>(
  field: string,
  value: unknown,
  expectedPath: string,
  expectedUnit?: Unit,
): Readonly<IdentifiedTechnicalValue<Unit>> {
  if (!isPlainRecord(value)) {
    throw new InitialBatterySizingInputsError(`${field} must be an object`);
  }

  let validated: Readonly<IdentifiedTechnicalValue<Unit>>;
  try {
    validated = createIdentifiedTechnicalValue(
      value as unknown as IdentifiedTechnicalValue<Unit>,
    );
  } catch {
    throw new InitialBatterySizingInputsError(`${field} is invalid`);
  }

  if (validated.identity.path !== expectedPath) {
    throw new InitialBatterySizingInputsError(
      `${field} identity.path must be ${expectedPath}`,
    );
  }

  if (expectedUnit !== undefined && validated.unit !== expectedUnit) {
    throw new InitialBatterySizingInputsError(
      `${field} must use ${expectedUnit}`,
    );
  }

  if (isBlockedStatus(validated.status)) {
    throw new InitialBatterySizingInputsError(
      `${field} has status ${validated.status}`,
    );
  }

  if (
    validated.evidence !== undefined &&
    !isTechnicalValueEvidence(validated.evidence)
  ) {
    throw new InitialBatterySizingInputsError(`${field} evidence is invalid`);
  }

  return value as Readonly<IdentifiedTechnicalValue<Unit>>;
}

function validateAvailable(
  value: Record<string, unknown>,
  sectorId: string,
  requireReferences: boolean,
): Omit<Extract<InitialBatterySizingInputs, { status: "AVAILABLE" }>, "status" | "sectorId"> {
  if (!isNonEmptyString(sectorId)) {
    throw new InitialBatterySizingInputsError(
      "sectorId is required for available battery sizing inputs",
    );
  }

  const energyDemand = validateDependency(
    "energyDemand",
    value.energyDemand,
    batteryEnergyDemandPath(sectorId),
    "kWh",
  ) as Readonly<BatterySizingEnergyDemand>;
  const energyBoundary = validateDependency(
    "energyBoundary",
    value.energyBoundary,
    batteryEnergyBoundaryPath(sectorId),
  ) as Readonly<BatterySizingEnergyBoundary>;
  const autonomy = validateDependency(
    "autonomy",
    value.autonomy,
    batteryAutonomyPath(sectorId),
  ) as Readonly<BatterySizingAutonomy>;
  const designHorizon = validateDependency(
    "designHorizon",
    value.designHorizon,
    batteryDesignHorizonPath(sectorId),
  ) as Readonly<BatteryDesignHorizon>;
  const reserve = validateDependency(
    "reserve",
    value.reserve,
    batteryReservePath(sectorId),
  ) as Readonly<BatteryReserve>;
  const depthOfDischarge = validateDependency(
    "depthOfDischarge",
    value.depthOfDischarge,
    batteryDepthOfDischargePath(sectorId),
    BATTERY_FACTOR_UNIT,
  ) as Readonly<BatteryDepthOfDischarge>;

  validateSizingPeriod(energyDemand.period, "energyDemand");
  validateSizingPeriod(autonomy.period, "autonomy");
  if (energyDemand.period.ref !== autonomy.period.ref) {
    throw new InitialBatterySizingInputsError(
      "energyDemand.period must match autonomy.period",
    );
  }
  validateBatteryTerminal(energyBoundary, "energyBoundary");

  if (depthOfDischarge.value <= 0 || depthOfDischarge.value > 1) {
    throw new InitialBatterySizingInputsError(
      "depthOfDischarge.value must satisfy 0 < DoD <= 1",
    );
  }

  const cycleEfficiency =
    value.cycleEfficiency === undefined
      ? undefined
      : (validateDependency(
          "cycleEfficiency",
          value.cycleEfficiency,
          batteryCycleEfficiencyPath(sectorId),
          BATTERY_FACTOR_UNIT,
        ) as Readonly<BatteryCycleEfficiency>);

  const expectedDependencyRefs = [
    batteryEnergyDemandPath(sectorId),
    batteryEnergyBoundaryPath(sectorId),
    batteryAutonomyPath(sectorId),
    batteryDesignHorizonPath(sectorId),
    batteryReservePath(sectorId),
    batteryDepthOfDischargePath(sectorId),
    ...(cycleEfficiency === undefined
      ? []
      : [batteryCycleEfficiencyPath(sectorId)]),
  ];
  const dependencyRefs =
    value.dependencyRefs === undefined
      ? Object.freeze(expectedDependencyRefs)
      : validateRefs(value.dependencyRefs, "dependencyRefs");
  const sourceRefs =
    value.sourceRefs === undefined
      ? Object.freeze([])
      : validateRefs(value.sourceRefs, "sourceRefs");

  if (
    requireReferences &&
    (value.dependencyRefs === undefined || value.sourceRefs === undefined)
  ) {
    throw new InitialBatterySizingInputsError(
      "available battery sizing inputs must contain dependencyRefs and sourceRefs",
    );
  }

  return {
    energyDemand,
    energyBoundary,
    autonomy,
    designHorizon,
    reserve,
    depthOfDischarge,
    ...(cycleEfficiency === undefined ? {} : { cycleEfficiency }),
    dependencyRefs,
    sourceRefs,
  };
}

export function createInitialBatterySizingInputs(
  input: InitialBatterySizingInputs | InitialBatterySizingInput,
): Readonly<InitialBatterySizingInputs> {
  if (!isPlainRecord(input)) {
    throw new InitialBatterySizingInputsError("input must be an object");
  }

  if (input.status === "ABSENT") {
    return Object.freeze({ status: "ABSENT" });
  }

  if (input.status === "BLOCKED") {
    if (!isNonEmptyString(input.issue)) {
      throw new InitialBatterySizingInputsError(
        "issue is required for blocked battery sizing inputs",
      );
    }

    return Object.freeze({ status: "BLOCKED", issue: input.issue });
  }

  if (input.status !== "AVAILABLE") {
    throw new InitialBatterySizingInputsError(
      "status must be AVAILABLE, ABSENT, or BLOCKED",
    );
  }

  const available = validateAvailable(input, input.sectorId, false);
  return validateInitialBatterySizingInputs(
    Object.freeze({ status: "AVAILABLE", sectorId: input.sectorId, ...available }),
  );
}

export function validateInitialBatterySizingInputs(
  value: unknown,
): Readonly<InitialBatterySizingInputs> {
  if (!isPlainRecord(value) || !Object.isFrozen(value)) {
    throw new InitialBatterySizingInputsError(
      "initialBatterySizingInputs must be an authorized frozen source",
    );
  }

  if (value.status === "ABSENT") {
    if (Object.keys(value).length !== 1) {
      throw new InitialBatterySizingInputsError(
        "ABSENT battery sizing inputs must not contain data",
      );
    }
    return value as unknown as Readonly<InitialBatterySizingInputs>;
  }

  if (value.status === "BLOCKED") {
    if (!isNonEmptyString(value.issue)) {
      throw new InitialBatterySizingInputsError(
        "initialBatterySizingInputs.issue is required when status is BLOCKED",
      );
    }
    return value as unknown as Readonly<InitialBatterySizingInputs>;
  }

  if (value.status !== "AVAILABLE") {
    throw new InitialBatterySizingInputsError(
      "initialBatterySizingInputs.status is invalid",
    );
  }

  if (!isNonEmptyString(value.sectorId)) {
    throw new InitialBatterySizingInputsError("sectorId is required");
  }

  const available = validateAvailable(value, value.sectorId, true);
  const expectedDependencyRefs = [
    batteryEnergyDemandPath(value.sectorId),
    batteryEnergyBoundaryPath(value.sectorId),
    batteryAutonomyPath(value.sectorId),
    batteryDesignHorizonPath(value.sectorId),
    batteryReservePath(value.sectorId),
    batteryDepthOfDischargePath(value.sectorId),
    ...(value.cycleEfficiency === undefined
      ? []
      : [batteryCycleEfficiencyPath(value.sectorId)]),
  ];

  if (
    available.dependencyRefs.length !== expectedDependencyRefs.length ||
    available.dependencyRefs.some(
      (ref, index) => ref !== expectedDependencyRefs[index],
    )
  ) {
    throw new InitialBatterySizingInputsError(
      "dependencyRefs must match the available battery sizing inputs",
    );
  }

  return value as unknown as Readonly<InitialBatterySizingInputs>;
}