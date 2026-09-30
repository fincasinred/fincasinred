import type {
  ProductCatalogTraceability,
} from "../../domain/catalog/ProductCatalog.js";
import type {
  TechnicalSolarPanelProduct,
} from "../../domain/catalog/TechnicalProduct.js";
import type {
  ExactProductIdSelectionCriterion,
  SolarPanelSelectionPolicyReference,
} from "../../domain/catalog/SolarPanelSelectionPolicyContract.js";
import {
  Provenance,
} from "../../domain/shared/Provenance.js";
import {
  createIdentifiedTechnicalValue,
  type IdentifiedTechnicalValue,
} from "../../domain/shared/TechnicalValue.js";
import { ValidationStatus } from "../../domain/shared/ValidationStatus.js";
import type {
  SolarPanelCandidatesPreparationResult,
} from "./SolarPanelCandidatesPreparationContract.js";

export type RequiredPvPowerKwp = IdentifiedTechnicalValue<"kWp">;

export interface SolarPanelSelectionInput {
  readonly sectorId?: string;
  readonly requiredPvPowerKwp?: RequiredPvPowerKwp;
  readonly candidates?: SolarPanelCandidatesPreparationResult;
  readonly selectionPolicy?: SolarPanelSelectionPolicyReference;
}

export interface SolarPanelSelectionIssue {
  readonly code: string;
  readonly message: string;
  readonly path: string;
}

export interface SolarPanelSelectionDependencies {
  readonly sectorId?: string;
  readonly requiredPvPowerKwp?: Readonly<RequiredPvPowerKwp>;
  readonly selectionPolicy?: Readonly<SolarPanelSelectionPolicyReference>;
  readonly candidates: readonly TechnicalSolarPanelProduct[];
  readonly productIds: readonly string[];
  readonly traceability: readonly ProductCatalogTraceability[];
  readonly catalogVersion?: string;
}

export interface SolarPanelSelectedResult {
  readonly product: Readonly<TechnicalSolarPanelProduct>;
  readonly productId: string;
  readonly nominalPowerWp: number;
  readonly technicalSource: Readonly<TechnicalSolarPanelProduct["technicalSource"]>;
  readonly catalogVersion: string;
  readonly dependencyRefs: readonly string[];
  readonly sourceRefs: readonly string[];
}

export interface SolarPanelSelectionResult {
  readonly status: "SELECTED" | "PENDING" | "BLOCKED";
  readonly selected?: Readonly<SolarPanelSelectedResult>;
  readonly dependencies: Readonly<SolarPanelSelectionDependencies>;
  readonly dependencyRefs: readonly string[];
  readonly sourceRefs: readonly string[];
  readonly missingFields: readonly string[];
  readonly issues: readonly SolarPanelSelectionIssue[];
}

function issue(
  code: string,
  message: string,
  path: string,
): SolarPanelSelectionIssue {
  return Object.freeze({ code, message, path });
}

function referencesForPolicy(
  policy: SolarPanelSelectionPolicyReference,
): readonly string[] {
  return [
    policy.policyId,
    policy.policyVersion,
    ...(policy.evidence?.sourceReference === undefined
      ? []
      : [policy.evidence.sourceReference]),
    ...(policy.evidence?.evidenceReference === undefined
      ? []
      : [policy.evidence.evidenceReference]),
  ];
}

function validateRequiredPower(
  value: RequiredPvPowerKwp | undefined,
  sectorId: string | undefined,
  issues: SolarPanelSelectionIssue[],
  missingFields: string[],
  dependencyRefs: string[],
): Readonly<RequiredPvPowerKwp> | undefined {
  if (value === undefined) {
    missingFields.push("requiredPvPowerKwp");
    return undefined;
  }

  let validated: Readonly<RequiredPvPowerKwp>;
  try {
    validated = createIdentifiedTechnicalValue(value);
  } catch (error) {
    issues.push(issue(
      "solarPanelSelection.dependency.invalid",
      error instanceof Error ? error.message : "requiredPvPowerKwp is invalid",
      "requiredPvPowerKwp",
    ));
    return undefined;
  }

  dependencyRefs.push(
    validated.identity.path,
    ...(validated.evidence?.sourceReference === undefined
      ? []
      : [validated.evidence.sourceReference]),
    ...(validated.evidence?.evidenceReference === undefined
      ? []
      : [validated.evidence.evidenceReference]),
  );

  if (validated.unit !== "kWp") {
    issues.push(issue(
      "solarPanelSelection.dependency.unit.mismatch",
      "requiredPvPowerKwp must use kWp",
      validated.identity.path,
    ));
  }

  if (
    sectorId === undefined ||
    sectorId.trim().length === 0 ||
    validated.identity.path !==
      `energy.${sectorId}.solarSizing.requiredPvPowerKwp`
  ) {
    issues.push(issue(
      "solarPanelSelection.dependency.path.mismatch",
      "requiredPvPowerKwp is not sector-scoped correctly",
      validated.identity.path,
    ));
  }

  if (
    validated.status === ValidationStatus.BLOCKED ||
    validated.status === ValidationStatus.INVALID ||
    validated.status === ValidationStatus.OBSOLETE
  ) {
    issues.push(issue(
      "solarPanelSelection.dependency.blocked",
      `requiredPvPowerKwp has status ${validated.status}`,
      validated.identity.path,
    ));
  }

  return validated;
}

