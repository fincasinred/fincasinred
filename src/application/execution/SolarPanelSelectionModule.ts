import {
  createIntermediateResult,
  findIntermediateResultByPath,
  type IntermediateResult,
} from "./IntermediateResult.js";
import {
  createModuleExecutionResult,
  createModuleExecutorInput,
  type ModuleExecutionResult,
  type ModuleExecutor,
  type ModuleExecutorInput,
} from "./ModuleExecutor.js";
import {
  selectSolarPanel,
  type SolarPanelSelectionResult,
} from "./SolarPanelSelection.js";
import type { SolarPanelCandidatesPreparationResult } from "./SolarPanelCandidatesPreparationContract.js";
import type {
  SolarPanelSelectionPolicyReference,
} from "../../domain/catalog/SolarPanelSelectionPolicyContract.js";
import { Provenance } from "../../domain/shared/Provenance.js";
import { ValidationStatus } from "../../domain/shared/ValidationStatus.js";
import type { IdentifiedTechnicalValue } from "../../domain/shared/TechnicalValue.js";
import type { ValidationIssue } from "../validation/ValidationResult.js";

export const SOLAR_PANEL_SELECTION_MODULE_REF =
  "module.energy.solar-panel-selection:";
export const SOLAR_PANEL_SELECTION_METHOD_REF = "energy.select_solar_panel";
export const SOLAR_PANEL_CANDIDATES_PATH_SUFFIX = "solarPanelCandidates";
export const SOLAR_PANEL_SELECTION_POLICY_PATH_SUFFIX =
  "solarPanelSelectionPolicy";
export const SOLAR_PANEL_PRODUCT_PATH_SUFFIX = "solarPanelProduct";

export interface SolarPanelCandidatesDependencyPayload {
  readonly preparedCandidates: SolarPanelCandidatesPreparationResult;
}

export interface SolarPanelSelectionPolicyDependencyPayload {
  readonly selectionPolicy: SolarPanelSelectionPolicyReference;
}

export interface SolarPanelProductIntermediatePayload {
  readonly product: SolarPanelSelectionResult["selected"] extends infer Selected
    ? Selected extends { product: infer Product } ? Product : never
    : never;
  readonly productId: string;
  readonly nominalPowerWp: number;
  readonly technicalSource: Readonly<{
    readonly sourceName: string;
    readonly documentReference: string;
    readonly sourceUrl: string;
    readonly version: string;
    readonly checkedAt: string;
  }>;
  readonly catalogVersion: string;
  readonly sourceRefs: readonly string[];
  readonly dependencyRefs: readonly string[];
}

export function solarPanelSelectionModuleRef(sectorId: string): string {
  return `${SOLAR_PANEL_SELECTION_MODULE_REF}${sectorId}`;
}

export function requiredPvPowerPath(sectorId: string): string {
  return `energy.${sectorId}.solarSizing.requiredPvPowerKwp`;
}

export function solarPanelCandidatesPath(sectorId: string): string {
  return `energy.${sectorId}.${SOLAR_PANEL_CANDIDATES_PATH_SUFFIX}`;
}

export function solarPanelSelectionPolicyPath(sectorId: string): string {
  return `energy.${sectorId}.${SOLAR_PANEL_SELECTION_POLICY_PATH_SUFFIX}`;
}

export function solarPanelProductPath(sectorId: string): string {
  return `energy.${sectorId}.${SOLAR_PANEL_PRODUCT_PATH_SUFFIX}`;
}

export class SolarPanelSelectionModuleTechnicalError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "SolarPanelSelectionModuleTechnicalError";
  }
}

function issue(
  code: string,
  message: string,
  path: string,
): Readonly<ValidationIssue> {
  return Object.freeze({ code, message, path });
}

function sectorIdFromModuleRef(moduleRef: string): string {
  if (!moduleRef.startsWith(SOLAR_PANEL_SELECTION_MODULE_REF)) {
    throw new SolarPanelSelectionModuleTechnicalError(
      `moduleRef must start with ${SOLAR_PANEL_SELECTION_MODULE_REF}`,
    );
  }

  const sectorId = moduleRef.slice(SOLAR_PANEL_SELECTION_MODULE_REF.length);
  if (sectorId.trim().length === 0 || sectorId.includes(".")) {
    throw new SolarPanelSelectionModuleTechnicalError(
      "moduleRef must include one valid sectorId",
    );
  }

  return sectorId;
}

