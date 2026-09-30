import type { ProductCatalog } from "./ProductCatalog.js";
import type { TechnicalValueEvidence } from "../shared/TechnicalValue.js";
import { Provenance } from "../shared/Provenance.js";
import { ValidationStatus } from "../shared/ValidationStatus.js";

export interface SolarPanelCompatibilityPolicyReference {
  readonly policyId: string;
  readonly policyVersion: string;
  readonly provenance: Provenance;
  readonly status: ValidationStatus;
  readonly evidence?: TechnicalValueEvidence;
}

export interface SolarPanelCompatibilityPolicyPreparationInput {
  readonly catalog?: ProductCatalog;
  readonly policy?: SolarPanelCompatibilityPolicyReference;
  readonly blockingIssues?: readonly SolarPanelCompatibilityPolicyIssue[];
}

export interface SolarPanelCompatibilityPolicyIssue {
  readonly code: string;
  readonly message: string;
  readonly path: string;
}

export interface SolarPanelCompatibilityPolicyDependencies {
  readonly catalog?: ProductCatalog;
  readonly catalogVersion?: string;
  readonly policy?: Readonly<SolarPanelCompatibilityPolicyReference>;
}

export interface SolarPanelCompatibilityPolicyPreparationResult {
  readonly status: "PENDING" | "BLOCKED";
  readonly dependencies: Readonly<SolarPanelCompatibilityPolicyDependencies>;
  readonly dependencyRefs: readonly string[];
  readonly missingFields: readonly string[];
  readonly issues: readonly SolarPanelCompatibilityPolicyIssue[];
}

export class SolarPanelCompatibilityPolicyContractError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "SolarPanelCompatibilityPolicyContractError";
  }
}

function validatePolicyEvidence(
  evidence: TechnicalValueEvidence | undefined,
): TechnicalValueEvidence | undefined {
  if (evidence === undefined) return undefined;

  const sourceReference = evidence.sourceReference;
  const evidenceReference = evidence.evidenceReference;
  const hasSource =
    typeof sourceReference === "string" && sourceReference.trim().length > 0;
  const hasEvidence =
    typeof evidenceReference === "string" && evidenceReference.trim().length > 0;

  if (!hasSource && !hasEvidence) {
    throw new SolarPanelCompatibilityPolicyContractError(
      "policy evidence must contain a sourceReference or evidenceReference",
    );
  }

  if (
    (sourceReference !== undefined && !hasSource) ||
    (evidenceReference !== undefined && !hasEvidence)
  ) {
    throw new SolarPanelCompatibilityPolicyContractError(
      "policy evidence references must be non-empty strings",
    );
  }

  return Object.freeze({
    ...(hasSource ? { sourceReference } : {}),
    ...(hasEvidence ? { evidenceReference } : {}),
  });
}

function validatePolicy(
  policy: SolarPanelCompatibilityPolicyReference | undefined,
): Readonly<SolarPanelCompatibilityPolicyReference> | undefined {
  if (policy === undefined) return undefined;

  if (
    typeof policy.policyId !== "string" ||
    policy.policyId.trim().length === 0 ||
    typeof policy.policyVersion !== "string" ||
    policy.policyVersion.trim().length === 0
  ) {
    throw new SolarPanelCompatibilityPolicyContractError(
      "policyId and policyVersion are required",
    );
  }

  if (!Object.values(Provenance).includes(policy.provenance)) {
    throw new SolarPanelCompatibilityPolicyContractError(
      "policy provenance is invalid",
    );
  }

  if (!Object.values(ValidationStatus).includes(policy.status)) {
    throw new SolarPanelCompatibilityPolicyContractError(
      "policy status is invalid",
    );
  }

  const evidence = validatePolicyEvidence(policy.evidence);
  return Object.freeze({
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
    provenance: policy.provenance,
    status: policy.status,
    ...(evidence === undefined ? {} : { evidence }),
  });
}

function validateBlockingIssues(
  issues: readonly SolarPanelCompatibilityPolicyIssue[] | undefined,
): readonly SolarPanelCompatibilityPolicyIssue[] {
  if (issues === undefined) return Object.freeze([]);
  if (!Array.isArray(issues)) {
    throw new SolarPanelCompatibilityPolicyContractError(
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
      throw new SolarPanelCompatibilityPolicyContractError(
        "blockingIssues must contain code, message and path",
      );
    }
  }

  return Object.freeze(issues.map((issue) => Object.freeze({ ...issue })));
}

function policyStatusIssue(
  policy: Readonly<SolarPanelCompatibilityPolicyReference>,
): SolarPanelCompatibilityPolicyIssue | undefined {
  if (
    policy.status !== ValidationStatus.BLOCKED &&
    policy.status !== ValidationStatus.INVALID &&
    policy.status !== ValidationStatus.OBSOLETE
  ) {
    return undefined;
  }

  return Object.freeze({
    code: "solarPanelCompatibilityPolicy.policy.blocked",
    message: `policy has status ${policy.status}`,
    path: policy.policyId,
  });
}

function createResult(
  status: SolarPanelCompatibilityPolicyPreparationResult["status"],
  dependencies: SolarPanelCompatibilityPolicyDependencies,
  dependencyRefs: readonly string[],
  missingFields: readonly string[],
  issues: readonly SolarPanelCompatibilityPolicyIssue[],
): Readonly<SolarPanelCompatibilityPolicyPreparationResult> {
  return Object.freeze({
    status,
    dependencies: Object.freeze({ ...dependencies }),
    dependencyRefs: Object.freeze([...dependencyRefs]),
    missingFields: Object.freeze([...missingFields]),
    issues: Object.freeze([...issues]),
  });
}

export function prepareSolarPanelCompatibilityPolicy(
  input: SolarPanelCompatibilityPolicyPreparationInput,
): Readonly<SolarPanelCompatibilityPolicyPreparationResult> {
  const policy = validatePolicy(input.policy);
  const explicitIssues = validateBlockingIssues(input.blockingIssues);
  const issues: SolarPanelCompatibilityPolicyIssue[] = [...explicitIssues];
  const missingFields: string[] = [];
  const dependencies: {
    catalog?: ProductCatalog;
    catalogVersion?: string;
    policy?: Readonly<SolarPanelCompatibilityPolicyReference>;
  } = {};

  if (input.catalog === undefined) {
    missingFields.push("catalog");
  } else {
    dependencies.catalog = input.catalog;
    dependencies.catalogVersion = input.catalog.catalogVersion;
  }

  if (policy === undefined) {
    missingFields.push("compatibilityPolicy");
  } else {
    dependencies.policy = policy;
    const statusIssue = policyStatusIssue(policy);
    if (statusIssue !== undefined) issues.push(statusIssue);
  }

  return createResult(
    issues.length > 0 ? "BLOCKED" : "PENDING",
    dependencies,
    [],
    [...new Set(missingFields)],
    issues,
  );
}