function validatePolicy(
  policy: SolarPanelSelectionPolicyReference | undefined,
  issues: SolarPanelSelectionIssue[],
  missingFields: string[],
  dependencyRefs: string[],
): Readonly<SolarPanelSelectionPolicyReference> | undefined {
  if (policy === undefined) {
    missingFields.push("selectionPolicy");
    return undefined;
  }

  dependencyRefs.push(...referencesForPolicy(policy));

  if (
    typeof policy.policyId !== "string" ||
    policy.policyId.trim().length === 0 ||
    typeof policy.policyVersion !== "string" ||
    policy.policyVersion.trim().length === 0 ||
    !Object.values(Provenance).includes(policy.provenance) ||
    !Object.values(ValidationStatus).includes(policy.status)
  ) {
    issues.push(issue(
      "solarPanelSelection.policy.invalid",
      "selectionPolicy metadata is invalid",
      "selectionPolicy",
    ));
    return undefined;
  }

  if (
    policy.status === ValidationStatus.BLOCKED ||
    policy.status === ValidationStatus.INVALID ||
    policy.status === ValidationStatus.OBSOLETE
  ) {
    issues.push(issue(
      "solarPanelSelection.policy.blocked",
      `selectionPolicy has status ${policy.status}`,
      "selectionPolicy",
    ));
  }

  if (!Array.isArray(policy.selectionCriteria)) {
    issues.push(issue(
      "solarPanelSelection.policy.criteria.invalid",
      "selectionPolicy.selectionCriteria must be an array",
      "selectionPolicy.selectionCriteria",
    ));
    return Object.freeze({ ...policy });
  }

  if (policy.selectionCriteria.length === 0) {
    missingFields.push("selectionPolicy.selectionCriteria");
    return Object.freeze({ ...policy });
  }

  if (policy.selectionCriteria.length !== 1) {
    issues.push(issue(
      "solarPanelSelection.policy.criteria.ambiguous",
      "selectionPolicy must define exactly one deterministic criterion",
      "selectionPolicy.selectionCriteria",
    ));
    return Object.freeze({ ...policy });
  }

  const criterion = policy.selectionCriteria[0] as Partial<ExactProductIdSelectionCriterion>;
  if (
    criterion.type !== "EXACT_PRODUCT_ID" ||
    typeof criterion.productId !== "string" ||
    criterion.productId.trim().length === 0
  ) {
    issues.push(issue(
      "solarPanelSelection.policy.criteria.unsupported",
      "selectionPolicy must explicitly identify one productId",
      "selectionPolicy.selectionCriteria[0]",
    ));
  }

  return Object.freeze({ ...policy });
}

function validatePreparedCandidates(
  prepared: SolarPanelCandidatesPreparationResult | undefined,
  issues: SolarPanelSelectionIssue[],
  missingFields: string[],
  dependencyRefs: string[],
  sourceRefs: string[],
): Readonly<SolarPanelSelectionDependencies> {
  const dependencies: {
    candidates: readonly TechnicalSolarPanelProduct[];
    productIds: readonly string[];
    traceability: readonly ProductCatalogTraceability[];
    catalogVersion?: string;
  } = {
    candidates: [],
    productIds: [],
    traceability: [],
  };

  if (prepared === undefined) {
    missingFields.push("candidates");
    return dependencies;
  }

  dependencyRefs.push(...prepared.dependencyRefs);
  sourceRefs.push(...prepared.sourceRefs);
  issues.push(...prepared.issues);

  if (prepared.status === "BLOCKED") {
    issues.push(issue(
      "solarPanelSelection.candidates.blocked",
      "prepared solar panel candidates are blocked",
      "candidates",
    ));
  }

  if (prepared.dependencies.catalogVersion !== undefined) {
    dependencies.catalogVersion = prepared.dependencies.catalogVersion;
    dependencyRefs.push(prepared.dependencies.catalogVersion);
  }

  dependencies.candidates = prepared.dependencies.candidates;
  dependencies.productIds = prepared.dependencies.productIds;
  dependencies.traceability = prepared.dependencies.traceability;

  if (prepared.dependencies.candidates.length === 0) {
    missingFields.push("candidates");
    return dependencies;
  }

  const productIds = new Set<string>();
  for (const [index, candidate] of prepared.dependencies.candidates.entries()) {
    if (candidate.category !== "SOLAR_PANEL") {
      issues.push(issue(
        "solarPanelSelection.candidate.category.mismatch",
        "candidate must be SOLAR_PANEL",
        `candidates[${index}].category`,
      ));
    }
    if (
      candidate.technicalStatus === ValidationStatus.BLOCKED ||
      candidate.technicalStatus === ValidationStatus.INVALID ||
      candidate.technicalStatus === ValidationStatus.OBSOLETE
    ) {
      issues.push(issue(
        "solarPanelSelection.candidate.blocked",
        `candidate has status ${candidate.technicalStatus}`,
        `candidates[${index}].technicalStatus`,
      ));
    }
    if (
      !Number.isFinite(candidate.technicalSpecification.nominalPowerWp) ||
      candidate.technicalSpecification.nominalPowerWp <= 0
    ) {
      issues.push(issue(
        "solarPanelSelection.candidate.nominalPower.invalid",
        "candidate nominalPowerWp must be finite and positive",
        `candidates[${index}].technicalSpecification.nominalPowerWp`,
      ));
    }
    if (
      candidate.technicalSource.documentReference.trim().length === 0 ||
      candidate.technicalSource.sourceUrl.trim().length === 0
    ) {
      issues.push(issue(
        "solarPanelSelection.candidate.technicalSource.invalid",
        "candidate technicalSource must contain documentReference and sourceUrl",
        `candidates[${index}].technicalSource`,
      ));
    }
    if (productIds.has(candidate.productId)) {
      issues.push(issue(
        "solarPanelSelection.candidate.duplicate",
        `candidate productId is duplicated: ${candidate.productId}`,
        `candidates[${index}].productId`,
      ));
    }
    productIds.add(candidate.productId);

    if (!prepared.dependencies.productIds.includes(candidate.productId)) {
      issues.push(issue(
        "solarPanelSelection.candidate.productId.missing",
        "candidate productId is not preserved by prepared dependencies",
        `candidates[${index}].productId`,
      ));
    }

    const trace = prepared.dependencies.traceability.find(
      (item) => item.productId === candidate.productId,
    );
    if (trace === undefined || trace.technicalSource !== candidate.technicalSource) {
      issues.push(issue(
        "solarPanelSelection.candidate.traceability.mismatch",
        "candidate technicalSource is not preserved in traceability",
        `candidates[${index}].technicalSource`,
      ));
    }
  }

  if (dependencies.catalogVersion === undefined) {
    missingFields.push("catalogVersion");
  }

  return dependencies;
}

