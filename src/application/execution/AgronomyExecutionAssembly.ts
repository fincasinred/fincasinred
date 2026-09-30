import {
  createModuleExecutorRegistry,
  type ModuleExecutorRegistry,
} from "./ModuleExecutorRegistry.js";
import { createExecutionPlan, type ExecutionPlan } from "./ExecutionPlan.js";
import {
  AGRONOMY_ETC_MODULE_REF,
  createAgronomyEtcModuleExecutor,
} from "./AgronomyEtcModule.js";
import {
  AGRONOMY_EFFECTIVE_RAINFALL_MODULE_REF,
  createAgronomyEffectiveRainfallModuleExecutor,
} from "./AgronomyEffectiveRainfallModule.js";
import {
  AGRONOMY_NET_NEED_MODULE_REF,
  createAgronomyNetNeedModuleExecutor,
} from "./AgronomyNetNeedModule.js";
import {
  AGRONOMY_GROSS_NEED_MODULE_REF,
  createAgronomyGrossNeedModuleExecutor,
} from "./AgronomyGrossNeedModule.js";
import {
  AGRONOMY_SECTOR_VOLUME_MODULE_REF,
  createAgronomySectorVolumeModuleExecutor,
} from "./AgronomySectorVolumeModule.js";
import {
  HYDRAULIC_SECTOR_FLOW_MODULE_REF,
  createHydraulicSectorFlowModuleExecutor,
} from "./HydraulicSectorFlowModule.js";
import {
  IRRIGATION_DURATION_MODULE_REF,
  createIrrigationDurationModuleExecutor,
} from "./IrrigationDurationModule.js";

/** Referencias de módulo de la cadena agronómica completa. */
export const AGRONOMY_EXECUTION_MODULE_REFS = Object.freeze([
  AGRONOMY_ETC_MODULE_REF,
  AGRONOMY_EFFECTIVE_RAINFALL_MODULE_REF,
  AGRONOMY_NET_NEED_MODULE_REF,
  AGRONOMY_GROSS_NEED_MODULE_REF,
  AGRONOMY_SECTOR_VOLUME_MODULE_REF,
]);

export interface AgronomyExecutionAssemblyOptions {
  readonly sectorId?: string;
}

export function createAgronomyExecutionRegistry(
  options: AgronomyExecutionAssemblyOptions = {},
): Readonly<ModuleExecutorRegistry> {
  const sectorRegistrations = options.sectorId === undefined
    ? []
    : [
        {
          moduleRef: `${HYDRAULIC_SECTOR_FLOW_MODULE_REF}${options.sectorId}`,
          executor: createHydraulicSectorFlowModuleExecutor(),
        },
        {
          moduleRef: `${IRRIGATION_DURATION_MODULE_REF}${options.sectorId}`,
          executor: createIrrigationDurationModuleExecutor(),
        },
      ];

  return createModuleExecutorRegistry({
    registrations: [
      {
        moduleRef: AGRONOMY_ETC_MODULE_REF,
        executor: createAgronomyEtcModuleExecutor(),
      },
      {
        moduleRef: AGRONOMY_EFFECTIVE_RAINFALL_MODULE_REF,
        executor: createAgronomyEffectiveRainfallModuleExecutor(),
      },
      {
        moduleRef: AGRONOMY_NET_NEED_MODULE_REF,
        executor: createAgronomyNetNeedModuleExecutor(),
      },
      {
        moduleRef: AGRONOMY_GROSS_NEED_MODULE_REF,
        executor: createAgronomyGrossNeedModuleExecutor(),
      },
      {
        moduleRef: AGRONOMY_SECTOR_VOLUME_MODULE_REF,
        executor: createAgronomySectorVolumeModuleExecutor(),
      },
      ...sectorRegistrations,
    ],
  });
}

export interface AgronomyExecutionPlanOptions {
  readonly includeSectorVolume?: boolean;
  readonly sectorId?: string;
}

export function createAgronomyExecutionPlan(
  options: AgronomyExecutionPlanOptions = {},
): Readonly<ExecutionPlan> {
  const includeSectorVolume = options.includeSectorVolume ?? true;
  const sectorModuleRefs = options.sectorId === undefined
    ? []
    : [
        `${HYDRAULIC_SECTOR_FLOW_MODULE_REF}${options.sectorId}`,
        `${IRRIGATION_DURATION_MODULE_REF}${options.sectorId}`,
      ];
  const moduleRefs = Object.freeze([
    ...(includeSectorVolume
      ? AGRONOMY_EXECUTION_MODULE_REFS
      : AGRONOMY_EXECUTION_MODULE_REFS.filter(
          (moduleRef) => moduleRef !== AGRONOMY_SECTOR_VOLUME_MODULE_REF,
        )),
    ...sectorModuleRefs,
  ]);

  return createExecutionPlan({
    moduleRefs,
    dependencyGraph: {
      dependencies: [
        {
          moduleRef: AGRONOMY_NET_NEED_MODULE_REF,
          dependsOnModuleRef: AGRONOMY_ETC_MODULE_REF,
        },
        {
          moduleRef: AGRONOMY_NET_NEED_MODULE_REF,
          dependsOnModuleRef: AGRONOMY_EFFECTIVE_RAINFALL_MODULE_REF,
        },
        {
          moduleRef: AGRONOMY_GROSS_NEED_MODULE_REF,
          dependsOnModuleRef: AGRONOMY_NET_NEED_MODULE_REF,
        },
        ...(includeSectorVolume
          ? [
              {
                moduleRef: AGRONOMY_SECTOR_VOLUME_MODULE_REF,
                dependsOnModuleRef: AGRONOMY_GROSS_NEED_MODULE_REF,
              },
            ]
          : []),
        ...(options.sectorId === undefined || !includeSectorVolume
          ? []
          : [
              {
                moduleRef: `${IRRIGATION_DURATION_MODULE_REF}${options.sectorId}`,
                dependsOnModuleRef: AGRONOMY_SECTOR_VOLUME_MODULE_REF,
              },
              {
                moduleRef: `${IRRIGATION_DURATION_MODULE_REF}${options.sectorId}`,
                dependsOnModuleRef: `${HYDRAULIC_SECTOR_FLOW_MODULE_REF}${options.sectorId}`,
              },
            ]),
      ],
    },
  });
}
