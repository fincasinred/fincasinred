import {
  createIdentifiedTechnicalValue,
  isTechnicalValueEvidence,
  type IdentifiedTechnicalValue,
  type TechnicalValueEvidence,
} from "../../domain/shared/TechnicalValue.js";
import { Provenance } from "../../domain/shared/Provenance.js";
import { ValidationStatus } from "../../domain/shared/ValidationStatus.js";

export const SOLAR_SIZING_ENERGY_UNIT = "kWh" as const;
export const SOLAR_SIZING_RULES_UNIT = "rules" as const;
export const SOLAR_RESOURCE_UNIT = "resource" as const;
export const SOLAR_LOSSES_UNIT = "coefficient" as const;
export const SOLAR_MARGIN_UNIT = "coefficient" as const;

export type SolarSizingEnergy = IdentifiedTechnicalValue<typeof SOLAR_SIZING_ENERGY_UNIT>;
export type SolarSizingRules = IdentifiedTechnicalValue<typeof SOLAR_SIZING_RULES_UNIT>;
export type SolarResourceMetric = IdentifiedTechnicalValue<string>;
export const SOLAR_RESOURCE_PROVIDER = "PVGIS" as const;

export interface SolarResourceLocation {
  readonly latitude: number;
  readonly longitude: number;
}

export interface SolarResourcePeriod {
  readonly start: string;
  readonly end: string;
}

export interface SolarResourceSourceReference {
  readonly provider: typeof SOLAR_RESOURCE_PROVIDER;
  readonly reference: string;
}

export interface PvgisSolarResourceRequest {
  readonly provider: typeof SOLAR_RESOURCE_PROVIDER;
  readonly location: Readonly<SolarResourceLocation>;
  readonly period: Readonly<SolarResourcePeriod>;
  readonly configuration: Readonly<Record<string, unknown>>;
  readonly sourceReference: string;
  readonly sectorId?: string;
}

export interface SolarResource {
  readonly metric: Readonly<SolarResourceMetric>;
  readonly location: Readonly<SolarResourceLocation>;
  readonly period: Readonly<SolarResourcePeriod>;
  readonly configuration: Readonly<Record<string, unknown>>;
  readonly provenance: Provenance;
  readonly status: ValidationStatus;
  readonly evidence: Readonly<TechnicalValueEvidence>;
  readonly source: Readonly<SolarResourceSourceReference>;
  readonly identity: Readonly<IdentifiedTechnicalValue["identity"]>;
  readonly sectorId?: string;
}

export type PvgisSolarResourceResponse = SolarResource;

export interface PvgisSolarResourcePreparationInput {
  readonly request: Readonly<PvgisSolarResourceRequest>;
  readonly response?: Readonly<PvgisSolarResourceResponse>;
}

export type PvgisSolarResourcePreparationResult =
  | {
      readonly status: "PENDING";
      readonly missingFields: readonly string[];
      readonly issues: readonly [];
    }
  | {
      readonly status: "BLOCKED";
      readonly missingFields: readonly [];
      readonly issues: readonly SolarSizingPreparationIssue[];
    }
  | {
      readonly status: "READY";
      readonly resource: Readonly<SolarResource>;
      readonly missingFields: readonly [];
      readonly issues: readonly [];
    };
export type SolarLosses = IdentifiedTechnicalValue<typeof SOLAR_LOSSES_UNIT>;
export type SolarMargin = IdentifiedTechnicalValue<typeof SOLAR_MARGIN_UNIT>;

export interface SolarSizingPreparationInput {
  readonly sectorId: string;
  readonly energy?: SolarSizingEnergy;
  readonly solarSizingRules?: SolarSizingRules;
  readonly solarResource?: SolarResource;
  readonly authorizedLosses?: SolarLosses;
  readonly authorizedMargin?: SolarMargin;
  readonly sourceRefs?: readonly string[];
}

export interface SolarSizingPreparationIssue {
  readonly code: string;
  readonly message: string;
  readonly path: string;
}

export interface SolarSizingPreparationDependencies {
  readonly energy?: Readonly<SolarSizingEnergy>;
  readonly solarSizingRules?: Readonly<SolarSizingRules>;
  readonly solarResource?: Readonly<SolarResource>;
  readonly authorizedLosses?: Readonly<SolarLosses>;
  readonly authorizedMargin?: Readonly<SolarMargin>;
}

export interface SolarSizingPreparationRequirement {
  readonly sectorId: string;
  readonly energy: Readonly<SolarSizingEnergy>;
  readonly solarSizingRules: Readonly<SolarSizingRules>;
  readonly solarResource: Readonly<SolarResource>;
  readonly authorizedLosses?: Readonly<SolarLosses>;
  readonly authorizedMargin?: Readonly<SolarMargin>;
  readonly sourceRefs: readonly string[];
}

