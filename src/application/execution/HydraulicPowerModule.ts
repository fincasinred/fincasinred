import {
  createIntermediateResult,
  IntermediateResult,
} from "./IntermediateResult.js";
import {
  createModuleExecutionResult,
  createModuleExecutorInput,
  ModuleExecutionResult,
  ModuleExecutor,
  ModuleExecutorInput,
} from "./ModuleExecutor.js";
import type { ValidationIssue } from "../validation/ValidationResult.js";
import { Provenance } from "../../domain/shared/Provenance.js";
import { ValidationStatus } from "../../domain/shared/ValidationStatus.js";

export const HYDRAULIC_POWER_MODULE_REF = "module.energy.hydraulic-power:";
export const HYDRAULIC_POWER_METHOD_REF = "energy.calculate_hydraulic_power";
export function hydraulicPowerResultPath(sectorId: string): string {
  return `energy.${sectorId}.hydraulicPower`;
}

const DESIGN_FLOW_FIELD = "design_flow_lpm";
const REQUIRED_HMT_FIELD = "required_hmt_mca";
const WATER_DENSITY_KG_PER_M3 = 1000;
const STANDARD_GRAVITY_M_PER_S2 = 9.80665;

export class HydraulicPowerModuleTechnicalError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "HydraulicPowerModuleTechnicalError";
  }
}

function dependencyIssue(
  code: string,
  message: string,
  path: string,
): Readonly<ValidationIssue> {
  return Object.freeze({ code, message, path });
}

function findDependencyByPath(
  dependencyResults: readonly IntermediateResult[],
  path: string,
): Readonly<IntermediateResult> | undefined {
  return dependencyResults.find(
    (result) => result.value.identity.path === path,
  );
}

function sectorIdFromModuleRef(moduleRef: string): string {
  const sectorId = moduleRef.slice(HYDRAULIC_POWER_MODULE_REF.length);

  if (sectorId.trim().length === 0) {
    throw new HydraulicPowerModuleTechnicalError(
      `moduleRef must include a sectorId after ${HYDRAULIC_POWER_MODULE_REF}`,
    );
  }

  return sectorId;
}

function deriveStatus(
  statuses: readonly ValidationStatus[],
): ValidationStatus {
  if (statuses.includes(ValidationStatus.BLOCKED)) {
    return ValidationStatus.BLOCKED;
  }

  if (statuses.includes(ValidationStatus.PENDING)) {
    return ValidationStatus.PENDING;
  }

  if (statuses.includes(ValidationStatus.PROVISIONAL)) {
    return ValidationStatus.PROVISIONAL;
  }

  return ValidationStatus.VALIDATED;
}

function validateDependencyValue(
  result: Readonly<IntermediateResult>,
  expectedUnit: string,
  field: string,
): Readonly<IntermediateResult> {
  if (result.value.unit !== expectedUnit) {
    throw new HydraulicPowerModuleTechnicalError(
      `${field} dependency must use ${expectedUnit}`,
    );
  }

  if (result.value.value < 0) {
    throw new HydraulicPowerModuleTechnicalError(
      `${field} dependency must be >= 0`,
    );
  }

  if (
    result.value.status === ValidationStatus.INVALID ||
    result.value.status === ValidationStatus.OBSOLETE
  ) {
    throw new HydraulicPowerModuleTechnicalError(
      `${field} dependency status is not usable`,
    );
  }

  return result;
}

function calculateHydraulicPowerKw(
  flowLpm: number,
  requiredHmtMca: number,
): number {
  const flowM3PerSecond = flowLpm / 60000;

  return (
    WATER_DENSITY_KG_PER_M3 *
    STANDARD_GRAVITY_M_PER_S2 *
    flowM3PerSecond *
    requiredHmtMca /
    1000
  );
}

export function createHydraulicPowerModuleExecutor(): Readonly<ModuleExecutor> {
  return Object.freeze({
    async execute(
      input: Readonly<ModuleExecutorInput>,
    ): Promise<Readonly<ModuleExecutionResult>> {
      const validatedInput = createModuleExecutorInput(input);

      if (!validatedInput.moduleRef.startsWith(HYDRAULIC_POWER_MODULE_REF)) {
        throw new HydraulicPowerModuleTechnicalError(
          `moduleRef must start with ${HYDRAULIC_POWER_MODULE_REF}`,
        );
      }

      const sectorId = sectorIdFromModuleRef(validatedInput.moduleRef);
      const designFlowPath =
        `hydraulic.${sectorId}.pump_requirement.design_flow_lpm`;
      const requiredHmtPath =
        `hydraulic.${sectorId}.pump_requirement.required_hmt_mca`;

      const flowResult = findDependencyByPath(
        validatedInput.dependencyResults,
        designFlowPath,
      );
      if (flowResult === undefined) {
        return createModuleExecutionResult(
          {
            status: "BLOCKED",
            blockingIssues: [
              dependencyIssue(
                "hydraulicPower.dependency.missing",
                `${designFlowPath} dependency result is required`,
                designFlowPath,
              ),
            ],
          },
          validatedInput.executionSnapshot,
        );
      }

      const hmtResult = findDependencyByPath(
        validatedInput.dependencyResults,
        requiredHmtPath,
      );
      if (hmtResult === undefined) {
        return createModuleExecutionResult(
          {
            status: "BLOCKED",
            blockingIssues: [
              dependencyIssue(
                "hydraulicPower.dependency.missing",
                `${requiredHmtPath} dependency result is required`,
                requiredHmtPath,
              ),
            ],
          },
          validatedInput.executionSnapshot,
        );
      }

      const validatedFlow = validateDependencyValue(
        flowResult,
        "lpm",
        DESIGN_FLOW_FIELD,
      );
      const validatedHmt = validateDependencyValue(
        hmtResult,
        "mca",
        REQUIRED_HMT_FIELD,
      );

      if (
        validatedFlow.value.status === ValidationStatus.BLOCKED ||
        validatedFlow.value.status === ValidationStatus.PENDING ||
        validatedHmt.value.status === ValidationStatus.BLOCKED ||
        validatedHmt.value.status === ValidationStatus.PENDING
      ) {
        return createModuleExecutionResult(
          {
            status: "BLOCKED",
            blockingIssues: [
              dependencyIssue(
                "hydraulicPower.dependency.status.unusable",
                "hydraulic power dependencies must not be BLOCKED or PENDING",
                validatedFlow.value.status === ValidationStatus.BLOCKED ||
                  validatedFlow.value.status === ValidationStatus.PENDING
                  ? designFlowPath
                  : requiredHmtPath,
              ),
            ],
          },
          validatedInput.executionSnapshot,
        );
      }

      const technicalValue = {
        value: calculateHydraulicPowerKw(
          validatedFlow.value.value,
          validatedHmt.value.value,
        ),
        unit: "kW",
        provenance: Provenance.CALCULATED,
        status: deriveStatus([
          validatedFlow.value.status,
          validatedHmt.value.status,
        ]),
        identity: {
          domain: "energy",
          field: "hydraulicPower",
          path: hydraulicPowerResultPath(sectorId),
        },
      } as const;

      return createModuleExecutionResult(
        {
          status: "COMPLETED",
          intermediateResults: [
            createIntermediateResult({
              executionId: validatedInput.executionSnapshot.identity.executionId,
              methodRef: HYDRAULIC_POWER_METHOD_REF,
              dependencyRefs: [
                validatedFlow.value.identity.path,
                validatedHmt.value.identity.path,
              ],
              value: technicalValue,
            }),
          ],
        },
        validatedInput.executionSnapshot,
      );
    },
  });
}