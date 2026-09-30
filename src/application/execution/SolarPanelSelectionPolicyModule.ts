import {
  createIntermediateResult,
} from "./IntermediateResult.js";
import {
  createModuleExecutionResult,
  createModuleExecutorInput,
  type ModuleExecutionResult,
  type ModuleExecutor,
  type ModuleExecutorInput,
} from "./ModuleExecutor.js";
import type { ValidationIssue } from "../validation/ValidationResult.js";

export const SOLAR_PANEL_SELECTION_POLICY_MODULE_REF =
  "module.energy.solar-panel-selection-policy:";
export const SOLAR_PANEL_SELECTION_POLICY_METHOD_REF =
  "energy.prepare_solar_panel_selection_policy";
export const SOLAR_PANEL_SELECTION_POLICY_PATH_SUFFIX =
  "solarPanelSelectionPolicy";

export function solarPanelSelectionPolicyModuleRef(sectorId: string): string {
  return `${SOLAR_PANEL_SELECTION_POLICY_MODULE_REF}${sectorId}`;
}

export function solarPanelSelectionPolicyPath(sectorId: string): string {
  return `energy.${sectorId}.${SOLAR_PANEL_SELECTION_POLICY_PATH_SUFFIX}`;
}

export class SolarPanelSelectionPolicyModuleTechnicalError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "SolarPanelSelectionPolicyModuleTechnicalError";
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
  if (!moduleRef.startsWith(SOLAR_PANEL_SELECTION_POLICY_MODULE_REF)) {
    throw new SolarPanelSelectionPolicyModuleTechnicalError(
      `moduleRef must start with ${SOLAR_PANEL_SELECTION_POLICY_MODULE_REF}`,
    );
  }

  const sectorId = moduleRef.slice(SOLAR_PANEL_SELECTION_POLICY_MODULE_REF.length);
  if (sectorId.trim().length === 0 || sectorId.includes(".")) {
    throw new SolarPanelSelectionPolicyModuleTechnicalError(
      "moduleRef must include one valid sectorId",
    );
  }

  return sectorId;
}

function dependencyRefsFor(
  source: Extract<
    NonNullable<ModuleExecutorInput["initialSolarPanelSelectionPolicySource"]>,
    { readonly status: "AVAILABLE" }
  >,
): readonly string[] {
  return Object.freeze([
    source.policyId,
    source.policyVersion,
    ...(source.evidence?.sourceReference === undefined
      ? []
      : [source.evidence.sourceReference]),
    ...(source.evidence?.evidenceReference === undefined
      ? []
      : [source.evidence.evidenceReference]),
  ]);
}

export function createSolarPanelSelectionPolicyModuleExecutor(): Readonly<ModuleExecutor> {
  return Object.freeze({
    async execute(
      input: Readonly<ModuleExecutorInput>,
    ): Promise<Readonly<ModuleExecutionResult>> {
      const validatedInput = createModuleExecutorInput(input);
      const sectorId = sectorIdFromModuleRef(validatedInput.moduleRef);
      const path = solarPanelSelectionPolicyPath(sectorId);
      const source = validatedInput.initialSolarPanelSelectionPolicySource;

      if (source === undefined || source.status === "ABSENT") {
        return createModuleExecutionResult(
          {
            status: "BLOCKED",
            blockingIssues: [
              issue(
                "solarPanelSelectionPolicyModule.policy.absent",
                "an available initial solar panel selection policy source is required",
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
                "solarPanelSelectionPolicyModule.policy.blocked",
                source.issue,
                path,
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
              methodRef: SOLAR_PANEL_SELECTION_POLICY_METHOD_REF,
              identityPath: path,
              dependencyRefs: dependencyRefsFor(source),
              payload: {
                solarPanelSelectionPolicy: source.policy,
              },
            }),
          ],
        },
        validatedInput.executionSnapshot,
      );
    },
  });
}