export type SolarSizingPreparationResult =
  | {
      readonly status: "PENDING";
      readonly dependencies: Readonly<SolarSizingPreparationDependencies>;
      readonly dependencyRefs: readonly string[];
      readonly missingFields: readonly string[];
      readonly issues: readonly [];
      readonly sourceRefs: readonly string[];
    }
  | {
      readonly status: "BLOCKED";
      readonly dependencies: Readonly<SolarSizingPreparationDependencies>;
      readonly dependencyRefs: readonly string[];
      readonly missingFields: readonly [];
      readonly issues: readonly SolarSizingPreparationIssue[];
      readonly sourceRefs: readonly string[];
    }
  | {
      readonly status: "READY";
      readonly dependencies: Readonly<SolarSizingPreparationDependencies>;
      readonly requirement: Readonly<SolarSizingPreparationRequirement>;
      readonly dependencyRefs: readonly string[];
      readonly missingFields: readonly [];
      readonly issues: readonly [];
      readonly sourceRefs: readonly string[];
    };

export class SolarSizingPreparationContractError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "SolarSizingPreparationContractError";
  }
}

export function solarSizingEnergyPath(sectorId: string): string {
  return `energy.${sectorId}.energy`;
}

export function solarSizingRulesPath(sectorId: string): string {
  return `energy.${sectorId}.solarSizingRules`;
}

export function solarResourcePath(sectorId: string): string {
  return `energy.${sectorId}.solarResource`;
}

export function solarLossesPath(sectorId: string): string {
  return `energy.${sectorId}.solarLosses`;
}

export function solarMarginPath(sectorId: string): string {
  return `energy.${sectorId}.solarMargin`;
}

export function preparePvgisSolarResource(
  input: PvgisSolarResourcePreparationInput,
): Readonly<PvgisSolarResourcePreparationResult> {
  const request = input.request;
  const expectedPath = request.sectorId === undefined
    ? "energy.solarResource"
    : solarResourcePath(request.sectorId);

  if (input.response === undefined) {
    return Object.freeze({
      status: "PENDING" as const,
      missingFields: Object.freeze(["response"]),
      issues: Object.freeze([]) as readonly [],
    });
  }

  const validated = validateSolarResource(
    input.response,
    expectedPath,
    request.sectorId,
  );

  if (validated.issue !== undefined) {
    return Object.freeze({
      status: "BLOCKED" as const,
      missingFields: Object.freeze([]) as readonly [],
      issues: Object.freeze([validated.issue]),
    });
  }

  const resource = validated.value;
  if (resource === undefined) {
    return Object.freeze({
      status: "BLOCKED" as const,
      missingFields: Object.freeze([]) as readonly [],
      issues: Object.freeze([
        solarResourceIssue("PVGIS response could not be normalized", expectedPath),
      ]),
    });
  }

  if (
    resource.source.provider !== request.provider ||
    resource.source.reference !== request.sourceReference ||
    resource.location.latitude !== request.location.latitude ||
    resource.location.longitude !== request.location.longitude ||
    resource.period.start !== request.period.start ||
    resource.period.end !== request.period.end ||
    JSON.stringify(resource.configuration) !== JSON.stringify(request.configuration)
  ) {
    return Object.freeze({
      status: "BLOCKED" as const,
      missingFields: Object.freeze([]) as readonly [],
      issues: Object.freeze([
        solarResourceIssue(
          "PVGIS response does not match the requested resource contract",
          expectedPath,
        ),
      ]),
    });
  }

  return Object.freeze({
    status: "READY" as const,
    resource,
    missingFields: Object.freeze([]) as readonly [],
    issues: Object.freeze([]) as readonly [],
  });
}