function dependencyIsUnusable(result: Readonly<IntermediateResult>): boolean {
  const candidates = result.payload?.solarPanelCandidates;
  if (candidates !== undefined) {
    return (
      candidates.status === "BLOCKED" ||
      candidates.missingFields.length > 0 ||
      candidates.issues.length > 0
    );
  }

  return (
    result.value.status === ValidationStatus.PENDING ||
    result.value.status === ValidationStatus.BLOCKED ||
    result.value.status === ValidationStatus.INVALID ||
    result.value.status === ValidationStatus.OBSOLETE
  );
}

function sourceRefsFor(
  snapshotRefs: readonly string[],
  dependencies: readonly IntermediateResult[],
  extraRefs: readonly string[] = [],
): readonly string[] {
  const refs = new Set(snapshotRefs);
  for (const dependency of dependencies) {
    const evidence = dependency.value.evidence;
    if (evidence?.sourceReference !== undefined) refs.add(evidence.sourceReference);
    if (evidence?.evidenceReference !== undefined) refs.add(evidence.evidenceReference);
    const selectionPolicy = dependency.payload?.solarPanelSelectionPolicy;
    if (selectionPolicy !== undefined) {
      refs.add(selectionPolicy.policyId);
      refs.add(selectionPolicy.policyVersion);
      if (selectionPolicy.evidence?.sourceReference !== undefined) {
        refs.add(selectionPolicy.evidence.sourceReference);
      }
      if (selectionPolicy.evidence?.evidenceReference !== undefined) {
        refs.add(selectionPolicy.evidence.evidenceReference);
      }
    }
  }
  for (const ref of extraRefs) refs.add(ref);
  return Object.freeze([...refs]);
}

function dependencyRefsFor(
  dependencies: readonly IntermediateResult[],
  extraRefs: readonly string[] = [],
): readonly string[] {
  const refs = new Set<string>();
  for (const dependency of dependencies) {
    refs.add(dependency.value.identity.path);
    for (const ref of dependency.dependencyRefs ?? []) refs.add(ref);
  }
  for (const ref of extraRefs) refs.add(ref);
  return Object.freeze([...refs]);
}

function dependencyIssue(
  path: string,
  status?: ValidationStatus,
): Readonly<ValidationIssue> {
  return issue(
    "solarPanelSelectionModule.dependency.unusable",
    status === undefined
      ? "required selection dependency result is missing"
      : `selection dependency result has status ${status}`,
    path,
  );
}

function selectionIssues(
  result: Readonly<SolarPanelSelectionResult>,
): readonly ValidationIssue[] {
  return result.issues.map((selectionIssue) => issue(
    selectionIssue.code,
    selectionIssue.message,
    selectionIssue.path,
  ));
}

function selectedProductValue(
  result: Readonly<SolarPanelSelectionResult>,
  sectorId: string,
  executionId: string,
  dependencies: readonly IntermediateResult[],
  snapshotSourceRefs: readonly string[],
): Readonly<IntermediateResult> {
  const selected = result.selected;
  if (selected === undefined) {
    throw new SolarPanelSelectionModuleTechnicalError(
      "selected solar panel result is missing",
    );
  }

  const sourceRefs = sourceRefsFor(
    snapshotSourceRefs,
    dependencies,
    [
      ...selected.sourceRefs,
      ...dependencies.flatMap(
        (dependency) => dependency.payload?.solarPanelCandidates?.sourceRefs ?? [],
      ),
    ],
  );
  const dependencyRefs = dependencyRefsFor(
    dependencies,
    [...result.dependencyRefs, ...selected.dependencyRefs],
  );
  const value = {
    value: selected.nominalPowerWp,
    unit: "Wp",
    provenance: Provenance.AUTOMATIC,
    status: selected.product.technicalStatus,
    evidence: {
      sourceReference: selected.technicalSource.documentReference,
      evidenceReference: selected.technicalSource.sourceUrl,
    },
    identity: {
      domain: "energy",
      field: "solarPanelProduct",
      path: solarPanelProductPath(sectorId),
    },
    product: selected.product,
    productId: selected.productId,
    nominalPowerWp: selected.nominalPowerWp,
    technicalSource: selected.technicalSource,
    catalogVersion: selected.catalogVersion,
    sourceRefs,
    dependencyRefs,
  } as unknown as IdentifiedTechnicalValue;

  return createIntermediateResult({
    executionId,
    methodRef: SOLAR_PANEL_SELECTION_METHOD_REF,
    dependencyRefs,
    value,
  });
}

