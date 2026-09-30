export const HYDRAULIC_MODES = Object.freeze([
  "GRAVITY",
  "WATER_NETWORK",
  "PUMP",
] as const);

export const ENERGY_SOURCES = Object.freeze([
  "GRID",
  "SOLAR",
  "BATTERY",
  "GENERATOR",
] as const);

export const AUTOMATION_MODES = Object.freeze(["YES", "NO"] as const);

export type HydraulicMode = (typeof HYDRAULIC_MODES)[number];
export type EnergySource = (typeof ENERGY_SOURCES)[number];
export type AutomationMode = (typeof AUTOMATION_MODES)[number];

interface ProjectTechnicalIntentBase {
  readonly automation: AutomationMode;
}

export type ProjectTechnicalIntent =
  | (ProjectTechnicalIntentBase & {
      readonly hydraulicMode: "GRAVITY";
    })
  | (ProjectTechnicalIntentBase & {
      readonly hydraulicMode: "WATER_NETWORK";
    })
  | (ProjectTechnicalIntentBase & {
      readonly hydraulicMode: "PUMP";
      readonly energySource: EnergySource;
    });

export class ProjectTechnicalIntentError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ProjectTechnicalIntentError";
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function isValueIn<const Values extends readonly string[]>(
  values: Values,
  value: unknown,
): value is Values[number] {
  return typeof value === "string" && values.includes(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function createProjectTechnicalIntent(
  input: unknown,
): Readonly<ProjectTechnicalIntent> {
  if (!isPlainRecord(input)) {
    throw new ProjectTechnicalIntentError("intent must be an object");
  }

  if (!isValueIn(AUTOMATION_MODES, input.automation)) {
    throw new ProjectTechnicalIntentError(
      "automation must be YES or NO",
    );
  }

  if (!isValueIn(HYDRAULIC_MODES, input.hydraulicMode)) {
    throw new ProjectTechnicalIntentError(
      "hydraulicMode must be GRAVITY, WATER_NETWORK, or PUMP",
    );
  }

  if (input.hydraulicMode === "PUMP") {
    if (!isValueIn(ENERGY_SOURCES, input.energySource)) {
      throw new ProjectTechnicalIntentError(
        "energySource must be GRID, SOLAR, BATTERY, or GENERATOR for PUMP",
      );
    }

    return Object.freeze({
      hydraulicMode: input.hydraulicMode,
      energySource: input.energySource,
      automation: input.automation,
    });
  }

  if (hasOwn(input, "energySource")) {
    throw new ProjectTechnicalIntentError(
      "energySource is not allowed unless hydraulicMode is PUMP",
    );
  }

  return Object.freeze({
    hydraulicMode: input.hydraulicMode,
    automation: input.automation,
  });
}