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
import type { SolarPanelCandidatesPreparationResult } from "./SolarPanelCandidatesPreparationContract.js";
import type {
  ProductCatalogTraceability,
  SolarPanelCandidatesResult,
} from "../../domain/catalog/ProductCatalog.js";
import type { ValidationIssue } from "../validation/ValidationResult.js";

export const SOLAR_PANEL_CANDIDATES_MODULE_REF =
  "module.energy.solar-panel-candidates:";
export const SOLAR_PANEL_CANDIDATES_METHOD_REF =
  "energy.prepare_solar_panel_candidates";
export const SOLAR_PANEL_CANDIDATES_PATH_SUFFIX = "solarPanelCandidates";

export function solarPanelCandidatesModuleRef(sectorId: string): string {
  return `${SOLAR_PANEL_CANDIDATES_MODULE_REF}${sectorId}`;
}

export function solarPanelCandidatesPath(sectorId: string): string {
  return `energy.${sectorId}.${SOLAR_PANEL_CANDIDATES_PATH_SUFFIX}`;
}

export class SolarPanelCandidatesModuleTechnicalError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "SolarPanelCandidatesModuleTechnicalError";
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
  if (!moduleRef.startsWith(SOLAR_PANEL_CANDIDATES_MODULE_REF)) {
    throw new SolarPanelCandidatesModuleTechnicalError(
      `moduleRef must start with ${SOLAR_PANEL_CANDIDATES_MODULE_REF}`,
    );
  }

  const sectorId = moduleRef.slice(SOLAR_PANEL_CANDIDATES_MODULE_REF.length);
  if (sectorId.trim().length === 0 || sectorId.includes(".")) {
    throw new SolarPanelCandidatesModuleTechnicalError(
      "moduleRef must include one valid sectorId",
    );
  }

  return sectorId;
}

function sourceRefsFor(
  catalogVersion: string,
  technicalSource: Readonly<{
    readonly documentReference: string;
    readonly sourceUrl: string;
  }>,
  traceability: readonly ProductCatalogTraceability[],
): readonly string[] {
  return Object.freeze([
    catalogVersion,
    technicalSource.documentReference,
    technicalSource.sourceUrl,
    ...traceability.flatMap((item) => [
      item.technicalSource.documentReference,
      item.technicalSource.sourceUrl,
    ]),
  ]);
}

function preparedCandidatesResult(
  catalog: NonNullable<
    Extract<
      NonNullable<ModuleExecutorInput["initialCatalogSource"]>,
      { readonly status: "AVAILABLE" }
    >["catalog"]
  >,
  technicalSource: NonNullable<
    Extract<
      NonNullable<ModuleExecutorInput["initialCatalogSource"]>,
      { readonly status: "AVAILABLE" }
    >["technicalSource"]
  >,
  candidates: Extract<SolarPanelCandidatesResult, { readonly status: "VALIDATED" }>,
): Readonly<SolarPanelCandidatesPreparationResult> {
  const sourceRefs = sourceRefsFor(
    catalog.catalogVersion,
    technicalSource,
    candidates.traceability,
  );

  return Object.freeze({
    status: "PENDING",
    dependencies: Object.freeze({
      catalog,
      catalogVersion: catalog.catalogVersion,
      candidates: Object.freeze([...candidates.products]),
      productIds: Object.freeze([...candidates.productIds]),
      traceability: Object.freeze([...candidates.traceability]),
    }),
    dependencyRefs: Object.freeze([
      catalog.catalogVersion,
      ...candidates.productIds,
    ]),
    sourceRefs,
    missingFields: Object.freeze([]),
    issues: Object.freeze([]),
  });
}

function payloadResult(
  executionId: string,
  identityPath: string,
  preparedCandidates: Readonly<SolarPanelCandidatesPreparationResult>,
): Readonly<IntermediateResult> {
  return createIntermediateResult({
    executionId,
    methodRef: SOLAR_PANEL_CANDIDATES_METHOD_REF,
    identityPath,
    dependencyRefs: preparedCandidates.dependencyRefs,
    payload: { solarPanelCandidates: preparedCandidates },
  });
}

export function createSolarPanelCandidatesModuleExecutor(): Readonly<ModuleExecutor> {
  return Object.freeze({
    async execute(
      input: Readonly<ModuleExecutorInput>,
    ): Promise<Readonly<ModuleExecutionResult>> {
      const validatedInput = createModuleExecutorInput(input);
      const sectorId = sectorIdFromModuleRef(validatedInput.moduleRef);
      const path = solarPanelCandidatesPath(sectorId);
      const source = validatedInput.initialCatalogSource;

      if (source === undefined || source.status === "ABSENT") {
        return createModuleExecutionResult(
          {
            status: "BLOCKED",
            blockingIssues: [
              issue(
                "solarPanelCandidatesModule.catalog.absent",
                "an available initial catalog source is required",
                path,
              ),
            ],
          },
          validatedInput.executionSnapshot,
        );
      }

      if (source.status === "BLOCKED") {
        return createModuleExecutionResult(
          {
            status: "BLOCKED",
            blockingIssues: [
              issue(
                "solarPanelCandidatesModule.catalog.blocked",
                source.issue,
                path,
              ),
            ],
          },
          validatedInput.executionSnapshot,
        );
      }

      try {
        const candidates = source.catalog.findSolarPanelCandidates();
        if (candidates.status === "PENDING") {
          return createModuleExecutionResult(
            {
              status: "BLOCKED",
              blockingIssues: [
                issue(
                  "solarPanelCandidatesModule.candidates.pending",
                  "the catalog has no validated solar panel candidates",
                  path,
                ),
              ],
            },
            validatedInput.executionSnapshot,
          );
        }

        const preparedCandidates = preparedCandidatesResult(
          source.catalog,
          source.technicalSource,
          candidates,
        );

        return createModuleExecutionResult(
          {
            status: "COMPLETED",
            intermediateResults: [
              payloadResult(
                validatedInput.executionSnapshot.identity.executionId,
                path,
                preparedCandidates,
              ),
            ],
          },
          validatedInput.executionSnapshot,
        );
      } catch (error) {
        return createModuleExecutionResult(
          {
            status: "BLOCKED",
            blockingIssues: [
              issue(
                "solarPanelCandidatesModule.candidates.blocked",
                error instanceof Error
                  ? error.message
                  : "solar panel candidates could not be obtained",
                path,
              ),
            ],
          },
          validatedInput.executionSnapshot,
        );
      }
    },
  });
}