function requireSectorId(sectorId: string): string {
  if (typeof sectorId !== "string" || sectorId.trim().length === 0) {
    throw new SolarSizingPreparationContractError("sectorId is required");
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
    sourceRefs.some((sourceRef) => typeof sourceRef !== "string" || sourceRef.trim().length === 0)
  ) {
    throw new SolarSizingPreparationContractError(
      "sourceRefs must contain non-empty strings",
    );
  }

  return Object.freeze([...new Set(sourceRefs)]);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function isProvenance(value: unknown): value is Provenance {
  return Object.values(Provenance).includes(value as Provenance);
}

function isBlockedStatus(value: ValidationStatus): boolean {
  return (
    value === ValidationStatus.PENDING ||
    value === ValidationStatus.BLOCKED ||
    value === ValidationStatus.INVALID ||
    value === ValidationStatus.OBSOLETE
  );
}

function solarResourceIssue(
  message: string,
  path: string,
): SolarSizingPreparationIssue {
  return {
    code: "solarSizingPreparation.dependency.invalid",
    message,
    path,
  };
}

function validateSolarResource(
  value: SolarResource | undefined,
  expectedPath: string,
  sectorId: string | undefined,
): {
  readonly value?: Readonly<SolarResource>;
  readonly missingField?: string;
  readonly dependencyRef?: string;
  readonly issue?: SolarSizingPreparationIssue;
} {
  if (value === undefined) {
    return { missingField: "solarResource" };
  }

  if (!isPlainRecord(value)) {
    return { issue: solarResourceIssue("solarResource must be an object", expectedPath) };
  }

  if (value.identity?.path !== expectedPath) {
    return {
      issue: {
        code: "solarSizingPreparation.dependency.path.mismatch",
        message: `solarResource dependency path must be ${expectedPath}`,
        path: value.identity?.path ?? expectedPath,
      },
    };
  }

  if (value.sectorId !== undefined && value.sectorId !== sectorId) {
    return {
      issue: solarResourceIssue(
        `solarResource sectorId must be ${sectorId}`,
        expectedPath,
      ),
    };
  }

  if (!isProvenance(value.provenance)) {
    return { issue: solarResourceIssue("solarResource provenance is invalid", expectedPath) };
  }

  if (isBlockedStatus(value.status)) {
    return {
      issue: {
        code: "solarSizingPreparation.dependency.blocked",
        message: `solarResource dependency has status ${value.status}`,
        path: expectedPath,
      },
    };
  }

  if (!isTechnicalValueEvidence(value.evidence)) {
    return { issue: solarResourceIssue("solarResource evidence is required", expectedPath) };
  }

  if (
    !isPlainRecord(value.source) ||
    value.source.provider !== SOLAR_RESOURCE_PROVIDER ||
    typeof value.source.reference !== "string" ||
    value.source.reference.trim().length === 0
  ) {
    return { issue: solarResourceIssue("solarResource source is invalid", expectedPath) };
  }

  let metric: Readonly<SolarResourceMetric>;
  try {
    metric = createIdentifiedTechnicalValue(value.metric as SolarResourceMetric);
  } catch {
    return { issue: solarResourceIssue("solarResource metric is invalid", expectedPath) };
  }

  const location = value.location;
  if (
    !isPlainRecord(location) ||
    typeof location.latitude !== "number" ||
    !Number.isFinite(location.latitude) ||
    location.latitude < -90 ||
    location.latitude > 90 ||
    typeof location.longitude !== "number" ||
    !Number.isFinite(location.longitude) ||
    location.longitude < -180 ||
    location.longitude > 180
  ) {
    return { issue: solarResourceIssue("solarResource location is invalid", expectedPath) };
  }

  const period = value.period;
  if (
    !isPlainRecord(period) ||
    typeof period.start !== "string" ||
    typeof period.end !== "string" ||
    period.start.trim().length === 0 ||
    period.end.trim().length === 0 ||
    !Number.isFinite(Date.parse(period.start)) ||
    !Number.isFinite(Date.parse(period.end)) ||
    Date.parse(period.end) < Date.parse(period.start)
  ) {
    return { issue: solarResourceIssue("solarResource period is invalid", expectedPath) };
  }

  if (!isPlainRecord(value.configuration)) {
    return {
      issue: solarResourceIssue(
        "solarResource configuration is required",
        expectedPath,
      ),
    };
  }

  return {
    value: Object.freeze({
      ...value,
      metric,
      location: Object.freeze({ ...location }),
      period: Object.freeze({ ...period }),
      configuration: Object.freeze({ ...value.configuration }),
      evidence: Object.freeze({ ...value.evidence }),
      identity: Object.freeze({ ...value.identity }),
    }),
    dependencyRef: value.identity.path,
  };
}

function dependencyIssue(
  field: string,
  value: Readonly<IdentifiedTechnicalValue>,
  expectedPath: string,
  expectedUnit: string,
): SolarSizingPreparationIssue | undefined {
  if (value.identity.path !== expectedPath) {
    return {
      code: "solarSizingPreparation.dependency.path.mismatch",
      message: `${field} dependency path must be ${expectedPath}`,
      path: value.identity.path,
    };
  }

  if (value.unit !== expectedUnit) {
    return {
      code: "solarSizingPreparation.dependency.unit.mismatch",
      message: `${field} dependency must use ${expectedUnit}`,
      path: value.identity.path,
    };
  }

  if (
    value.status === ValidationStatus.PENDING ||
    value.status === ValidationStatus.BLOCKED ||
    value.status === ValidationStatus.INVALID ||
    value.status === ValidationStatus.OBSOLETE
  ) {
    return {
      code: "solarSizingPreparation.dependency.blocked",
      message: `${field} dependency has status ${value.status}`,
      path: value.identity.path,
    };
  }

  return undefined;
}

function validateDependency<Unit extends string>(
  field: string,
  value: IdentifiedTechnicalValue<Unit> | undefined,
  expectedPath: string,
  expectedUnit: Unit,
): {
  readonly value?: Readonly<IdentifiedTechnicalValue<Unit>>;
  readonly missingField?: string;
  readonly dependencyRef?: string;
  readonly issue?: SolarSizingPreparationIssue;
} {
  if (value === undefined) {
    return { missingField: field };
  }

  const validated = createIdentifiedTechnicalValue(value);
  const issue = dependencyIssue(field, validated, expectedPath, expectedUnit);

  return {
    value: validated,
    dependencyRef: validated.identity.path,
    ...(issue === undefined ? {} : { issue }),
  };
}

function createResult(
  status: SolarSizingPreparationResult["status"],
  dependencies: SolarSizingPreparationDependencies,
  dependencyRefs: readonly string[],
  missingFields: readonly string[],
  issues: readonly SolarSizingPreparationIssue[],
  sourceRefs: readonly string[],
  sectorId: string,
): Readonly<SolarSizingPreparationResult> {
  const required =
    status === "READY" &&
    dependencies.energy !== undefined &&
    dependencies.solarSizingRules !== undefined &&
    dependencies.solarResource !== undefined
      ? {
          sectorId,
          energy: dependencies.energy,
          solarSizingRules: dependencies.solarSizingRules,
          solarResource: dependencies.solarResource,
          ...(dependencies.authorizedLosses === undefined
            ? {}
            : { authorizedLosses: dependencies.authorizedLosses }),
          ...(dependencies.authorizedMargin === undefined
            ? {}
            : { authorizedMargin: dependencies.authorizedMargin }),
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
  }) as Readonly<SolarSizingPreparationResult>;
}

