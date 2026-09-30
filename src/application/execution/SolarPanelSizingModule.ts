import {
  calculateSolarPanelSizing,
  INSTALLED_PV_POWER_UNIT,
  SOLAR_PANEL_COUNT_UNIT,
  SOLAR_PANEL_POWER_UNIT,
} from "./SolarPanelSizing.js";
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
import type { TechnicalSolarPanelProduct } from "../../domain/catalog/TechnicalProduct.js";
import { ValidationStatus } from "../../domain/shared/ValidationStatus.js";
import type { ValidationIssue } from "../validation/ValidationResult.js";

export const SOLAR_PANEL_SIZING_MODULE_REF = "module.energy.solar-panel-sizing:";
export const SOLAR_PANEL_SIZING_METHOD_REF = "energy.calculate_solar_panel_sizing";
export const SOLAR_PANEL_PRODUCT_PATH_SUFFIX = "solarPanelProduct";

export function solarPanelSizingModuleRef(sectorId: string): string {
  return `${SOLAR_PANEL_SIZING_MODULE_REF}${sectorId}`;
}

export function requiredPvPowerPath(sectorId: string): string {
  return `energy.${sectorId}.solarSizing.requiredPvPowerKwp`;
}

export function solarPanelProductPath(sectorId: string): string {
  return `energy.${sectorId}.${SOLAR_PANEL_PRODUCT_PATH_SUFFIX}`;
}

export class SolarPanelSizingModuleTechnicalError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "SolarPanelSizingModuleTechnicalError";
  }
}

function issue(code: string, message: string, path: string): Readonly<ValidationIssue> {
  return { code, message, path };
}

function sectorIdFromModuleRef(moduleRef: string): string {
  const sectorId = moduleRef.slice(SOLAR_PANEL_SIZING_MODULE_REF.length);
  if (sectorId.trim().length === 0) {
    throw new SolarPanelSizingModuleTechnicalError(
      `moduleRef must include a sectorId after ${SOLAR_PANEL_SIZING_MODULE_REF}`,
    );
  }
  return sectorId;
}

function findDependency(
  results: readonly IntermediateResult[],
  path: string,
): Readonly<IntermediateResult> | undefined {
  return results.find((result) => result.value.identity.path === path);
}

function sourceRefsFor(
  snapshotRefs: readonly string[],
  dependencies: readonly IntermediateResult[],
): readonly string[] {
  const refs = new Set(snapshotRefs);
  for (const dependency of dependencies) {
    const evidence = dependency.value.evidence;
    if (evidence?.sourceReference !== undefined) refs.add(evidence.sourceReference);
    if (evidence?.evidenceReference !== undefined) refs.add(evidence.evidenceReference);
  }
  return Object.freeze([...refs]);
}

function productFromDependency(
  dependency: Readonly<IntermediateResult> | undefined,
): Readonly<TechnicalSolarPanelProduct> | undefined {
  const product = (dependency?.value as unknown as { product?: unknown } | undefined)?.product;
  if (product === null || typeof product !== "object") return undefined;
  return product as Readonly<TechnicalSolarPanelProduct>;
}

function pendingIssues(
  sectorId: string,
  missing: readonly string[],
): readonly ValidationIssue[] {
  const paths: Readonly<Record<string, string>> = {
    requiredPvPowerKwp: requiredPvPowerPath(sectorId),
    solarPanelProduct: solarPanelProductPath(sectorId),
  };
  return Object.freeze(
    missing.map((field) =>
      issue(
        "solarPanelSizing.dependency.pending",
        `${field} dependency result is required`,
        paths[field] ?? `energy.${sectorId}.${field}`,
      ),
    ),
  );
}

function blockedDependencyIssue(path: string): Readonly<ValidationIssue> {
  return issue(
    "solarPanelSizing.dependency.blocked",
    "solar panel sizing dependency is not usable",
    path,
  );
}

