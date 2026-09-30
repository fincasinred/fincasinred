import {
  batteryNominalCapacityRequiredPath,
  batteryUsableEnergyRequiredPath,
  createBatterySizingResult,
  type BatterySizingResultIssue,
  type BatterySizingResultEnergy,
} from "./BatterySizingResultContract.js";
import { batteryEnergyDemandPath } from "./BatterySizingPreparationContract.js";
import {
  composeBatterySizingInputs,
} from "./BatterySizingCompositionContract.js";
import {
  createIntermediateResult,
  type IntermediateResult,
} from "./IntermediateResult.js";
import {
  createModuleExecutionResult,
  createModuleExecutorInput,
  type ModuleExecutionResult,
  type ModuleExecutor,
  type ModuleExecutorInput,
} from "./ModuleExecutor.js";
import type { InitialBatterySizingInputs } from "./InitialBatterySizingInputsContract.js";
import { Provenance } from "../../domain/shared/Provenance.js";
import { ValidationStatus } from "../../domain/shared/ValidationStatus.js";
import type { ValidationIssue } from "../validation/ValidationResult.js";

export const BATTERY_SIZING_MODULE_REF = "module.energy.battery-sizing:";
export const BATTERY_SIZING_METHOD_REF = "energy.calculate_battery_sizing";

export function batterySizingModuleRef(sectorId: string): string {
  return `${BATTERY_SIZING_MODULE_REF}${sectorId}`;
}

export class BatterySizingModuleTechnicalError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "BatterySizingModuleTechnicalError";
  }
}

function issue(code: string, message: string, path: string): Readonly<ValidationIssue> {
  return { code, message, path };
}

function sectorIdFromModuleRef(moduleRef: string): string {
  const sectorId = moduleRef.slice(BATTERY_SIZING_MODULE_REF.length);
  if (sectorId.trim().length === 0) {
    throw new BatterySizingModuleTechnicalError(
      `moduleRef must include a sectorId after ${BATTERY_SIZING_MODULE_REF}`,
    );
  }
  return sectorId;
}

function findDependency(
  dependencyResults: readonly IntermediateResult[],
  path: string,
): Readonly<IntermediateResult> | undefined {
  return dependencyResults.find((result) => result.value.identity.path === path);
}

function sourceRefsFor(
  executionSnapshotSourceRefs: readonly string[],
  dependencyResults: readonly IntermediateResult[],
  inputs?: Extract<InitialBatterySizingInputs, { readonly status: "AVAILABLE" }>,
): readonly string[] {
  const sourceRefs = new Set(executionSnapshotSourceRefs);
  for (const result of dependencyResults) {
    if (result.value.evidence?.sourceReference !== undefined) {
      sourceRefs.add(result.value.evidence.sourceReference);
    }
    if (result.value.evidence?.evidenceReference !== undefined) {
      sourceRefs.add(result.value.evidence.evidenceReference);
    }
  }
  if (inputs !== undefined) {
    for (const sourceRef of inputs.sourceRefs) {
      sourceRefs.add(sourceRef);
    }
    for (const value of [
      inputs.energyDemand,
      inputs.energyBoundary,
      inputs.autonomy,
      inputs.designHorizon,
      inputs.reserve,
      inputs.depthOfDischarge,
      inputs.cycleEfficiency,
    ]) {
      if (value?.evidence?.sourceReference !== undefined) {
        sourceRefs.add(value.evidence.sourceReference);
      }
      if (value?.evidence?.evidenceReference !== undefined) {
        sourceRefs.add(value.evidence.evidenceReference);
      }
    }
  }
  return Object.freeze([...sourceRefs]);
}

