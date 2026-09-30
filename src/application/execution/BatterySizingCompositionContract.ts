import {
  batteryAutonomyPath,
  batteryCycleEfficiencyPath,
  batteryDepthOfDischargePath,
  batteryDesignHorizonPath,
  batteryEnergyBoundaryPath,
  batteryEnergyDemandPath,
  batteryReservePath,
  BATTERY_TERMINAL,
  type BatteryAutonomy,
  type BatteryCycleEfficiency,
  type BatteryDepthOfDischarge,
  type BatteryDesignHorizon,
  type BatterySizingEnergyBoundary,
  type BatterySizingEnergyDemand,
  type BatterySizingPeriod,
  type BatteryReserve,
} from "./BatterySizingPreparationContract.js";
import {
  createInitialBatterySizingInputs,
  type InitialBatterySizingInputs,
} from "./InitialBatterySizingInputsContract.js";

export interface BatterySizingCompositionContext {
  readonly sectorId: string;
  readonly energyBoundary?: Readonly<BatterySizingEnergyBoundary>;
  readonly autonomy?: Readonly<BatteryAutonomy & { readonly period: Readonly<BatterySizingPeriod> }>;
  readonly designHorizon?: Readonly<BatteryDesignHorizon>;
  readonly reserve?: Readonly<BatteryReserve>;
  readonly depthOfDischarge?: Readonly<BatteryDepthOfDischarge>;
  readonly cycleEfficiency?: Readonly<BatteryCycleEfficiency>;
  readonly dependencyRefs?: readonly string[];
  readonly sourceRefs?: readonly string[];
}

export interface BatterySizingCompositionInput
  extends BatterySizingCompositionContext {
  readonly energyDemand?: Readonly<BatterySizingEnergyDemand>;
}

export interface BatterySizingCompositionIssue {
  readonly code: string;
  readonly message: string;
  readonly path: string;
}

type BatterySizingCompositionDependencies = {
  readonly energyDemand?: Readonly<BatterySizingEnergyDemand>;
  readonly energyBoundary?: Readonly<BatterySizingEnergyBoundary>;
  readonly autonomy?: Readonly<BatteryAutonomy & { readonly period: Readonly<BatterySizingPeriod> }>;
  readonly designHorizon?: Readonly<BatteryDesignHorizon>;
  readonly reserve?: Readonly<BatteryReserve>;
  readonly depthOfDischarge?: Readonly<BatteryDepthOfDischarge>;
  readonly cycleEfficiency?: Readonly<BatteryCycleEfficiency>;
};

export type BatterySizingCompositionResult =
  | {
      readonly status: "PENDING";
      readonly dependencies: Readonly<BatterySizingCompositionDependencies>;
      readonly missingFields: readonly string[];
      readonly issues: readonly [];
      readonly dependencyRefs: readonly string[];
      readonly sourceRefs: readonly string[];
    }
  | {
      readonly status: "BLOCKED";
      readonly dependencies: Readonly<BatterySizingCompositionDependencies>;
      readonly missingFields: readonly [];
      readonly issues: readonly BatterySizingCompositionIssue[];
      readonly dependencyRefs: readonly string[];
      readonly sourceRefs: readonly string[];
    }
  | {
      readonly status: "READY";
      readonly dependencies: Readonly<BatterySizingCompositionDependencies>;
      readonly inputs: Readonly<Extract<InitialBatterySizingInputs, { readonly status: "AVAILABLE" }>>;
      readonly missingFields: readonly [];
      readonly issues: readonly [];
      readonly dependencyRefs: readonly string[];
      readonly sourceRefs: readonly string[];
    };

export class BatterySizingCompositionContractError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "BatterySizingCompositionContractError";
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function requireSectorId(sectorId: string): string {
  if (!isNonEmptyString(sectorId)) {
    throw new BatterySizingCompositionContractError("sectorId is required");
  }
  return sectorId;
}

function validateRefs(
  refs: readonly string[] | undefined,
  field: string,
): readonly string[] | undefined {
  if (refs === undefined) return undefined;
  if (!Array.isArray(refs) || refs.some((ref) => !isNonEmptyString(ref))) {
    throw new BatterySizingCompositionContractError(
      `${field} must contain non-empty strings`,
    );
  }
  return Object.freeze([...new Set(refs)]);
}

function issue(
  code: string,
  message: string,
  path: string,
): BatterySizingCompositionIssue {
  return { code, message, path };
}

function dependenciesFrom(
  input: BatterySizingCompositionInput,
): BatterySizingCompositionDependencies {
  return Object.freeze({
    ...(input.energyDemand === undefined ? {} : { energyDemand: input.energyDemand }),
    ...(input.energyBoundary === undefined ? {} : { energyBoundary: input.energyBoundary }),
    ...(input.autonomy === undefined ? {} : { autonomy: input.autonomy }),
    ...(input.designHorizon === undefined ? {} : { designHorizon: input.designHorizon }),
    ...(input.reserve === undefined ? {} : { reserve: input.reserve }),
    ...(input.depthOfDischarge === undefined
      ? {}
      : { depthOfDischarge: input.depthOfDischarge }),
    ...(input.cycleEfficiency === undefined
      ? {}
      : { cycleEfficiency: input.cycleEfficiency }),
  });
}

function baseResult(
  status: "PENDING" | "BLOCKED",
  dependencies: Readonly<BatterySizingCompositionDependencies>,
  missingFields: readonly string[],
  issues: readonly BatterySizingCompositionIssue[],
  dependencyRefs: readonly string[],
  sourceRefs: readonly string[],
): Readonly<BatterySizingCompositionResult> {
  return Object.freeze({
    status,
    dependencies,
    missingFields: Object.freeze([...missingFields]),
    issues: Object.freeze([...issues]),
    dependencyRefs: Object.freeze([...dependencyRefs]),
    sourceRefs: Object.freeze([...sourceRefs]),
  }) as Readonly<BatterySizingCompositionResult>;
}

