import type {
  AutomationMode,
  EnergySource,
  HydraulicMode,
  ProjectTechnicalIntent,
} from "./ProjectTechnicalIntent.js";

export interface ProjectTechnicalIntentBranches {
  readonly hydraulicMode: HydraulicMode;
  readonly energySource?: EnergySource;
  readonly automation: AutomationMode;
  readonly hydraulic: Readonly<{
    readonly gravity: boolean;
    readonly waterNetwork: boolean;
    readonly pumping: boolean;
  }>;
  readonly energy: Readonly<{
    readonly common: boolean;
    readonly solar: boolean;
    readonly battery: boolean;
    readonly generator: boolean;
  }>;
}

export function deriveProjectTechnicalIntentBranches(
  intent: Readonly<ProjectTechnicalIntent>,
): Readonly<ProjectTechnicalIntentBranches> {
  const hydraulic = Object.freeze({
    gravity: intent.hydraulicMode === "GRAVITY",
    waterNetwork: intent.hydraulicMode === "WATER_NETWORK",
    pumping: intent.hydraulicMode === "PUMP",
  });

  const isPump = intent.hydraulicMode === "PUMP";
  const energy = Object.freeze({
    common: isPump,
    solar: isPump && intent.energySource === "SOLAR",
    battery: isPump && intent.energySource === "BATTERY",
    generator: false,
  });

  return Object.freeze({
    hydraulicMode: intent.hydraulicMode,
    ...(isPump ? { energySource: intent.energySource } : {}),
    automation: intent.automation,
    hydraulic,
    energy,
  });
}
