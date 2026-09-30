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
  batteryEnergyDemandPath,
} from "./BatterySizingPreparationContract.js";
import {
  prepareEnergyForBattery,
  type EnergyToBatteryPreparationContext,
} from "./EnergyToBatteryPreparationContract.js";
import type { ValidationIssue } from "../validation/ValidationResult.js";

export const ENERGY_TO_BATTERY_PREPARATION_MODULE_REF =
  "module.energy.to-battery:";
export const ENERGY_TO_BATTERY_PREPARATION_METHOD_REF =
  "energy.prepare_battery_demand";

export function energyToBatteryPreparationModuleRef(sectorId: string): string {
  return `${ENERGY_TO_BATTERY_PREPARATION_MODULE_REF}${sectorId}`;
}

export class EnergyToBatteryPreparationModuleTechnicalError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "EnergyToBatteryPreparationModuleTechnicalError";
  }
}

function issue(code: string, message: string, path: string): Readonly<ValidationIssue> {
  return { code, message, path };
}

function sectorIdFromModuleRef(moduleRef: string): string {
  const sectorId = moduleRef.slice(ENERGY_TO_BATTERY_PREPARATION_MODULE_REF.length);
  if (sectorId.trim().length === 0) {
    throw new EnergyToBatteryPreparationModuleTechnicalError(
      `moduleRef must include a sectorId after ${ENERGY_TO_BATTERY_PREPARATION_MODULE_REF}`,
    );
  }
  return sectorId;
}

function findEnergyDependency(
  dependencyResults: readonly IntermediateResult[],
  sectorId: string,
): Readonly<IntermediateResult> | undefined {
  return findIntermediateResultByPath(
    dependencyResults,
    batteryEnergyDemandPath(sectorId),
  );
}

function preparationIssues(
  sectorId: string,
  missingFields: readonly string[],
): readonly ValidationIssue[] {
  return Object.freeze(
    missingFields.map((field) =>
      issue(
        "energyToBatteryPreparation.pending",
        `${field} is required before energy can prepare battery demand`,
        `energy.${sectorId}.battery.${field}`,
      ),
    ),
  );
}

export function createEnergyToBatteryPreparationModuleExecutor(): Readonly<ModuleExecutor> {
  return Object.freeze({
    async execute(
      input: Readonly<ModuleExecutorInput>,
    ): Promise<Readonly<ModuleExecutionResult>> {
      const validatedInput = createModuleExecutorInput(input);
      if (
        !validatedInput.moduleRef.startsWith(
          ENERGY_TO_BATTERY_PREPARATION_MODULE_REF,
        )
      ) {
        throw new EnergyToBatteryPreparationModuleTechnicalError(
          `moduleRef must start with ${ENERGY_TO_BATTERY_PREPARATION_MODULE_REF}`,
        );
      }

      const sectorId = sectorIdFromModuleRef(validatedInput.moduleRef);
      const context = validatedInput.initialEnergyToBatteryPreparationInput;
      if (context !== undefined && context.sectorId !== sectorId) {
        return createModuleExecutionResult(
          {
            status: "BLOCKED",
            blockingIssues: [
              issue(
                "energyToBatteryPreparation.sector.mismatch",
                "energy to battery preparation context belongs to another sector",
                `energy.${sectorId}.energy`,
              ),
            ],
          },
          validatedInput.executionSnapshot,
        );
      }

      const energyResult = findEnergyDependency(
        validatedInput.dependencyResults,
        sectorId,
      );
      const preparationInput: EnergyToBatteryPreparationContext =
        context ?? { sectorId };
      let prepared: ReturnType<typeof prepareEnergyForBattery>;
      try {
        prepared = prepareEnergyForBattery({
          ...preparationInput,
          sectorId,
          energy: energyResult?.value as never,
        });
      } catch (error) {
        return createModuleExecutionResult(
          {
            status: "FAILED",
            errorMessage:
              error instanceof Error
                ? error.message
                : "Energy to battery preparation failed",
          },
          validatedInput.executionSnapshot,
        );
      }

      if (prepared.status === "PENDING") {
        return createModuleExecutionResult(
          {
            status: "BLOCKED",
            blockingIssues: preparationIssues(
              sectorId,
              prepared.missingFields,
            ),
          },
          validatedInput.executionSnapshot,
        );
      }

      if (prepared.status === "BLOCKED") {
        return createModuleExecutionResult(
          {
            status: "BLOCKED",
            blockingIssues: prepared.issues,
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
              methodRef: ENERGY_TO_BATTERY_PREPARATION_METHOD_REF,
              dependencyRefs: prepared.requirement.dependencyRefs,
              value: prepared.requirement.energyDemand,
            }),
          ],
        },
        validatedInput.executionSnapshot,
      );
    },
  });
}