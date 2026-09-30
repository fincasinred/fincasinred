import type {
  ProductCatalog,
  ProductCatalogTraceability,
  SolarPanelCandidatesResult,
} from "../../domain/catalog/ProductCatalog.js";
import {
  prepareSolarPanelCompatibilityPolicy,
  SolarPanelCompatibilityPolicyContractError,
  type SolarPanelCompatibilityPolicyIssue,
  type SolarPanelCompatibilityPolicyReference,
} from "../../domain/catalog/SolarPanelCompatibilityPolicyContract.js";
import {
  prepareSolarPanelSelectionPolicy,
  SolarPanelSelectionPolicyContractError,
  type SolarPanelSelectionPolicyIssue,
  type SolarPanelSelectionPolicyReference,
} from "../../domain/catalog/SolarPanelSelectionPolicyContract.js";
import type { TechnicalSolarPanelProduct } from "../../domain/catalog/TechnicalProduct.js";
import {
  createIdentifiedTechnicalValue,
  type IdentifiedTechnicalValue,
} from "../../domain/shared/TechnicalValue.js";
import { ValidationStatus } from "../../domain/shared/ValidationStatus.js";

export type RequiredPvPowerKwp = IdentifiedTechnicalValue<"kWp">;

export interface SolarPanelCandidatesPreparationInput {
  readonly sectorId?: string;
  readonly catalog?: ProductCatalog;
  readonly requiredPvPowerKwp?: RequiredPvPowerKwp;
  readonly selectionPolicy?: SolarPanelSelectionPolicyReference;
  readonly compatibilityPolicy?: SolarPanelCompatibilityPolicyReference;
  readonly blockingIssues?: readonly SolarPanelCandidatesPreparationIssue[];
}

export interface SolarPanelCandidatesPreparationIssue {
  readonly code: string;
  readonly message: string;
  readonly path: string;
}

export interface SolarPanelCandidatesPreparationDependencies {
  readonly sectorId?: string;
  readonly catalog?: ProductCatalog;
  readonly catalogVersion?: string;
  readonly requiredPvPowerKwp?: Readonly<RequiredPvPowerKwp>;
  readonly selectionPolicy?: Readonly<SolarPanelSelectionPolicyReference>;
  readonly compatibilityPolicy?: Readonly<SolarPanelCompatibilityPolicyReference>;
  readonly candidates: readonly TechnicalSolarPanelProduct[];
  readonly productIds: readonly string[];
  readonly traceability: readonly ProductCatalogTraceability[];
}

export interface SolarPanelCandidatesPreparationResult {
  readonly status: "PENDING" | "BLOCKED";
  readonly dependencies: Readonly<SolarPanelCandidatesPreparationDependencies>;
  readonly dependencyRefs: readonly string[];
  readonly sourceRefs: readonly string[];
  readonly missingFields: readonly string[];
  readonly issues: readonly SolarPanelCandidatesPreparationIssue[];
}

export interface SolarPanelCandidatesIntermediatePayload {
  readonly solarPanelCandidates: Readonly<SolarPanelCandidatesPreparationResult>;
}

export class SolarPanelCandidatesPreparationContractError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "SolarPanelCandidatesPreparationContractError";
  }
}

function validateBlockingIssues(
  issues: readonly SolarPanelCandidatesPreparationIssue[] | undefined,
): readonly SolarPanelCandidatesPreparationIssue[] {
  if (issues === undefined) return Object.freeze([]);
  if (!Array.isArray(issues)) {
    throw new SolarPanelCandidatesPreparationContractError(
      "blockingIssues must be an array",
    );
  }

  for (const issue of issues) {
    if (
      issue === null ||
      typeof issue !== "object" ||
      typeof issue.code !== "string" ||
      issue.code.trim().length === 0 ||
      typeof issue.message !== "string" ||
      issue.message.trim().length === 0 ||
      typeof issue.path !== "string" ||
      issue.path.trim().length === 0
    ) {
      throw new SolarPanelCandidatesPreparationContractError(
        "blockingIssues must contain code, message and path",
      );
    }
  }

  return Object.freeze(issues.map((issue) => Object.freeze({ ...issue })));
}