export function prepareSolarSizing(
  input: SolarSizingPreparationInput,
): Readonly<SolarSizingPreparationResult> {
  const sectorId = requireSectorId(input.sectorId);
  const sourceRefs = validateSourceRefs(input.sourceRefs);
  const missingFields: string[] = [];
  const issues: SolarSizingPreparationIssue[] = [];
  const dependencyRefs: string[] = [];
  const dependencies: SolarSizingPreparationDependencies = {};

  const validated = [
    validateDependency("energy", input.energy, solarSizingEnergyPath(sectorId), SOLAR_SIZING_ENERGY_UNIT),
    validateDependency("solarSizingRules", input.solarSizingRules, solarSizingRulesPath(sectorId), SOLAR_SIZING_RULES_UNIT),
    validateSolarResource(input.solarResource, solarResourcePath(sectorId), sectorId),
    validateDependency("authorizedLosses", input.authorizedLosses, solarLossesPath(sectorId), SOLAR_LOSSES_UNIT),
    validateDependency("authorizedMargin", input.authorizedMargin, solarMarginPath(sectorId), SOLAR_MARGIN_UNIT),
  ];

  for (const [index, dependency] of validated.entries()) {
    if (dependency.missingField !== undefined && index < 3) {
      missingFields.push(dependency.missingField);
    }
    if (dependency.dependencyRef !== undefined) {
      dependencyRefs.push(dependency.dependencyRef);
    }
    if (dependency.issue !== undefined) {
      issues.push(dependency.issue);
    }
  }

  const [energy, solarSizingRules, solarResource, authorizedLosses, authorizedMargin] = validated;
  const energyValue = energy?.value;
  const solarSizingRulesValue = solarSizingRules?.value;
  const solarResourceValue = solarResource?.value;
  const authorizedLossesValue = authorizedLosses?.value;
  const authorizedMarginValue = authorizedMargin?.value;
  const resolvedDependencies: SolarSizingPreparationDependencies = {
    ...(energyValue === undefined ? {} : { energy: energyValue as SolarSizingEnergy }),
    ...(solarSizingRulesValue === undefined
      ? {}
      : { solarSizingRules: solarSizingRulesValue as SolarSizingRules }),
    ...(solarResourceValue === undefined
      ? {}
      : { solarResource: solarResourceValue as SolarResource }),
    ...(authorizedLossesValue === undefined
      ? {}
      : { authorizedLosses: authorizedLossesValue as SolarLosses }),
    ...(authorizedMarginValue === undefined
      ? {}
      : { authorizedMargin: authorizedMarginValue as SolarMargin }),
  };

  if (issues.length > 0) {
    return createResult("BLOCKED", resolvedDependencies, dependencyRefs, [], issues, sourceRefs, sectorId);
  }

  if (missingFields.length > 0) {
    return createResult("PENDING", resolvedDependencies, dependencyRefs, [...new Set(missingFields)], [], sourceRefs, sectorId);
  }

  return createResult("READY", resolvedDependencies, dependencyRefs, [], [], sourceRefs, sectorId);
}