export function createSolarPanelSizingModuleExecutor(): Readonly<ModuleExecutor> {
  return Object.freeze({
    async execute(
      input: Readonly<ModuleExecutorInput>,
    ): Promise<Readonly<ModuleExecutionResult>> {
      const validatedInput = createModuleExecutorInput(input);
      if (!validatedInput.moduleRef.startsWith(SOLAR_PANEL_SIZING_MODULE_REF)) {
        throw new SolarPanelSizingModuleTechnicalError(
          `moduleRef must start with ${SOLAR_PANEL_SIZING_MODULE_REF}`,
        );
      }

      const sectorId = sectorIdFromModuleRef(validatedInput.moduleRef);
      const requiredDependency = findDependency(
        validatedInput.dependencyResults,
        requiredPvPowerPath(sectorId),
      );
      const productDependency = findDependency(
        validatedInput.dependencyResults,
        solarPanelProductPath(sectorId),
      );
      const missing = [
        ...(requiredDependency === undefined ? ["requiredPvPowerKwp"] : []),
        ...(productDependency === undefined ? ["solarPanelProduct"] : []),
      ];
      if (missing.length > 0) {
        return createModuleExecutionResult(
          { status: "BLOCKED", blockingIssues: pendingIssues(sectorId, missing) },
          validatedInput.executionSnapshot,
        );
      }

      if (requiredDependency === undefined || productDependency === undefined) {
        throw new SolarPanelSizingModuleTechnicalError(
          "required solar panel sizing dependencies could not be resolved",
        );
      }

      const blockedDependencies = [requiredDependency, productDependency]
        .filter((dependency): dependency is Readonly<IntermediateResult> => dependency !== undefined)
        .filter((dependency) =>
          dependency.value.status === ValidationStatus.PENDING ||
          dependency.value.status === ValidationStatus.BLOCKED ||
          dependency.value.status === ValidationStatus.INVALID ||
          dependency.value.status === ValidationStatus.OBSOLETE,
        );
      if (blockedDependencies.length > 0) {
        return createModuleExecutionResult(
          {
            status: "BLOCKED",
            blockingIssues: blockedDependencies.map((dependency) =>
              blockedDependencyIssue(dependency.value.identity.path),
            ),
          },
          validatedInput.executionSnapshot,
        );
      }

      if (productDependency.value.unit !== SOLAR_PANEL_POWER_UNIT) {
        return createModuleExecutionResult(
          {
            status: "BLOCKED",
            blockingIssues: [
              issue(
                "solarPanelSizing.product.unit.invalid",
                `solar panel nominal power must use unit ${SOLAR_PANEL_POWER_UNIT}`,
                solarPanelProductPath(sectorId),
              ),
            ],
          },
          validatedInput.executionSnapshot,
        );
      }

      const solarPanelProduct = productFromDependency(productDependency);
      if (solarPanelProduct === undefined) {
        return createModuleExecutionResult(
          {
            status: "BLOCKED",
            blockingIssues: [
              issue(
                "solarPanelSizing.product.missing",
                "validated solar panel product payload is required",
                solarPanelProductPath(sectorId),
              ),
            ],
          },
          validatedInput.executionSnapshot,
        );
      }

      try {
        const calculation = calculateSolarPanelSizing({
          sectorId,
          requiredPvPowerKwp: requiredDependency.value,
          solarPanelProduct,
          sourceRefs: sourceRefsFor(
            validatedInput.executionSnapshot.sourceRefs,
            validatedInput.dependencyResults,
          ),
        });

        if (calculation.status === "PENDING") {
          return createModuleExecutionResult(
            { status: "BLOCKED", blockingIssues: pendingIssues(sectorId, calculation.missingFields) },
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
                methodRef: SOLAR_PANEL_SIZING_METHOD_REF,
                dependencyRefs: [
                  requiredPvPowerPath(sectorId),
                  solarPanelProductPath(sectorId),
                ],
                value: calculation.panelCount,
              }),
              createIntermediateResult({
                executionId: validatedInput.executionSnapshot.identity.executionId,
                methodRef: SOLAR_PANEL_SIZING_METHOD_REF,
                dependencyRefs: [
                  requiredPvPowerPath(sectorId),
                  solarPanelProductPath(sectorId),
                ],
                value: calculation.installedPvPowerKwp,
              }),
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
              : "Solar panel sizing execution failed",
          },
          validatedInput.executionSnapshot,
        );
      }
    },
  });
}

export {
  INSTALLED_PV_POWER_UNIT,
  SOLAR_PANEL_COUNT_UNIT,
  SOLAR_PANEL_POWER_UNIT,
};
