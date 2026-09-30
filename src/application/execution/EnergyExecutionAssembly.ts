import {
  createModuleExecutorRegistry,
  type ModuleExecutorRegistry,
} from "./ModuleExecutorRegistry.js";
import { createExecutionPlan, type ExecutionPlan } from "./ExecutionPlan.js";
import {
  ENERGY_CALCULATION_MODULE_REF,
  createEnergyCalculationModuleExecutor,
} from "./EnergyCalculationModule.js";
import {
  HYDRAULIC_POWER_MODULE_REF,
  createHydraulicPowerModuleExecutor,
} from "./HydraulicPowerModule.js";
import {
  IRRIGATION_DURATION_MODULE_REF,
  createIrrigationDurationModuleExecutor,
} from "./IrrigationDurationModule.js";
import {
  IRRIGATION_DURATION_ENERGY_ADAPTER_MODULE_REF,
  createIrrigationDurationEnergyAdapterModuleExecutor,
} from "./IrrigationDurationEnergyAdapterModule.js";
import {
  SOLAR_SIZING_MODULE_REF,
  createSolarSizingModuleExecutor,
} from "./SolarSizingModule.js";
import {
  SOLAR_PANEL_CANDIDATES_MODULE_REF,
  createSolarPanelCandidatesModuleExecutor,
} from "./SolarPanelCandidatesModule.js";
import {
  SOLAR_PANEL_SELECTION_POLICY_MODULE_REF,
  createSolarPanelSelectionPolicyModuleExecutor,
} from "./SolarPanelSelectionPolicyModule.js";
import {
  SOLAR_PANEL_SELECTION_MODULE_REF,
  createSolarPanelSelectionModuleExecutor,
} from "./SolarPanelSelectionModule.js";
import {
  BATTERY_SIZING_MODULE_REF,
  createBatterySizingModuleExecutor,
} from "./BatterySizingModule.js";
import {
  ENERGY_TO_BATTERY_PREPARATION_MODULE_REF,
  createEnergyToBatteryPreparationModuleExecutor,
} from "./EnergyToBatteryPreparationModule.js";
import {
  createSolarPanelSizingModuleExecutor,
  solarPanelSizingModuleRef as solarPanelSizingModuleRefFromModule,
} from "./SolarPanelSizingModule.js";
import type { ProjectTechnicalIntentBranches } from "./ProjectTechnicalIntentBranches.js";

export interface EnergyExecutionAssemblyOptions {
  readonly sectorId: string;
  readonly activeBranches?: Readonly<ProjectTechnicalIntentBranches>;
}

export interface EnergyExecutionAssembly {
  readonly hydraulicPowerModuleRef?: string;
  readonly irrigationDurationModuleRef?: string;
  readonly operatingTimeAdapterModuleRef?: string;
  readonly energyCalculationModuleRef?: string;
  readonly energyToBatteryPreparationModuleRef?: string;
  readonly solarSizingModuleRef?: string;
  readonly solarPanelCandidatesModuleRef?: string;
  readonly solarPanelSelectionPolicyModuleRef?: string;
  readonly solarPanelSelectionModuleRef?: string;
  readonly solarPanelSizingModuleRef?: string;
  readonly batterySizingModuleRef?: string;
  readonly registry: Readonly<ModuleExecutorRegistry>;
  readonly executionPlan: Readonly<ExecutionPlan>;
}

const LEGACY_ACTIVE_BRANCHES: Readonly<ProjectTechnicalIntentBranches> =
  Object.freeze({
    hydraulicMode: "PUMP",
    energySource: "GRID",
    automation: "NO",
    hydraulic: Object.freeze({
      gravity: false,
      waterNetwork: false,
      pumping: true,
    }),
    energy: Object.freeze({
      common: true,
      solar: true,
      battery: true,
      generator: false,
    }),
  });

function activeBranchesFrom(
  options: EnergyExecutionAssemblyOptions,
): Readonly<ProjectTechnicalIntentBranches> {
  return options.activeBranches ?? LEGACY_ACTIVE_BRANCHES;
}

function requireSectorId(sectorId: string): string {
  if (typeof sectorId !== "string" || sectorId.trim().length === 0) {
    throw new Error("sectorId is required");
  }

  return sectorId;
}

export function energyHydraulicPowerModuleRef(sectorId: string): string {
  return `${HYDRAULIC_POWER_MODULE_REF}${requireSectorId(sectorId)}`;
}

export function energyCalculationModuleRef(sectorId: string): string {
  return `${ENERGY_CALCULATION_MODULE_REF}${requireSectorId(sectorId)}`;
}

export function energyToBatteryPreparationModuleRef(sectorId: string): string {
  return `${ENERGY_TO_BATTERY_PREPARATION_MODULE_REF}${requireSectorId(sectorId)}`;
}