function calculatedEnergyValue(
  path: string,
  field: string,
  value: number,
  sourceValue: Readonly<{ evidence?: Readonly<{ sourceReference?: string; evidenceReference?: string }> }>,
): BatterySizingResultEnergy {
  return {
    value,
    unit: "kWh",
    provenance: Provenance.CALCULATED,
    status: ValidationStatus.VALIDATED,
    ...(sourceValue.evidence === undefined
      ? {}
      : { evidence: Object.freeze({ ...sourceValue.evidence }) }),
    identity: {
      domain: "energy",
      field,
      path,
    },
  };
}

function pendingIssues(
  missingFields: readonly string[],
  sectorId: string,
): readonly ValidationIssue[] {
  const paths: Readonly<Record<string, string>> = {
    usableEnergyRequired: batteryUsableEnergyRequiredPath(sectorId),
    nominalCapacityRequired: batteryNominalCapacityRequiredPath(sectorId),
  };

  return Object.freeze(
    missingFields.map((field) =>
      issue(
        "batterySizing.result.pending",
        `${field} result is required; approved sizing rules are still pending`,
        paths[field] ?? `energy.${sectorId}.battery.${field}`,
      ),
    ),
  );
}

function compositionPendingIssues(
  missingFields: readonly string[],
  sectorId: string,
): readonly ValidationIssue[] {
  return Object.freeze(
    missingFields.map((field) =>
      issue(
        "batterySizing.composition.pending",
        `${field} dependency is required before battery sizing can execute`,
        `energy.${sectorId}.battery.${field}`,
      ),
    ),
  );
}

function compositionIssues(
  issues: readonly { readonly code: string; readonly message: string; readonly path: string }[],
): readonly ValidationIssue[] {
  return Object.freeze(
    issues.map((compositionIssue) =>
      issue(
        compositionIssue.code,
        compositionIssue.message,
        compositionIssue.path,
      ),
    ),
  );
}

function resultIssues(
  issues: readonly BatterySizingResultIssue[],
): readonly ValidationIssue[] {
  return Object.freeze(
    issues.map((resultIssue) =>
      issue(resultIssue.code, resultIssue.message, resultIssue.path),
    ),
  );
}

