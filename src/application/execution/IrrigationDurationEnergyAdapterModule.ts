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
  operatingTimeCalculationPath,
} from "./EnergyCalculationContract.js";
import {
  IRRIGATION_DURATION_METHOD_REF,
  irrigationDurationResultPath,
} from "../../../engine/domain/hydraulic/IrrigationDurationEvaluation.js";
import type { ValidationIssue } from "../validation/ValidationResult.js";

export const IRRIGATION_DURATION_ENERGY_ADAPTER_MODULE_REF =
  "module.energy.operating-time:";
export const IRRIGATION_DURATION_ENERGY_ADAPTER_METHOD_REF =
  "energy.adapt_irrigation_duration";

export class IrrigationDurationEnergyAdapterTechnicalError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "IrrigationDurationEnergyAdapterTechnicalError";
  }
}

function sectorIdFromModuleRef(moduleRef: string): string {
  const sectorId = moduleRef.slice(
    IRRIGATION_DURATION_ENERGY_ADAPTER_MODULE_REF.length,
  );
  if (sectorId.trim().length === 0) {
    throw new IrrigationDurationEnergyAdapterTechnicalError(
      `moduleRef must include a sectorId after ${IRRIGATION_DURATION_ENERGY_ADAPTER_MODULE_REF}`,
    );
  }
  return sectorId;
}

function issue(code: string, message: string, path: string): Readonly<ValidationIssue> {
  return Object.freeze({ code, message, path });
}

function adaptDurationResult(
  executionId: string,
  sectorId: string,
  durationResult: Readonly<IntermediateResult>,
): Readonly<IntermediateResult> {
  const duration = durationResult.value;
  const operatingTimeValue = {
    value: duration.value / 60,
    unit: "h",
    provenance: duration.provenance,
    status: duration.status,
    ...(duration.evidence === undefined ? {} : { evidence: duration.evidence }),
    identity: {
      domain: "energy",
      field: "operatingTime",
      path: operatingTimeCalculationPath(sectorId),
    },
  } as const;

  return createIntermediateResult({
    executionId,
    methodRef: IRRIGATION_DURATION_ENERGY_ADAPTER_METHOD_REF,
    dependencyRefs: [
      ...(durationResult.dependencyRefs ?? []),
      duration.identity.path,
    ],
    value: operatingTimeValue,
  });
}

export function createIrrigationDurationEnergyAdapterModuleExecutor(): Readonly<ModuleExecutor> {
  return Object.freeze({
    async execute(
      input: Readonly<ModuleExecutorInput>,
    ): Promise<Readonly<ModuleExecutionResult>> {
      const validatedInput = createModuleExecutorInput(input);

      if (
        !validatedInput.moduleRef.startsWith(
          IRRIGATION_DURATION_ENERGY_ADAPTER_MODULE_REF,
        )
      ) {
        throw new IrrigationDurationEnergyAdapterTechnicalError(
          `moduleRef must start with ${IRRIGATION_DURATION_ENERGY_ADAPTER_MODULE_REF}`,
        );
      }

      const sectorId = sectorIdFromModuleRef(validatedInput.moduleRef);
      const durationPath = irrigationDurationResultPath(sectorId);
      const durationResult = findIntermediateResultByPath(
        validatedInput.dependencyResults,
        durationPath,
      );

      if (durationResult === undefined) {
        return createModuleExecutionResult(
          {
            status: "BLOCKED",
            blockingIssues: [
              issue(
                "energy.operatingTime.dependency.missing",
                `${durationPath} dependency result is required`,
                durationPath,
              ),
            ],
          },
          validatedInput.executionSnapshot,
        );
      }

      if (durationResult.value.unit !== "min") {
        return createModuleExecutionResult(
          {
            status: "BLOCKED",
            blockingIssues: [
              issue(
                "energy.operatingTime.dependency.unit.mismatch",
                `${durationPath} dependency must use min`,
                durationPath,
              ),
            ],
          },
          validatedInput.executionSnapshot,
        );
      }

      if (
        durationResult.value.status === "PENDING" ||
        durationResult.value.status === "BLOCKED" ||
        durationResult.value.status === "INVALID" ||
        durationResult.value.status === "OBSOLETE"
      ) {
        return createModuleExecutionResult(
          {
            status: "BLOCKED",
            blockingIssues: [
              issue(
                "energy.operatingTime.dependency.status.unusable",
                `${durationPath} dependency has status ${durationResult.value.status}`,
                durationPath,
              ),
            ],
          },
          validatedInput.executionSnapshot,
        );
      }

      if (
        !Number.isFinite(durationResult.value.value) ||
        durationResult.value.value < 0
      ) {
        return createModuleExecutionResult(
          {
            status: "BLOCKED",
            blockingIssues: [
              issue(
                "energy.operatingTime.dependency.value.invalid",
                `${durationPath} dependency must be finite and >= 0`,
                durationPath,
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
            adaptDurationResult(
              validatedInput.executionSnapshot.identity.executionId,
              sectorId,
              durationResult,
            ),
          ],
        },
        validatedInput.executionSnapshot,
      );
    },
  });
}

export { IRRIGATION_DURATION_METHOD_REF };