export function composeBatterySizingInputs(
  input: BatterySizingCompositionInput,
): Readonly<BatterySizingCompositionResult> {
  const sectorId = requireSectorId(input.sectorId);
  const dependencies = dependenciesFrom(input);
  const dependencyRefs = validateRefs(input.dependencyRefs, "dependencyRefs");
  const sourceRefs = validateRefs(input.sourceRefs, "sourceRefs");
  const missingFields: string[] = [];
  const issues: BatterySizingCompositionIssue[] = [];

  for (const [field, value] of [
    ["energyDemand", input.energyDemand],
    ["energyBoundary", input.energyBoundary],
    ["autonomy", input.autonomy],
    ["designHorizon", input.designHorizon],
    ["reserve", input.reserve],
    ["depthOfDischarge", input.depthOfDischarge],
  ] as const) {
    if (value === undefined) missingFields.push(field);
  }

  if (dependencyRefs === undefined || dependencyRefs.length === 0) {
    missingFields.push("dependencyRefs");
  }
  if (sourceRefs === undefined || sourceRefs.length === 0) {
    missingFields.push("sourceRefs");
  }

  if (input.energyBoundary !== undefined && input.energyBoundary.terminal !== BATTERY_TERMINAL) {
    issues.push(
      issue(
        "batterySizingComposition.energyBoundary.terminal.mismatch",
        `energyBoundary.terminal must be ${BATTERY_TERMINAL}`,
        batteryEnergyBoundaryPath(sectorId),
      ),
    );
  }

  if (input.autonomy !== undefined && !isNonEmptyString(input.autonomy.period?.ref)) {
    issues.push(
      issue(
        "batterySizingComposition.autonomy.period.invalid",
        "autonomy.period.ref is required",
        batteryAutonomyPath(sectorId),
      ),
    );
  }

  const expectedDependencyRefs = [
    batteryEnergyDemandPath(sectorId),
    batteryEnergyBoundaryPath(sectorId),
    batteryAutonomyPath(sectorId),
    batteryDesignHorizonPath(sectorId),
    batteryReservePath(sectorId),
    batteryDepthOfDischargePath(sectorId),
    ...(input.cycleEfficiency === undefined
      ? []
      : [batteryCycleEfficiencyPath(sectorId)]),
  ];
  if (dependencyRefs !== undefined) {
    const missingRefs = expectedDependencyRefs.filter(
      (ref) => !dependencyRefs.includes(ref),
    );
    if (missingRefs.length > 0) {
      missingFields.push(...missingRefs.map((ref) => `dependencyRefs:${ref}`));
    } else if (
      dependencyRefs.length !== expectedDependencyRefs.length ||
      dependencyRefs.some((ref, index) => ref !== expectedDependencyRefs[index])
    ) {
      issues.push(
        issue(
          "batterySizingComposition.dependencyRefs.mismatch",
          "dependencyRefs must match the composed battery sizing inputs",
          `energy.${sectorId}.battery`,
        ),
      );
    }
  }

  if (issues.length > 0) {
    return baseResult("BLOCKED", dependencies, [], issues, dependencyRefs ?? [], sourceRefs ?? []);
  }

  const uniqueMissingFields = [...new Set(missingFields)];
  if (uniqueMissingFields.length > 0) {
    return baseResult(
      "PENDING",
      dependencies,
      uniqueMissingFields,
      [],
      dependencyRefs ?? [],
      sourceRefs ?? [],
    );
  }

  if (
    input.energyDemand === undefined ||
    input.energyBoundary === undefined ||
    input.autonomy === undefined ||
    input.designHorizon === undefined ||
    input.reserve === undefined ||
    input.depthOfDischarge === undefined
  ) {
    throw new BatterySizingCompositionContractError(
      "mandatory battery sizing composition dependencies are incomplete",
    );
  }

  if (dependencyRefs === undefined || sourceRefs === undefined) {
    throw new BatterySizingCompositionContractError(
      "battery sizing composition traceability is incomplete",
    );
  }

  try {
    const inputs = createInitialBatterySizingInputs({
      status: "AVAILABLE",
      sectorId,
      energyDemand: input.energyDemand,
      energyBoundary: input.energyBoundary,
      autonomy: input.autonomy,
      designHorizon: input.designHorizon,
      reserve: input.reserve,
      depthOfDischarge: input.depthOfDischarge,
      ...(input.cycleEfficiency === undefined
        ? {}
        : { cycleEfficiency: input.cycleEfficiency }),
      dependencyRefs,
      sourceRefs,
    });

    if (inputs.status !== "AVAILABLE") {
      throw new BatterySizingCompositionContractError(
        "composed battery sizing inputs are not available",
      );
    }

    return Object.freeze({
      status: "READY" as const,
      dependencies,
      inputs,
      missingFields: Object.freeze([]) as readonly [],
      issues: Object.freeze([]) as readonly [],
      dependencyRefs: Object.freeze([...(dependencyRefs ?? [])]),
      sourceRefs: Object.freeze([...(sourceRefs ?? [])]),
    });
  } catch (error) {
    return baseResult(
      "BLOCKED",
      dependencies,
      [],
      [
        issue(
          "batterySizingComposition.invalid",
          error instanceof Error ? error.message : "battery sizing inputs are invalid",
          `energy.${sectorId}.battery`,
        ),
      ],
      dependencyRefs ?? [],
      sourceRefs ?? [],
    );
  }
}