export function createBatterySizingModuleExecutor(): Readonly<ModuleExecutor> {
  return Object.freeze({
    async execute(
      input: Readonly<ModuleExecutorInput>,
    ): Promise<Readonly<ModuleExecutionResult>> {
      const validatedInput = createModuleExecutorInput(input);

      if (!validatedInput.moduleRef.startsWith(BATTERY_SIZING_MODULE_REF)) {
        throw new BatterySizingModuleTechnicalError(
          `moduleRef must start with ${BATTERY_SIZING_MODULE_REF}`,
        );
      }

      const sectorId = sectorIdFromModuleRef(validatedInput.moduleRef);
      let initialBatterySizingInputs = validatedInput.initialBatterySizingInputs;
      const compositionContext =
        validatedInput.initialBatterySizingCompositionInput;

      if (compositionContext !== undefined) {
        if (compositionContext.sectorId !== sectorId) {
          return createModuleExecutionResult(
            {
              status: "BLOCKED",
              blockingIssues: [
                issue(
                  "batterySizing.composition.sector.mismatch",
                  "battery sizing composition context belongs to another sector",
                  `energy.${sectorId}.battery`,
                ),
              ],
            },
            validatedInput.executionSnapshot,
          );
        }

        const energyResult = findDependency(
          validatedInput.dependencyResults,
          batteryEnergyDemandPath(sectorId),
        );
        const composition = composeBatterySizingInputs({
          ...compositionContext,
          sectorId,
          energyDemand: energyResult?.value as never,
        });

        if (composition.status === "PENDING") {
          return createModuleExecutionResult(
            {
              status: "BLOCKED",
              blockingIssues: compositionPendingIssues(
                composition.missingFields,
                sectorId,
              ),
            },
            validatedInput.executionSnapshot,
          );
        }

        if (composition.status === "BLOCKED") {
          return createModuleExecutionResult(
            {
              status: "BLOCKED",
              blockingIssues: compositionIssues(composition.issues),
            },
            validatedInput.executionSnapshot,
          );
        }

        initialBatterySizingInputs = composition.inputs;
      }

      if (
        initialBatterySizingInputs === undefined ||
        initialBatterySizingInputs.status === "ABSENT"
      ) {
        return createModuleExecutionResult(
          {
            status: "BLOCKED",
            blockingIssues: [
              issue(
                "batterySizing.initialInputs.absent",
                "available initial battery sizing inputs are required",
                `energy.${sectorId}.battery`,
              ),
            ],
          },
          validatedInput.executionSnapshot,
        );
      }
      if (initialBatterySizingInputs.status === "BLOCKED") {
        return createModuleExecutionResult(
          {
            status: "BLOCKED",
            blockingIssues: [
              issue(
                "batterySizing.initialInputs.blocked",
                initialBatterySizingInputs.issue,
                `energy.${sectorId}.battery`,
              ),
            ],
          },
          validatedInput.executionSnapshot,
        );
      }
      if (initialBatterySizingInputs.sectorId !== sectorId) {
        return createModuleExecutionResult(
          {
            status: "BLOCKED",
            blockingIssues: [
              issue(
                "batterySizing.initialInputs.sector.mismatch",
                "initial battery sizing inputs belong to another sector",
                `energy.${sectorId}.battery`,
              ),
            ],
          },
          validatedInput.executionSnapshot,
        );
      }
      const sourceRefs = sourceRefsFor(
        validatedInput.executionSnapshot.sourceRefs,
        validatedInput.dependencyResults,
        initialBatterySizingInputs,
      );

      try {
        const usableEnergyRequired = calculatedEnergyValue(
          batteryUsableEnergyRequiredPath(sectorId),
          "usableEnergyRequired",
          initialBatterySizingInputs.energyDemand.value +
            initialBatterySizingInputs.reserve.value,
          initialBatterySizingInputs.energyDemand,
        );
        const nominalCapacityRequired = calculatedEnergyValue(
          batteryNominalCapacityRequiredPath(sectorId),
          "nominalCapacityRequired",
          usableEnergyRequired.value /
            initialBatterySizingInputs.depthOfDischarge.value,
          initialBatterySizingInputs.depthOfDischarge,
        );
        const sizingResult = createBatterySizingResult({
          sectorId,
          usableEnergyRequired,
          nominalCapacityRequired,
          dependencyRefs: initialBatterySizingInputs.dependencyRefs,
          sourceRefs,
        });

        if (sizingResult.status === "PENDING") {
          return createModuleExecutionResult(
            {
              status: "BLOCKED",
              blockingIssues: pendingIssues(sizingResult.missingFields, sectorId),
            },
            validatedInput.executionSnapshot,
          );
        }

        if (sizingResult.status === "BLOCKED") {
          return createModuleExecutionResult(
            { status: "BLOCKED", blockingIssues: resultIssues(sizingResult.issues) },
            validatedInput.executionSnapshot,
          );
        }

        return createModuleExecutionResult(
          {
            status: "COMPLETED",
            intermediateResults: [
              createIntermediateResult({
                executionId: validatedInput.executionSnapshot.identity.executionId,
                methodRef: BATTERY_SIZING_METHOD_REF,
                dependencyRefs: sizingResult.dependencyRefs,
                value: sizingResult.usableEnergyRequired,
              }),
              createIntermediateResult({
                executionId: validatedInput.executionSnapshot.identity.executionId,
                methodRef: BATTERY_SIZING_METHOD_REF,
                dependencyRefs: sizingResult.dependencyRefs,
                value: sizingResult.nominalCapacityRequired,
              }),
            ],
          },
          validatedInput.executionSnapshot,
        );
      } catch (error) {
        return createModuleExecutionResult(
          {
            status: "FAILED",
            errorMessage: error instanceof Error ? error.message : "BatterySizing execution failed",
          },
          validatedInput.executionSnapshot,
        );
      }
    },
  });
}
