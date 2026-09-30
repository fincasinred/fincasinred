import {
  calculateSolarSizing,
} from "./SolarSizing.js";
import {
  solarResourcePath,
  solarSizingEnergyPath,
  solarSizingRulesPath,
  type SolarResource,
  type SolarSizingEnergy,
  type SolarSizingRules,
} from "./SolarSizingPreparationContract.js";
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
import type { InitialSolarSizingInputs } from "./InitialSolarSizingInputsContract.js";
import type { ValidationIssue } from "../validation/ValidationResult.js";

export const SOLAR_SIZING_MODULE_REF = "module.energy.solar-sizing:";
export const SOLAR_SIZING_METHOD_REF = "energy.calculate_solar_sizing";

export function solarSizingModuleRef(sectorId: string): string {
  return `${SOLAR_SIZING_MODULE_REF}${sectorId}`;
}

export function solarSizingResultPath(sectorId: string): string {
  return `energy.${sectorId}.solarSizing.requiredPvPowerKwp`;
}

export class SolarSizingModuleTechnicalError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "SolarSizingModuleTechnicalError";
  }
}

function issue(code: string, message: string, path: string): Readonly<ValidationIssue> {
  return { code, message, path };
}

function sectorIdFromModuleRef(moduleRef: string): string {
  const sectorId = moduleRef.slice(SOLAR_SIZING_MODULE_REF.length);
  if (sectorId.trim().length === 0) {
    throw new SolarSizingModuleTechnicalError(
      `moduleRef must include a sectorId after ${SOLAR_SIZING_MODULE_REF}`,
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
  inputs?: Extract<InitialSolarSizingInputs, { readonly status: "AVAILABLE" }>,
): readonly string[] {
  const sourceRefs = new Set(executionSnapshotSourceRefs);
  for (const result of dependencyResults) {
    const evidence = result.value.evidence;
    if (evidence?.sourceReference !== undefined) {
      sourceRefs.add(evidence.sourceReference);
    }
    if (evidence?.evidenceReference !== undefined) {
      sourceRefs.add(evidence.evidenceReference);
    }
  }
  if (inputs !== undefined) {
    sourceRefs.add(inputs.solarResource.source.reference);
    if (inputs.solarResource.evidence.sourceReference !== undefined) {
      sourceRefs.add(inputs.solarResource.evidence.sourceReference);
    }
    if (inputs.solarResource.evidence.evidenceReference !== undefined) {
      sourceRefs.add(inputs.solarResource.evidence.evidenceReference);
    }
    if (inputs.solarSizingRules.evidence?.sourceReference !== undefined) {
      sourceRefs.add(inputs.solarSizingRules.evidence.sourceReference);
    }
    if (inputs.solarSizingRules.evidence?.evidenceReference !== undefined) {
      sourceRefs.add(inputs.solarSizingRules.evidence.evidenceReference);
    }
  }
  return Object.freeze([...sourceRefs]);
}

function pendingIssues(
  missingFields: readonly string[],
  sectorId: string,
): readonly ValidationIssue[] {
  const paths: Readonly<Record<string, string>> = {
    energy: solarSizingEnergyPath(sectorId),
    solarSizingRules: solarSizingRulesPath(sectorId),
    solarResource: solarResourcePath(sectorId),
  };

  return Object.freeze(
    missingFields.map((field) =>
      issue(
        "solarSizing.dependency.pending",
        `${field} dependency result is required`,
        paths[field] ?? `energy.${sectorId}.${field}`,
      ),
    ),
  );
}

function calculationInput(
  sectorId: string,
  dependencyResults: readonly IntermediateResult[],
  sourceRefs: readonly string[],
  inputs: Extract<InitialSolarSizingInputs, { readonly status: "AVAILABLE" }>,
) {
  const energyResult = findDependency(dependencyResults, solarSizingEnergyPath(sectorId));

  return {
    sectorId,
    ...(energyResult === undefined
      ? {}
      : { energy: energyResult.value as SolarSizingEnergy }),
    solarSizingRules: inputs.solarSizingRules as SolarSizingRules,
    solarResource: inputs.solarResource as SolarResource,
    sourceRefs,
  };
}

export function createSolarSizingModuleExecutor(): Readonly<ModuleExecutor> {
  return Object.freeze({
    async execute(
      input: Readonly<ModuleExecutorInput>,
    ): Promise<Readonly<ModuleExecutionResult>> {
      const validatedInput = createModuleExecutorInput(input);

      if (!validatedInput.moduleRef.startsWith(SOLAR_SIZING_MODULE_REF)) {
        throw new SolarSizingModuleTechnicalError(
          `moduleRef must start with ${SOLAR_SIZING_MODULE_REF}`,
        );
      }

      const sectorId = sectorIdFromModuleRef(validatedInput.moduleRef);
      const initialSolarSizingInputs = validatedInput.initialSolarSizingInputs;
      if (
        initialSolarSizingInputs === undefined ||
        initialSolarSizingInputs.status === "ABSENT"
      ) {
        return createModuleExecutionResult(
          {
            status: "BLOCKED",
            blockingIssues: [
              issue(
                "solarSizing.initialInputs.absent",
                "available initial solar sizing inputs are required",
                `energy.${sectorId}.solarSizing`,
              ),
            ],
          },
          validatedInput.executionSnapshot,
        );
      }
      if (initialSolarSizingInputs.status === "BLOCKED") {
        return createModuleExecutionResult(
          {
            status: "BLOCKED",
            blockingIssues: [
              issue(
                "solarSizing.initialInputs.blocked",
                initialSolarSizingInputs.issue,
                `energy.${sectorId}.solarSizing`,
              ),
            ],
          },
          validatedInput.executionSnapshot,
        );
      }
      if (initialSolarSizingInputs.sectorId !== sectorId) {
        return createModuleExecutionResult(
          {
            status: "BLOCKED",
            blockingIssues: [
              issue(
                "solarSizing.initialInputs.sector.mismatch",
                "initial solar sizing inputs belong to another sector",
                `energy.${sectorId}.solarSizing`,
              ),
            ],
          },
          validatedInput.executionSnapshot,
        );
      }
      const sourceRefs = sourceRefsFor(
        validatedInput.executionSnapshot.sourceRefs,
        validatedInput.dependencyResults,
        initialSolarSizingInputs,
      );

      try {
        const calculation = calculateSolarSizing(
          calculationInput(
            sectorId,
            validatedInput.dependencyResults,
            sourceRefs,
            initialSolarSizingInputs,
          ),
        );

        if (calculation.status === "PENDING") {
          return createModuleExecutionResult(
            {
              status: "BLOCKED",
              blockingIssues: pendingIssues(calculation.missingFields, sectorId),
            },
            validatedInput.executionSnapshot,
          );
        }

        if (calculation.status === "BLOCKED") {
          return createModuleExecutionResult(
            { status: "BLOCKED", blockingIssues: calculation.issues },
            validatedInput.executionSnapshot,
          );
        }

        return createModuleExecutionResult(
          {
            status: "COMPLETED",
            intermediateResults: [
              createIntermediateResult({
                executionId: validatedInput.executionSnapshot.identity.executionId,
                methodRef: SOLAR_SIZING_METHOD_REF,
                dependencyRefs: [
                  solarSizingEnergyPath(sectorId),
                  solarSizingRulesPath(sectorId),
                  solarResourcePath(sectorId),
                ],
                value: calculation.requiredPvPowerKwp,
              }),
            ],
          },
          validatedInput.executionSnapshot,
        );
      } catch (error) {
        return createModuleExecutionResult(
          {
            status: "FAILED",
            errorMessage: error instanceof Error ? error.message : "SolarSizing execution failed",
          },
          validatedInput.executionSnapshot,
        );
      }
    },
  });
}