export function selectSolarPanel(
  input: SolarPanelSelectionInput,
): Readonly<SolarPanelSelectionResult> {
  const issues: SolarPanelSelectionIssue[] = [];
  const missingFields: string[] = [];
  const dependencyRefs: string[] = [];
  const sourceRefs: string[] = [];
  const requiredPvPowerKwp = validateRequiredPower(
    input.requiredPvPowerKwp,
    input.sectorId,
    issues,
    missingFields,
    dependencyRefs,
  );
  const policy = validatePolicy(
    input.selectionPolicy,
    issues,
    missingFields,
    dependencyRefs,
  );
  const preparedDependencies = validatePreparedCandidates(
    input.candidates,
    issues,
    missingFields,
    dependencyRefs,
    sourceRefs,
  );

  const dependencies: SolarPanelSelectionDependencies = {
    ...(input.sectorId === undefined ? {} : { sectorId: input.sectorId }),
    ...(requiredPvPowerKwp === undefined ? {} : { requiredPvPowerKwp }),
    ...(policy === undefined ? {} : { selectionPolicy: policy }),
    ...preparedDependencies,
  };

  const baseResult = {
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
  };
  const catalogVersion = dependencies.catalogVersion;

  if (
    issues.length > 0 ||
    missingFields.length > 0 ||
    policy === undefined ||
    catalogVersion === undefined
  ) {
    return Object.freeze({
      status: issues.length > 0 ? "BLOCKED" : "PENDING",
      ...baseResult,
    });
  }

  const criterion = policy.selectionCriteria[0];
  if (criterion === undefined || criterion.type !== "EXACT_PRODUCT_ID") {
    return Object.freeze({ status: "PENDING", ...baseResult });
  }

  const selectedCandidates = dependencies.candidates.filter(
    (candidate) => candidate.productId === criterion.productId,
  );
  if (selectedCandidates.length !== 1) {
    return Object.freeze({
      status: "BLOCKED",
      ...baseResult,
      issues: Object.freeze([
        ...issues,
        issue(
          selectedCandidates.length === 0
            ? "solarPanelSelection.policy.product.notFound"
            : "solarPanelSelection.policy.product.ambiguous",
          "selectionPolicy does not identify exactly one prepared candidate",
          "selectionPolicy.selectionCriteria[0].productId",
        ),
      ]),
    });
  }

  const selected = selectedCandidates[0];
  if (selected === undefined || catalogVersion === undefined) {
    return Object.freeze({
      status: "BLOCKED",
      ...baseResult,
      issues: Object.freeze([
        ...issues,
        issue(
          "solarPanelSelection.selected.invalid",
          "selected candidate dependencies are incomplete",
          "selected",
        ),
      ]),
    });
  }
  const selectedResult: SolarPanelSelectedResult = {
    product: selected,
    productId: selected.productId,
    nominalPowerWp: selected.technicalSpecification.nominalPowerWp,
    technicalSource: selected.technicalSource,
    catalogVersion,
    dependencyRefs: baseResult.dependencyRefs,
    sourceRefs: baseResult.sourceRefs,
  };

  return Object.freeze({
    status: "SELECTED",
    selected: Object.freeze(selectedResult),
    ...baseResult,
  });
}
