import type {
  ProjectDomainData,
  ProjectTechnicalDomains,
} from "../../domain/project/Project.js";
import type { ProjectTechnicalData } from "../../domain/project/ProjectModel.js";
import { Provenance } from "../../domain/shared/Provenance.js";
import { ValidationStatus } from "../../domain/shared/ValidationStatus.js";
import { createIdentifiedTechnicalValue } from "../../domain/shared/TechnicalValue.js";
import {
  IrrigationSystemKind,
  type IrrigationSystemDescriptor,
} from "../../../engine/domain/agronomy/IrrigationSystemEfficiencyContract.js";

/**
 * Entradas del motor que esta misión NO puede rellenar todavía porque
 * PASO.1–PASO.6 no las recogen hoy. Se listan por su nombre técnico, no se
 * inventa ningún valor para ellas.
 */
export const AGRONOMY_ENGINE_PENDING_INPUTS = Object.freeze([
  "eto",
  "kc",
  "rainfall",
  "effectiveRainfall",
  "period",
  "irrigationSystemEfficiency.efficiency",
]);

/**
 * Datos que PASO.1-PASO.6 no determinan y que son necesarios antes de
 * construir los emitterGroups consumidos por SectorFlowEvaluation.
 */
export const HYDRAULIC_EMITTER_ENGINE_PENDING_INPUTS = Object.freeze([
  "hydraulic.sectorization.sectorIds",
  "hydraulic.sector.emitterGroups",
  "hydraulic.sector.emitterCatalogSelection",
  "hydraulic.sector.operatingPressure",
]);

/**
 * Forma tal cual se guarda cada paso en sessionStorage. Son objetos sueltos
 * (JSON.parse de lo ya guardado); esta misión no cambia esos formularios.
 */
export interface ProjectStepsInput {
  readonly step1?: unknown;
  readonly step2?: unknown;
  readonly step3?: unknown;
  readonly step4?: unknown;
  readonly step5?: unknown;
  readonly step6?: unknown;
}

export interface ProjectStepsAdapterResult {
  /** Datos ya introducidos por el usuario, reutilizando los dominios ya
   *  existentes en ProjectTechnicalDomains (sin nueva arquitectura). */
  readonly technicalData: ProjectTechnicalData;
  /** Único dato técnico del motor mapeable hoy desde los pasos (PASO.5). */
  readonly irrigationSystem?: IrrigationSystemDescriptor;
  /** Entradas que el motor necesita y que los pasos actuales no proporcionan. */
  readonly pendingEngineInputs: readonly string[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function toDomainData(value: unknown): ProjectDomainData | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isPlainRecord(value)) {
    return undefined;
  }

  return Object.freeze({ ...value });
}

function areaFromStep4(step4: unknown) {
  if (!isPlainRecord(step4) || typeof step4.superficie !== "number") {
    return undefined;
  }

  if (!Number.isFinite(step4.superficie) || step4.superficie < 0) {
    return undefined;
  }

  return createIdentifiedTechnicalValue({
    value: step4.superficie,
    unit: "m2",
    provenance: Provenance.USER_PROVIDED,
    status: ValidationStatus.VALIDATED,
    identity: {
      domain: "irrigation",
      field: "sectorArea",
      path: "agronomy.inputs.sectorAreaM2",
    },
  });
}

/**
 * Traduce el valor crudo de PASO.5 (goteo/aspersion/microaspersion/no-se) al
 * IrrigationSystemDescriptor que exige IrrigationSystemEfficiencyContract.
 * Devuelve undefined si el usuario no eligió un tipo reconocible ("no lo sé"
 * o dato ausente): no se inventa un tipo por defecto.
 */
export function mapIrrigationSystemKindFromStep5(
  step5: unknown,
): IrrigationSystemDescriptor | undefined {
  if (!isPlainRecord(step5)) {
    return undefined;
  }

  const rawKind = step5.irrigation ?? step5.sistemaRiego ?? step5.riego;

  if (rawKind === "goteo") {
    return Object.freeze({ kind: IrrigationSystemKind.DRIP });
  }

  if (rawKind === "aspersion") {
    return Object.freeze({ kind: IrrigationSystemKind.SPRINKLER });
  }

  if (rawKind === "microaspersion") {
    return Object.freeze({
      kind: IrrigationSystemKind.OTHER,
      systemId: "microaspersion",
      label: "Microaspersión",
    });
  }

  return undefined;
}

export function createProjectTechnicalDataFromSteps(
  input: ProjectStepsInput,
): Readonly<ProjectStepsAdapterResult> {
  const crop = toDomainData(input.step1);
  const location = toDomainData(input.step2);
  const water = toDomainData(input.step3);
  const planting = toDomainData(input.step4);
  const irrigation = toDomainData(input.step5);
  const energy = toDomainData(input.step6);

  const irrigationSystem = mapIrrigationSystemKindFromStep5(input.step5);
  const sectorAreaM2 = areaFromStep4(input.step4);

  const domains: ProjectTechnicalDomains = {
    ...(crop === undefined ? {} : { crop }),
    ...(location === undefined ? {} : { location }),
    ...(water === undefined ? {} : { water }),
    ...(planting === undefined ? {} : { planting }),
    ...(irrigation === undefined ? {} : { irrigation }),
    ...(energy === undefined ? {} : { energy }),
  };

  const pendingEngineInputs = irrigationSystem === undefined
    ? Object.freeze([
        ...AGRONOMY_ENGINE_PENDING_INPUTS,
        "irrigationSystemEfficiency.irrigationSystem",
        ...HYDRAULIC_EMITTER_ENGINE_PENDING_INPUTS,
      ])
    : Object.freeze([
        ...AGRONOMY_ENGINE_PENDING_INPUTS,
        ...HYDRAULIC_EMITTER_ENGINE_PENDING_INPUTS,
      ]);

  return Object.freeze({
    technicalData: Object.freeze({
      ...domains,
      ...(sectorAreaM2 === undefined
        ? {}
        : { values: Object.freeze([sectorAreaM2]) }),
    }),
    ...(irrigationSystem === undefined ? {} : { irrigationSystem }),
    pendingEngineInputs,
  });
}