function validateRequiredPower(
  value: RequiredPvPowerKwp | undefined,
  sectorId: string | undefined,
): {
  readonly value?: Readonly<RequiredPvPowerKwp>;
  readonly missingField?: string;
  readonly dependencyRefs: readonly string[];
  readonly sourceRefs: readonly string[];
  readonly issue?: SolarPanelCandidatesPreparationIssue;
} {
  if (value === undefined) {
    return {
      missingField: "requiredPvPowerKwp",
      dependencyRefs: [],
      sourceRefs: [],
    };
  }

  let validated: Readonly<RequiredPvPowerKwp>;
  try {
    validated = createIdentifiedTechnicalValue(value);
  } catch (error) {
    return {
      dependencyRefs: [],
      sourceRefs: [],
      issue: Object.freeze({
        code: "solarPanelCandidatesPreparation.dependency.invalid",
        message: error instanceof Error
          ? error.message
          : "requiredPvPowerKwp dependency is invalid",
        path: "requiredPvPowerKwp",
      }),
    };
  }

  const evidenceRefs = [
    ...(validated.evidence?.sourceReference === undefined
      ? []
      : [validated.evidence.sourceReference]),
    ...(validated.evidence?.evidenceReference === undefined
      ? []
      : [validated.evidence.evidenceReference]),
  ];
  const dependencyRefs = [validated.identity.path, ...evidenceRefs];

  if (validated.unit !== "kWp") {
    return {
      value: validated,
      dependencyRefs,
      sourceRefs: evidenceRefs,
      issue: Object.freeze({
        code: "solarPanelCandidatesPreparation.dependency.unit.mismatch",
        message: "requiredPvPowerKwp dependency must use kWp",
        path: validated.identity.path,
      }),
    };
  }

  if (
    sectorId !== undefined &&
    (sectorId.trim().length === 0 ||
      validated.identity.path !==
        `energy.${sectorId}.solarSizing.requiredPvPowerKwp`)
  ) {
    return {
      value: validated,
      dependencyRefs,
      sourceRefs: evidenceRefs,
      issue: Object.freeze({
        code: "solarPanelCandidatesPreparation.dependency.path.mismatch",
        message: "requiredPvPowerKwp dependency is not sector-scoped correctly",
        path: validated.identity.path,
      }),
    };
  }

  if (
    validated.status === ValidationStatus.BLOCKED ||
    validated.status === ValidationStatus.INVALID ||
    validated.status === ValidationStatus.OBSOLETE
  ) {
    return {
      value: validated,
      dependencyRefs,
      sourceRefs: evidenceRefs,
      issue: Object.freeze({
        code: "solarPanelCandidatesPreparation.dependency.blocked",
        message: `requiredPvPowerKwp dependency has status ${validated.status}`,
        path: validated.identity.path,
      }),
    };
  }

  return {
    value: validated,
    dependencyRefs,
    sourceRefs: evidenceRefs,
  };
}

function createResult(
  status: SolarPanelCandidatesPreparationResult["status"],
  dependencies: SolarPanelCandidatesPreparationDependencies,
  dependencyRefs: readonly string[],
  sourceRefs: readonly string[],
  missingFields: readonly string[],
  issues: readonly SolarPanelCandidatesPreparationIssue[],
): Readonly<SolarPanelCandidatesPreparationResult> {
  return Object.freeze({
    status,
    dependencies: Object.freeze({
      ...dependencies,
      candidates: Object.freeze([...dependencies.candidates]),
      productIds: Object.freeze([...dependencies.productIds]),
      traceability: Object.freeze([...dependencies.traceability]),
    }),
    dependencyRefs: Object.freeze([...new Set(dependencyRefs)]),
    sourceRefs: Object.freeze([...new Set(sourceRefs)]),
    missingFields: Object.freeze([...new Set(missingFields)]),
    issues: Object.freeze([...issues]),
  });
}

function policyReferences(
  policy: Readonly<
    SolarPanelSelectionPolicyReference | SolarPanelCompatibilityPolicyReference
  >,
): { readonly dependencyRefs: readonly string[]; readonly sourceRefs: readonly string[] } {
  const evidenceRefs = [
    ...(policy.evidence?.sourceReference === undefined
      ? []
      : [policy.evidence.sourceReference]),
    ...(policy.evidence?.evidenceReference === undefined
      ? []
      : [policy.evidence.evidenceReference]),
  ];

  return {
    dependencyRefs: [policy.policyId, policy.policyVersion, ...evidenceRefs],
    sourceRefs: evidenceRefs,
  };
}

