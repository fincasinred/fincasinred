import type { TechnicalValueEvidence } from "../shared/TechnicalValue.js";
import { Provenance } from "../shared/Provenance.js";
import { ValidationStatus } from "../shared/ValidationStatus.js";

export interface ExactProductIdSelectionCriterion {
  readonly type: "EXACT_PRODUCT_ID";
  readonly productId: string;
}

export type SolarPanelSelectionCriteria =
  | readonly []
  | readonly [ExactProductIdSelectionCriterion];

export interface SolarPanelSelectionPolicyReference {
  readonly policyId: string;
  readonly policyVersion: string;
  readonly provenance: Provenance;
  readonly status: ValidationStatus;
  readonly evidence?: TechnicalValueEvidence;
  readonly selectionCriteria: SolarPanelSelectionCriteria;
}

export interface SolarPanelSelectionPolicyPreparationInput {
  readonly policy?: SolarPanelSelectionPolicyReference;
  readonly blockingIssues?: readonly SolarPanelSelectionPolicyIssue[];
}

export interface SolarPanelSelectionPolicyIssue {
  readonly code: string;
  readonly message: string;
  readonly path: string;
}

export interface SolarPanelSelectionPolicyDependencies {
  readonly policy?: Readonly<SolarPanelSelectionPolicyReference>;
}

export interface SolarPanelSelectionPolicyPreparationResult {
  readonly status: "PENDING" | "BLOCKED";
  readonly dependencies: Readonly<SolarPanelSelectionPolicyDependencies>;
  readonly dependencyRefs: readonly string[];
  readonly missingFields: readonly string[];
  readonly issues: readonly SolarPanelSelectionPolicyIssue[];
}

export class SolarPanelSelectionPolicyContractError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "SolarPanelSelectionPolicyContractError";
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
    throw new SolarPanelSelectionPolicyContractError(
      "policy evidence must contain a sourceReference or evidenceReference",
    );
  }

  if (
    (sourceReference !== undefined && !hasSource) ||
    (evidenceReference !== undefined && !hasEvidence)
  ) {
    throw new SolarPanelSelectionPolicyContractError(
      "policy evidence references must be non-empty strings",
    );
  }

  return Object.freeze({
    ...(hasSource ? { sourceReference } : {}),
    ...(hasEvidence ? { evidenceReference } : {}),
  });
}

function validatePolicy(
  policy: SolarPanelSelectionPolicyReference | undefined,
): Readonly<SolarPanelSelectionPolicyReference> | undefined {
  if (policy === undefined) return undefined;

  if (
    typeof policy.policyId !== "string" ||
    policy.policyId.trim().length === 0 ||
    typeof policy.policyVersion !== "string" ||
    policy.policyVersion.trim().length === 0
  ) {
    throw new SolarPanelSelectionPolicyContractError(
      "policyId and policyVersion are required",
    );
  }

  if (!Object.values(Provenance).includes(policy.provenance)) {
    throw new SolarPanelSelectionPolicyContractError(
      "policy provenance is invalid",
    );
  }

  if (!Object.values(ValidationStatus).includes(policy.status)) {
    throw new SolarPanelSelectionPolicyContractError(
      "policy status is invalid",
    );
  }

  if (!Array.isArray(policy.selectionCriteria)) {
    throw new SolarPanelSelectionPolicyContractError(
      "selectionCriteria must be an array",
    );
  }

  if (policy.selectionCriteria.length === 0) {
    const evidence = validatePolicyEvidence(policy.evidence);
    return Object.freeze({
      policyId: policy.policyId,
      policyVersion: policy.policyVersion,
      provenance: policy.provenance,
      status: policy.status,
      selectionCriteria: Object.freeze([]) as SolarPanelSelectionCriteria,
      ...(evidence === undefined ? {} : { evidence }),
    });
  }

  if (policy.selectionCriteria.length !== 1) {
    throw new SolarPanelSelectionPolicyContractError(
      "selectionCriteria must contain exactly one criterion",
    );
  }

  const criterion = policy.selectionCriteria[0];
  if (
    criterion === undefined ||
    criterion.type !== "EXACT_PRODUCT_ID" ||
    typeof criterion.productId !== "string" ||
    criterion.productId.trim().length === 0
  ) {
    throw new SolarPanelSelectionPolicyContractError(
      "selectionCriteria must contain a valid EXACT_PRODUCT_ID criterion",
    );
  }

  const evidence = validatePolicyEvidence(policy.evidence);
  return Object.freeze({
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
    provenance: policy.provenance,
    status: policy.status,
    selectionCriteria: Object.freeze([
      Object.freeze({
        type: criterion.type,
        productId: criterion.productId,
      }),
    ]) as SolarPanelSelectionCriteria,
    ...(evidence === undefined ? {} : { evidence }),
  });
}

function validateBlockingIssues(
  issues: readonly SolarPanelSelectionPolicyIssue[] | undefined,
): readonly SolarPanelSelectionPolicyIssue[] {
  if (issues === undefined) return Object.freeze([]);
  if (!Array.isArray(issues)) {
    throw new SolarPanelSelectionPolicyContractError(
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
      throw new SolarPanelSelectionPolicyContractError(
        "blockingIssues must contain code, message and path",
      );
    }
  }

  return Object.freeze(issues.map((issue) => Object.freeze({ ...issue })));
}

function policyStatusIssue(
  policy: Readonly<SolarPanelSelectionPolicyReference>,
): SolarPanelSelectionPolicyIssue | undefined {
  if (
    policy.status !== ValidationStatus.BLOCKED &&
    policy.status !== ValidationStatus.INVALID &&
    policy.status !== ValidationStatus.OBSOLETE
  ) {
    return undefined;
  }

  return Object.freeze({
    code: "solarPanelSelectionPolicy.policy.blocked",
    message: `policy has status ${policy.status}`,
    path: policy.policyId,
  });
}

function createResult(
  status: SolarPanelSelectionPolicyPreparationResult["status"],
  dependencies: SolarPanelSelectionPolicyDependencies,
  dependencyRefs: readonly string[],
  missingFields: readonly string[],
  issues: readonly SolarPanelSelectionPolicyIssue[],
): Readonly<SolarPanelSelectionPolicyPreparationResult> {
  return Object.freeze({
    status,
    dependencies: Object.freeze({ ...dependencies }),
    dependencyRefs: Object.freeze([...dependencyRefs]),
    missingFields: Object.freeze([...missingFields]),
    issues: Object.freeze([...issues]),
  });
}

export function prepareSolarPanelSelectionPolicy(
  input: SolarPanelSelectionPolicyPreparationInput,
): Readonly<SolarPanelSelectionPolicyPreparationResult> {
  const policy = validatePolicy(input.policy);
  const explicitIssues = validateBlockingIssues(input.blockingIssues);
  const issues: SolarPanelSelectionPolicyIssue[] = [...explicitIssues];
  const missingFields: string[] = [];
  const dependencies: {
    policy?: Readonly<SolarPanelSelectionPolicyReference>;
  } = {};

  if (policy === undefined) {
    missingFields.push("policy");
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