export function irrigationDurationModuleRef(sectorId: string): string {
  return `${IRRIGATION_DURATION_MODULE_REF}${requireSectorId(sectorId)}`;
}

export function operatingTimeAdapterModuleRef(sectorId: string): string {
  return `${IRRIGATION_DURATION_ENERGY_ADAPTER_MODULE_REF}${requireSectorId(sectorId)}`;
}

export function solarSizingModuleRef(sectorId: string): string {
  return `${SOLAR_SIZING_MODULE_REF}${requireSectorId(sectorId)}`;
}

export function batterySizingModuleRef(sectorId: string): string {
  return `${BATTERY_SIZING_MODULE_REF}${requireSectorId(sectorId)}`;
}

export function solarPanelCandidatesModuleRef(sectorId: string): string {
  return `${SOLAR_PANEL_CANDIDATES_MODULE_REF}${requireSectorId(sectorId)}`;
}

export function solarPanelSelectionPolicyModuleRef(sectorId: string): string {
  return `${SOLAR_PANEL_SELECTION_POLICY_MODULE_REF}${requireSectorId(sectorId)}`;
}

export function solarPanelSelectionModuleRef(sectorId: string): string {
  return `${SOLAR_PANEL_SELECTION_MODULE_REF}${requireSectorId(sectorId)}`;
}

export function solarPanelSizingModuleRef(sectorId: string): string {
  return solarPanelSizingModuleRefFromModule(requireSectorId(sectorId));
}

export function createEnergyExecutionRegistry(
  options: EnergyExecutionAssemblyOptions,
): Readonly<ModuleExecutorRegistry> {
  const sectorId = requireSectorId(options.sectorId);
  const activeBranches = activeBranchesFrom(options);
  const registrations = [
    ...(activeBranches.hydraulic.pumping
      ? [
          {
            moduleRef: energyHydraulicPowerModuleRef(sectorId),
            executor: createHydraulicPowerModuleExecutor(),
          },
          {
            moduleRef: irrigationDurationModuleRef(sectorId),
            executor: createIrrigationDurationModuleExecutor(),
          },
          {
            moduleRef: operatingTimeAdapterModuleRef(sectorId),
            executor: createIrrigationDurationEnergyAdapterModuleExecutor(),
          },
          {
            moduleRef: energyCalculationModuleRef(sectorId),
            executor: createEnergyCalculationModuleExecutor(),
          },
        ]
      : []),
    ...(activeBranches.energy.battery
      ? [
          {
            moduleRef: energyToBatteryPreparationModuleRef(sectorId),
            executor: createEnergyToBatteryPreparationModuleExecutor(),
          },
          {
            moduleRef: batterySizingModuleRef(sectorId),
            executor: createBatterySizingModuleExecutor(),
          },
        ]
      : []),
    ...(activeBranches.energy.solar
      ? [
          {
            moduleRef: solarSizingModuleRef(sectorId),
            executor: createSolarSizingModuleExecutor(),
          },
          {
            moduleRef: solarPanelCandidatesModuleRef(sectorId),
            executor: createSolarPanelCandidatesModuleExecutor(),
          },
          {
            moduleRef: solarPanelSelectionPolicyModuleRef(sectorId),
            executor: createSolarPanelSelectionPolicyModuleExecutor(),
          },
          {
            moduleRef: solarPanelSelectionModuleRef(sectorId),
            executor: createSolarPanelSelectionModuleExecutor(),
          },
          {
            moduleRef: solarPanelSizingModuleRef(sectorId),
            executor: createSolarPanelSizingModuleExecutor(),
          },
        ]
      : []),
  ];

  return createModuleExecutorRegistry({
    registrations,
  });
}