export function prepareSolarPanelCandidates(
  input: SolarPanelCandidatesPreparationInput,
): Readonly<SolarPanelCandidatesPreparationResult> {
  const explicitIssues = validateBlockingIssues(input.blockingIssues);
  const issues: SolarPanelCandidatesPreparationIssue[] = [...explicitIssues];
  const missingFields: string[] = [];
  const dependencyRefs: string[] = [];
  const sourceRefs: string[] = [];
  const dependencies: {
    sectorId?: string;
    catalog?: ProductCatalog;
    catalogVersion?: string;
    requiredPvPowerKwp?: Readonly<RequiredPvPowerKwp>;
    selectionPolicy?: Readonly<SolarPanelSelectionPolicyReference>;
    compatibilityPolicy?: Readonly<SolarPanelCompatibilityPolicyReference>;
    candidates: readonly TechnicalSolarPanelProduct[];
    productIds: readonly string[];
    traceability: readonly ProductCatalogTraceability[];
  } = {
    candidates: [],
    productIds: [],
    traceability: [],
  };

  if (input.sectorId !== undefined) {
    dependencies.sectorId = input.sectorId;
  }

  const requiredPower = validateRequiredPower(
    input.requiredPvPowerKwp,
    input.sectorId,
  );
  if (requiredPower.missingField !== undefined) {
    missingFields.push(requiredPower.missingField);
  }
  if (requiredPower.value !== undefined) {
    dependencies.requiredPvPowerKwp = requiredPower.value;
  }
  dependencyRefs.push(...requiredPower.dependencyRefs);
  sourceRefs.push(...requiredPower.sourceRefs);
  if (requiredPower.issue !== undefined) issues.push(requiredPower.issue);

  if (input.catalog === undefined) {
    missingFields.push("catalog");
  } else {
    dependencies.catalog = input.catalog;
    dependencies.catalogVersion = input.catalog.catalogVersion;
    dependencyRefs.push(input.catalog.catalogVersion);

    let candidateResult: SolarPanelCandidatesResult;
    try {
      candidateResult = input.catalog.findSolarPanelCandidates();
    } catch (error) {
      issues.push({
        code: "solarPanelCandidatesPreparation.candidates.invalid",
        message: error instanceof Error
          ? error.message
          : "solar panel candidates could not be prepared",
        path: "catalog.findSolarPanelCandidates",
      });
      candidateResult = {
        status: "PENDING",
        catalogVersion: input.catalog.catalogVersion,
        products: [],
        productIds: [],
        traceability: [],
        missingFields: ["solarPanels"],
      };
    }

    if (candidateResult.status === "VALIDATED") {
      dependencies.candidates = candidateResult.products;
      dependencies.productIds = candidateResult.productIds;
      dependencies.traceability = candidateResult.traceability;
      dependencyRefs.push(...candidateResult.productIds);
      sourceRefs.push(
        ...candidateResult.traceability.flatMap((item) => [
          item.technicalSource.documentReference,
          item.technicalSource.sourceUrl,
        ]),
      );
    } else {
      missingFields.push(...candidateResult.missingFields);
    }
  }

  let selectionPolicyPreparation: ReturnType<typeof prepareSolarPanelSelectionPolicy>;
  try {
    selectionPolicyPreparation = prepareSolarPanelSelectionPolicy({
      ...(input.selectionPolicy === undefined
        ? {}
        : { policy: input.selectionPolicy }),
    });
  } catch (error) {
    if (!(error instanceof SolarPanelSelectionPolicyContractError)) {
      throw error;
    }

    selectionPolicyPreparation = {
      status: "BLOCKED",
      dependencies: {},
      dependencyRefs: [],
      missingFields: [],
      issues: [
        {
          code: "solarPanelCandidatesPreparation.selectionPolicy.invalid",
          message: error.message,
          path: "selectionPolicy",
        },
      ],
    };
  }

  if (selectionPolicyPreparation.dependencies.policy !== undefined) {
    dependencies.selectionPolicy = selectionPolicyPreparation.dependencies.policy;
    const refs = policyReferences(dependencies.selectionPolicy);
    dependencyRefs.push(...refs.dependencyRefs);
    sourceRefs.push(...refs.sourceRefs);
  }
  if (selectionPolicyPreparation.missingFields.includes("policy")) {
    missingFields.push("selectionPolicy");
  }
  issues.push(
    ...selectionPolicyPreparation.issues as readonly SolarPanelCandidatesPreparationIssue[],
  );

  if (input.compatibilityPolicy !== undefined) {
    let compatibilityPolicyPreparation: ReturnType<typeof prepareSolarPanelCompatibilityPolicy>;
    try {
      compatibilityPolicyPreparation = prepareSolarPanelCompatibilityPolicy({
        ...(input.catalog === undefined ? {} : { catalog: input.catalog }),
        policy: input.compatibilityPolicy,
      });
    } catch (error) {
      if (!(error instanceof SolarPanelCompatibilityPolicyContractError)) {
        throw error;
      }

      compatibilityPolicyPreparation = {
        status: "BLOCKED",
        dependencies: {},
        dependencyRefs: [],
        missingFields: [],
        issues: [
          {
            code: "solarPanelCandidatesPreparation.compatibilityPolicy.invalid",
            message: error.message,
            path: "compatibilityPolicy",
          },
        ],
      };
    }

    if (compatibilityPolicyPreparation.dependencies.policy !== undefined) {
      dependencies.compatibilityPolicy = compatibilityPolicyPreparation.dependencies.policy;
      const refs = policyReferences(dependencies.compatibilityPolicy);
      dependencyRefs.push(...refs.dependencyRefs);
      sourceRefs.push(...refs.sourceRefs);
    }
    if (compatibilityPolicyPreparation.missingFields.includes("catalog")) {
      missingFields.push("catalog");
    }
    issues.push(
      ...compatibilityPolicyPreparation.issues as readonly SolarPanelCandidatesPreparationIssue[],
    );
  }

  return createResult(
    issues.length > 0 ? "BLOCKED" : "PENDING",
    dependencies,
    dependencyRefs,
    sourceRefs,
    missingFields,
    issues,
  );
}