export function createSolarPanelSelectionModuleExecutor(): Readonly<ModuleExecutor> {
  return Object.freeze({
    async execute(
      input: Readonly<ModuleExecutorInput>,
    ): Promise<Readonly<ModuleExecutionResult>> {
      const validatedInput = createModuleExecutorInput(input);
      const sectorId = sectorIdFromModuleRef(validatedInput.moduleRef);
      const requiredPath = requiredPvPowerPath(sectorId);
      const candidatesPath = solarPanelCandidatesPath(sectorId);
      const policyPath = solarPanelSelectionPolicyPath(sectorId);
      const dependencies = [
        findIntermediateResultByPath(validatedInput.dependencyResults, requiredPath),
        findIntermediateResultByPath(validatedInput.dependencyResults, candidatesPath),
        findIntermediateResultByPath(validatedInput.dependencyResults, policyPath),
      ];
      const dependencyPaths = [requiredPath, candidatesPath, policyPath];
      const missing = dependencies.flatMap((dependency, index) =>
        dependency === undefined ? [dependencyPaths[index] as string] : [],
      );

      if (missing.length > 0) {
        return createModuleExecutionResult(
          {
            status: "BLOCKED",
            blockingIssues: missing.map((path) => dependencyIssue(path)),
          },
          validatedInput.executionSnapshot,
        );
      }

      const resolvedDependencies = dependencies as [
        Readonly<IntermediateResult>,
        Readonly<IntermediateResult>,
        Readonly<IntermediateResult>,
      ];
      const unusable = resolvedDependencies.filter(dependencyIsUnusable);
      if (unusable.length > 0) {
        return createModuleExecutionResult(
          {
            status: "BLOCKED",
            blockingIssues: unusable.map((dependency) =>
              dependencyIssue(dependency.value.identity.path, dependency.value.status),
            ),
          },
          validatedInput.executionSnapshot,
        );
      }

      try {
        const requiredPvPowerKwp = resolvedDependencies[0].value as never;
        const preparedCandidates =
          resolvedDependencies[1].payload?.solarPanelCandidates;
        const selectionPolicy =
          resolvedDependencies[2].payload?.solarPanelSelectionPolicy;

        if (preparedCandidates === undefined || selectionPolicy === undefined) {
          return createModuleExecutionResult(
            {
              status: "BLOCKED",
              blockingIssues: [
                dependencyIssue(candidatesPath),
                dependencyIssue(policyPath),
              ],
            },
            validatedInput.executionSnapshot,
          );
        }

        const selection = selectSolarPanel({
          sectorId,
          requiredPvPowerKwp,
          candidates: preparedCandidates,
          selectionPolicy,
        });

        if (selection.status === "PENDING") {
          return createModuleExecutionResult(
            {
              status: "BLOCKED",
              blockingIssues: selection.missingFields.map((field) =>
                issue(
                  "solarPanelSelectionModule.selection.pending",
                  `${field} selection dependency is pending`,
                  field.includes(".") ? field : `energy.${sectorId}.${field}`,
                ),
              ),
            },
            validatedInput.executionSnapshot,
          );
        }

        if (selection.status === "BLOCKED") {
          return createModuleExecutionResult(
            {
              status: "BLOCKED",
              blockingIssues: selectionIssues(selection),
            },
            validatedInput.executionSnapshot,
          );
        }

        return createModuleExecutionResult(
          {
            status: "COMPLETED",
            intermediateResults: [
              selectedProductValue(
                selection,
                sectorId,
                validatedInput.executionSnapshot.identity.executionId,
                resolvedDependencies,
                validatedInput.executionSnapshot.sourceRefs,
              ),
            ],
          },
          validatedInput.executionSnapshot,
        );
      } catch (error) {
        return createModuleExecutionResult(
          {
            status: "FAILED",
            errorMessage: error instanceof Error
              ? error.message
              : "Solar panel selection module execution failed",
          },
          validatedInput.executionSnapshot,
        );
      }
    },
  });
}
