import {
  createProjectTechnicalIntent,
  type ProjectTechnicalIntent,
} from "./ProjectTechnicalIntent.js";
import {
  deriveProjectTechnicalIntentBranches,
  type ProjectTechnicalIntentBranches,
} from "./ProjectTechnicalIntentBranches.js";

export interface ProjectTechnicalIntentAdapterInput {
  readonly solucionAgua?: unknown;
  readonly energia?: unknown;
  readonly automatizacion?: unknown;
}

export interface ProjectTechnicalIntentAdapterResult {
  readonly intent: Readonly<ProjectTechnicalIntent>;
  readonly branches: Readonly<ProjectTechnicalIntentBranches>;
}

export class ProjectTechnicalIntentAdapterError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ProjectTechnicalIntentAdapterError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mapHydraulicMode(value: unknown): "GRAVITY" | "WATER_NETWORK" | "PUMP" {
  switch (value) {
    case "gravedad":
      return "GRAVITY";
    case "red":
      return "WATER_NETWORK";
    case "bomba":
      return "PUMP";
    default:
      throw new ProjectTechnicalIntentAdapterError(
        "solucionAgua must be gravedad, bomba, or red",
      );
  }
}

function mapEnergySource(
  value: unknown,
): "GRID" | "SOLAR" | "BATTERY" | "GENERATOR" {
  switch (value) {
    case "red":
      return "GRID";
    case "solar":
      return "SOLAR";
    case "bateria":
      return "BATTERY";
    case "generador":
      return "GENERATOR";
    default:
      throw new ProjectTechnicalIntentAdapterError(
        "energia must be red, solar, bateria, or generador for bomba",
      );
  }
}

function mapAutomation(value: unknown): "YES" | "NO" {
  switch (value) {
    case "si":
      return "YES";
    case "no":
      return "NO";
    default:
      throw new ProjectTechnicalIntentAdapterError(
        "automatizacion must be si or no",
      );
  }
}

export function adaptProjectTechnicalIntent(
  input: Readonly<ProjectTechnicalIntentAdapterInput>,
): Readonly<ProjectTechnicalIntentAdapterResult> {
  if (!isRecord(input)) {
    throw new ProjectTechnicalIntentAdapterError("PASO 6 data must be an object");
  }

  const hydraulicMode = mapHydraulicMode(input.solucionAgua);
  const automation = mapAutomation(input.automatizacion);

  if (hydraulicMode === "PUMP") {
    if (input.energia === undefined || input.energia === null) {
      throw new ProjectTechnicalIntentAdapterError(
        "energia is required when solucionAgua is bomba",
      );
    }

    const intent = createProjectTechnicalIntent({
      hydraulicMode,
      energySource: mapEnergySource(input.energia),
      automation,
    });

    return Object.freeze({
      intent,
      branches: deriveProjectTechnicalIntentBranches(intent),
    });
  }

  if (input.energia !== undefined && input.energia !== null) {
    throw new ProjectTechnicalIntentAdapterError(
      "energia is only allowed when solucionAgua is bomba",
    );
  }

  const intent = createProjectTechnicalIntent({
    hydraulicMode,
    automation,
  });

  return Object.freeze({
    intent,
    branches: deriveProjectTechnicalIntentBranches(intent),
  });
}