export function createEnergyExecutionPlan(
  options: EnergyExecutionAssemblyOptions,
): Readonly<ExecutionPlan> {
  const sectorId = requireSectorId(options.sectorId);
  const activeBranches = activeBranchesFrom(options);
  const hydraulicPowerModuleRef = energyHydraulicPowerModuleRef(sectorId);
  const durationModuleRef = irrigationDurationModuleRef(sectorId);
  const operatingTimeModuleRef = operatingTimeAdapterModuleRef(sectorId);
  const energyModuleRef = energyCalculationModuleRef(sectorId);
  const energyToBatteryRef = energyToBatteryPreparationModuleRef(sectorId);
  const solarSizingRef = solarSizingModuleRef(sectorId);
  const solarPanelCandidatesRef = solarPanelCandidatesModuleRef(sectorId);
  const solarPanelSelectionPolicyRef = solarPanelSelectionPolicyModuleRef(sectorId);
  const solarPanelSelectionRef = solarPanelSelectionModuleRef(sectorId);
  const solarPanelSizingRef = solarPanelSizingModuleRef(sectorId);
  const batterySizingRef = batterySizingModuleRef(sectorId);
  const commonModuleRefs = activeBranches.hydraulic.pumping
    ? [
        hydraulicPowerModuleRef,
        durationModuleRef,
        operatingTimeModuleRef,
        energyModuleRef,
      ]
    : [];
  const batteryModuleRefs = activeBranches.energy.battery
    ? [energyToBatteryRef, batterySizingRef]
    : [];
  const solarModuleRefs = activeBranches.energy.solar
    ? [
        solarSizingRef,
        solarPanelCandidatesRef,
        solarPanelSelectionPolicyRef,
        solarPanelSelectionRef,
        solarPanelSizingRef,
      ]
    : [];

  return createExecutionPlan({
    moduleRefs: [...commonModuleRefs, ...batteryModuleRefs, ...solarModuleRefs],
    dependencyGraph: {
      dependencies: [
        ...(activeBranches.hydraulic.pumping
          ? [
              {
                moduleRef: operatingTimeModuleRef,
                dependsOnModuleRef: durationModuleRef,
              },
              {
                moduleRef: energyModuleRef,
                dependsOnModuleRef: hydraulicPowerModuleRef,
              },
              {
                moduleRef: energyModuleRef,
                dependsOnModuleRef: operatingTimeModuleRef,
              },
            ]
          : []),
        ...(activeBranches.energy.battery
          ? [
              {
                moduleRef: energyToBatteryRef,
                dependsOnModuleRef: energyModuleRef,
              },
              {
                moduleRef: batterySizingRef,
                dependsOnModuleRef: energyToBatteryRef,
              },
            ]
          : []),
        ...(activeBranches.energy.solar
          ? [
              {
                moduleRef: solarSizingRef,
                dependsOnModuleRef: energyModuleRef,
              },
              {
                moduleRef: solarPanelSelectionRef,
                dependsOnModuleRef: solarSizingRef,
              },
              {
                moduleRef: solarPanelSelectionRef,
                dependsOnModuleRef: solarPanelCandidatesRef,
              },
              {
                moduleRef: solarPanelSelectionRef,
                dependsOnModuleRef: solarPanelSelectionPolicyRef,
              },
              {
                moduleRef: solarPanelSizingRef,
                dependsOnModuleRef: solarPanelSelectionRef,
              },
            ]
          : []),
      ],
    },
  });
}

export function createEnergyExecutionAssembly(
  options: EnergyExecutionAssemblyOptions,
): Readonly<EnergyExecutionAssembly> {
  const sectorId = requireSectorId(options.sectorId);
  const activeBranches = activeBranchesFrom(options);
  const hydraulicPowerModuleRef = energyHydraulicPowerModuleRef(sectorId);
  const irrigationDurationModuleRefValue = irrigationDurationModuleRef(sectorId);
  const operatingTimeAdapterModuleRefValue = operatingTimeAdapterModuleRef(sectorId);
  const energyCalculationModuleRefValue = energyCalculationModuleRef(sectorId);
  const energyToBatteryPreparationModuleRefValue =
    energyToBatteryPreparationModuleRef(sectorId);
  const solarSizingModuleRefValue = solarSizingModuleRef(sectorId);
  const solarPanelCandidatesModuleRefValue = solarPanelCandidatesModuleRef(sectorId);
  const solarPanelSelectionPolicyModuleRefValue = solarPanelSelectionPolicyModuleRef(sectorId);
  const solarPanelSelectionModuleRefValue = solarPanelSelectionModuleRef(sectorId);
  const solarPanelSizingModuleRefValue = solarPanelSizingModuleRef(sectorId);
  const batterySizingModuleRefValue = batterySizingModuleRef(sectorId);

  return Object.freeze({
    ...(activeBranches.hydraulic.pumping
      ? {
          hydraulicPowerModuleRef,
          irrigationDurationModuleRef: irrigationDurationModuleRefValue,
          operatingTimeAdapterModuleRef: operatingTimeAdapterModuleRefValue,
          energyCalculationModuleRef: energyCalculationModuleRefValue,
        }
      : {}),
    ...(activeBranches.energy.battery
      ? {
          energyToBatteryPreparationModuleRef:
            energyToBatteryPreparationModuleRefValue,
          batterySizingModuleRef: batterySizingModuleRefValue,
        }
      : {}),
    ...(activeBranches.energy.solar
      ? {
          solarSizingModuleRef: solarSizingModuleRefValue,
          solarPanelCandidatesModuleRef: solarPanelCandidatesModuleRefValue,
          solarPanelSelectionPolicyModuleRef:
            solarPanelSelectionPolicyModuleRefValue,
          solarPanelSelectionModuleRef: solarPanelSelectionModuleRefValue,
          solarPanelSizingModuleRef: solarPanelSizingModuleRefValue,
        }
      : {}),
    registry: createEnergyExecutionRegistry({ sectorId, activeBranches }),
    executionPlan: createEnergyExecutionPlan({ sectorId, activeBranches }),
  });
}
