import type { ProductCatalog } from "./ProductCatalog.js";
import type { TechnicalValueEvidence } from "../shared/TechnicalValue.js";
import { Provenance } from "../shared/Provenance.js";
import { ValidationStatus } from "../shared/ValidationStatus.js";

export interface EmitterCompatibilityPolicyReference {
  readonly policyId: string;
  readonly policyVersion: string;
  readonly provenance: Provenance;
  readonly status: ValidationStatus;
  readonly evidence?: TechnicalValueEvidence;
}

export interface EmitterCompatibilityPolicyPreparationInput {
  readonly catalog?: ProductCatalog;
  readonly policy?: EmitterCompatibilityPolicyReference;
  readonly blockingIssues?: readonly EmitterCompatibilityPolicyIssue[];
}

export interface EmitterCompatibilityPolicyIssue {
  readonly code: string;
  readonly message: string;
  readonly path: string;
}

export interface EmitterCompatibilityPolicyDependencies {
  readonly catalog?: ProductCatalog;
  readonly catalogVersion?: string;
  readonly policy?: Readonly<EmitterCompatibilityPolicyReference>;
}

export interface EmitterCompatibilityPolicyPreparationResult {
  readonly status: "PENDING" | "BLOCKED";
  readonly dependencies: Readonly<EmitterCompatibilityPolicyDependencies>;
  readonly dependencyRefs: readonly string[];
  readonly missingFields: readonly string[];
  readonly issues: readonly EmitterCompatibilityPolicyIssue[];
}

export class EmitterCompatibilityPolicyContractError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "EmitterCompatibilityPolicyContractError";
  }
}

function validatePolicyEvidence(
  evidence: TechnicalValueEvidence | undefined,
): TechnicalValueEvidence | undefined {
  if (evidence === undefined) {
    return undefined;
  }

  const sourceReference = evidence.sourceReference;
  const evidenceReference = evidence.evidenceReference;
  const hasSource =
    sourceReference !== undefined &&
    typeof sourceReference === "string" &&
    sourceReference.trim().length > 0;
  const hasEvidence =
    evidenceReference !== undefined &&
    typeof evidenceReference === "string" &&
    evidenceReference.trim().length > 0;

  if (!hasSource && !hasEvidence) {
    throw new EmitterCompatibilityPolicyContractError(
      "policy evidence must contain a sourceReference or evidenceReference",
    );
  }

  if (
    (sourceReference !== undefined && !hasSource) ||
    (evidenceReference !== undefined && !hasEvidence)
  ) {
    throw new EmitterCompatibilityPolicyContractError(
      "policy evidence references must be non-empty strings",
    );
  }

  return Object.freeze({
    ...(hasSource ? { sourceReference } : {}),
    ...(hasEvidence ? { evidenceReference } : {}),
  });
}

function validatePolicy(
  policy: EmitterCompatibilityPolicyReference | undefined,
): Readonly<EmitterCompatibilityPolicyReference> | undefined {
  if (policy === undefined) {
    return undefined;
  }

  if (
    typeof policy.policyId !== "string" ||
    policy.policyId.trim().length === 0 ||
    typeof policy.policyVersion !== "string" ||
    policy.policyVersion.trim().length === 0
  ) {
    throw new EmitterCompatibilityPolicyContractError(
      "policyId and policyVersion are required",
    );
  }

  if (!Object.values(Provenance).includes(policy.provenance)) {
    throw new EmitterCompatibilityPolicyContractError(
      "policy provenance is invalid",
    );
  }

  if (!Object.values(ValidationStatus).includes(policy.status)) {
    throw new EmitterCompatibilityPolicyContractError(
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
  issues: readonly EmitterCompatibilityPolicyIssue[] | undefined,
): readonly EmitterCompatibilityPolicyIssue[] {
  if (issues === undefined) {
    return Object.freeze([]);
  }

  if (!Array.isArray(issues)) {
    throw new EmitterCompatibilityPolicyContractError(
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
      throw new EmitterCompatibilityPolicyContractError(
        "blockingIssues must contain code, message and path",
      );
    }
  }

  return Object.freeze(issues.map((issue) => Object.freeze({ ...issue })));
}

function policyStatusIssue(
  policy: Readonly<EmitterCompatibilityPolicyReference>,
): EmitterCompatibilityPolicyIssue | undefined {
  if (
    policy.status !== ValidationStatus.BLOCKED &&
    policy.status !== ValidationStatus.INVALID &&
    policy.status !== ValidationStatus.OBSOLETE
  ) {
    return undefined;
  }

  return Object.freeze({
    code: "emitterCompatibilityPolicy.policy.blocked",
    message: `policy has status ${policy.status}`,
    path: policy.policyId,
  });
}

function createResult(
  status: EmitterCompatibilityPolicyPreparationResult["status"],
  dependencies: EmitterCompatibilityPolicyDependencies,
  dependencyRefs: readonly string[],
  missingFields: readonly string[],
  issues: readonly EmitterCompatibilityPolicyIssue[],
): Readonly<EmitterCompatibilityPolicyPreparationResult> {
  return Object.freeze({
    status,
    dependencies: Object.freeze({ ...dependencies }),
    dependencyRefs: Object.freeze([...dependencyRefs]),
    missingFields: Object.freeze([...missingFields]),
    issues: Object.freeze([...issues]),
  });
}

export function prepareEmitterCompatibilityPolicy(
  input: EmitterCompatibilityPolicyPreparationInput,
): Readonly<EmitterCompatibilityPolicyPreparationResult> {
  const policy = validatePolicy(input.policy);
  const explicitIssues = validateBlockingIssues(input.blockingIssues);
  const issues: EmitterCompatibilityPolicyIssue[] = [...explicitIssues];
  const missingFields: string[] = [];
  const dependencies: {
    catalog?: ProductCatalog;
    catalogVersion?: string;
    policy?: Readonly<EmitterCompatibilityPolicyReference>;
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
    const issue = policyStatusIssue(policy);
    if (issue !== undefined) {
      issues.push(issue);
    }
  }

  return createResult(
    issues.length > 0 ? "BLOCKED" : "PENDING",
    dependencies,
    [],
    [...new Set(missingFields)],
    issues,
  );
}
