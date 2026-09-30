import {
  calculateEnergy,
  electricalPowerResultPath,
  type EnergyCalculationInput,
} from "./EnergyCalculationContract.js";
import { createIntermediateResult } from "./IntermediateResult.js";
import {
  createModuleExecutionResult,
  createModuleExecutorInput,
  type ModuleExecutionResult,
  type ModuleExecutor,
  type ModuleExecutorInput,
} from "./ModuleExecutor.js";
import type { ValidationIssue } from "../validation/ValidationResult.js";

export const ENERGY_CALCULATION_MODULE_REF = "module.energy.calculation:";
export const ELECTRICAL_POWER_METHOD_REF = "energy.calculate_electrical_power";
export const ENERGY_METHOD_REF = "energy.calculate_energy";

export class EnergyCalculationModuleTechnicalError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "EnergyCalculationModuleTechnicalError";
  }
}

function sectorIdFromModuleRef(moduleRef: string): string {
  const sectorId = moduleRef.slice(ENERGY_CALCULATION_MODULE_REF.length);
  if (sectorId.trim().length === 0) {
    throw new EnergyCalculationModuleTechnicalError(
      `moduleRef must include a sectorId after ${ENERGY_CALCULATION_MODULE_REF}`,
    );
  }
  return sectorId;
}

function findDependency(
  input: Readonly<ModuleExecutorInput>,
  path: string,
): EnergyCalculationInput[keyof EnergyCalculationInput] | undefined {
  return input.dependencyResults.find(
    (result) => result.value.identity.path === path,
  )?.value as EnergyCalculationInput[keyof EnergyCalculationInput] | undefined;
}

function issue(code: string, message: string, path: string): ValidationIssue {
  return { code, message, path };
}

export function createEnergyCalculationModuleExecutor(): Readonly<ModuleExecutor> {
  return Object.freeze({
    async execute(
      input: Readonly<ModuleExecutorInput>,
    ): Promise<Readonly<ModuleExecutionResult>> {
      const validatedInput = createModuleExecutorInput(input);
      if (!validatedInput.moduleRef.startsWith(ENERGY_CALCULATION_MODULE_REF)) {
        throw new EnergyCalculationModuleTechnicalError(
          `moduleRef must start with ${ENERGY_CALCULATION_MODULE_REF}`,
        );
      }

      const sectorId = sectorIdFromModuleRef(validatedInput.moduleRef);
      const hydraulicPowerPath = `energy.${sectorId}.hydraulicPower`;
      const efficiencyPath = `energy.${sectorId}.pumpingEfficiency`;
      const operatingTimePath = `energy.${sectorId}.operatingTime`;
      const hydraulicPower = findDependency(validatedInput, hydraulicPowerPath);
      const pumpingEfficiency = findDependency(validatedInput, efficiencyPath);
      const operatingTime = findDependency(validatedInput, operatingTimePath);
      const missingIssues = [
        ["hydraulicPower", hydraulicPower, hydraulicPowerPath],
        ["pumpingEfficiency", pumpingEfficiency, efficiencyPath],
        ["operatingTime", operatingTime, operatingTimePath],
      ]
        .filter(([, value]) => value === undefined)
        .map(([field, , path]) =>
          issue(
            "energyCalculation.dependency.missing",
            `${field} dependency result is required`,
            path as string,
          ),
        );

      if (missingIssues.length > 0) {
        return createModuleExecutionResult(
          { status: "BLOCKED", blockingIssues: missingIssues },
          validatedInput.executionSnapshot,
        );
      }

      const calculation = calculateEnergy({
        sectorId,
        hydraulicPower,
        pumpingEfficiency,
        operatingTime,
      } as EnergyCalculationInput);

      if (calculation.status === "PENDING" || calculation.status === "BLOCKED") {
        return createModuleExecutionResult(
          {
            status: "BLOCKED",
            blockingIssues: calculation.issues.length > 0
              ? calculation.issues
              : [
                  issue(
                    "energyCalculation.dependency.pending",
                    `energy calculation is ${calculation.status}`,
                    calculation.missingFields[0] ?? hydraulicPowerPath,
                  ),
                ],
          },
          validatedInput.executionSnapshot,
        );
      }

      return createModuleExecutionResult(
        {
          status: "COMPLETED",
          intermediateResults: [
            createIntermediateResult({
              executionId: validatedInput.executionSnapshot.identity.executionId,
              methodRef: ELECTRICAL_POWER_METHOD_REF,
              dependencyRefs: calculation.dependencyRefs,
              value: calculation.electricalPower,
            }),
            createIntermediateResult({
              executionId: validatedInput.executionSnapshot.identity.executionId,
              methodRef: ENERGY_METHOD_REF,
              dependencyRefs: [
                electricalPowerResultPath(sectorId),
                calculation.dependencies.operatingTime?.identity.path ?? operatingTimePath,
              ],
              value: calculation.energy,
            }),
          ],
        },
        validatedInput.executionSnapshot,
      );
    },
  });
}