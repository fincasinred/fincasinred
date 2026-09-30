import type { ProjectTechnicalData } from "../../domain/project/ProjectModel.js";
import type { IdentifiedTechnicalValue } from "../../domain/shared/TechnicalValue.js";
import {
  createExecutionSnapshot,
  type ExecutionSnapshot,
} from "./ExecutionSnapshot.js";
import type { ExecutionIdentity } from "./ExecutionIdentity.js";
import type { RainfallTemporalWindow } from "../../../engine/domain/agronomy/RainfallTemporalBalanceContract.js";
import type { EffectiveRainfallContract } from "../../../engine/domain/agronomy/EffectiveRainfallContract.js";
import type { IrrigationSystemEfficiencyContract } from "../../../engine/domain/agronomy/IrrigationSystemEfficiencyContract.js";
import type { MonthlyEffectiveRainfallEstimationResult } from "../../../engine/domain/agronomy/MonthlyEffectiveRainfallEstimation.js";

// Convención de identidad ya usada por AgronomyEtcModule/AgronomyEffectiveRainfallModule
// y sus tests; no introduce un contrato nuevo.
const AGRONOMY_ETO_INPUT_PATH = "agronomy.inputs.eto";
const AGRONOMY_KC_INPUT_PATH = "agronomy.inputs.kc";
const AGRONOMY_RAINFALL_INPUT_PATH = "agronomy.inputs.rainfall";
const AGRONOMY_EFFECTIVE_RAINFALL_OBSERVED_INPUT_PATH =
  "agronomy.inputs.effectiveRainfallObserved";

/**
 * Entradas/configuración externas que el ProjectModel todavía no modela de
 * forma estructurada (periodo, contrato de lluvia efectiva observada y
 * contrato de eficiencia del sistema de riego). No son resultados calculados.
 */
export interface AgronomyProjectExecutionSnapshotInput {
  readonly identity: ExecutionIdentity;
  readonly configurationRef: string;
  readonly sourceRefs: readonly string[];
  readonly inputRefs: readonly string[];
  readonly technicalData: ProjectTechnicalData | undefined;
  readonly period: RainfallTemporalWindow;
  readonly effectiveRainfallContract: EffectiveRainfallContract;
  readonly irrigationSystemEfficiency: IrrigationSystemEfficiencyContract;
  readonly monthlyEstimation?: Readonly<MonthlyEffectiveRainfallEstimationResult>;
  readonly conditions?: Readonly<Record<string, unknown>>;
}

export class AgronomyProjectExecutionSnapshotError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "AgronomyProjectExecutionSnapshotError";
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

function requireIsoDate(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AgronomyProjectExecutionSnapshotError(`${fieldName} is required`);
  }

  if (!Number.isFinite(Date.parse(value))) {
    throw new AgronomyProjectExecutionSnapshotError(
      `${fieldName} must be a valid date`,
    );
  }

  return value;
}

/** No admite fechas por defecto: fechaInicio/fechaFin deben llegar ya resueltas. */
function validatePeriod(
  period: RainfallTemporalWindow,
): Readonly<RainfallTemporalWindow> {
  if (!isPlainRecord(period)) {
    throw new AgronomyProjectExecutionSnapshotError("period is required");
  }

  const start = requireIsoDate(period.start, "period.start");
  const end = requireIsoDate(period.end, "period.end");

  if (Date.parse(end) < Date.parse(start)) {
    throw new AgronomyProjectExecutionSnapshotError(
      "period.end must be greater than or equal to period.start",
    );
  }

  if (
    period.timezone !== undefined &&
    (typeof period.timezone !== "string" || period.timezone.trim().length === 0)
  ) {
    throw new AgronomyProjectExecutionSnapshotError("period.timezone is invalid");
  }

  return Object.freeze({
    start,
    end,
    ...(period.timezone === undefined ? {} : { timezone: period.timezone }),
  });
}

function pick(
  record: Record<string, unknown> | undefined,
  keys: readonly string[],
): Record<string, unknown> | undefined {
  if (record === undefined) {
    return undefined;
  }

  const picked: Record<string, unknown> = {};
  for (const key of keys) {
    if (record[key] !== undefined) {
      picked[key] = record[key];
    }
  }

  return Object.keys(picked).length === 0 ? undefined : picked;
}

function normalizeLocation(
  location: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (location === undefined) {
    return undefined;
  }

  const normalized = pick(location, ["latitud", "longitud", "texto"]);
  const latitude = location.latitud ?? location.latitude;
  const longitude = location.longitud ?? location.longitude;
  const text = location.texto ?? location.locationText;
  const result: Record<string, unknown> = {
    ...(latitude === undefined ? {} : { latitud: latitude }),
    ...(longitude === undefined ? {} : { longitud: longitude }),
    ...(text === undefined ? {} : { texto: text }),
  };

  if (normalized !== undefined) {
    return Object.keys(result).length === 0 ? normalized : result;
  }

  return Object.keys(result).length === 0 ? undefined : result;
}

/**
 * Extrae, sin inventar ni calcular nada, los datos ya recogidos en PASO 1-6
 * (vía ProjectModel.technicalData) para que lleguen al snapshot del motor.
 */
function buildProjectEffectiveParameters(
  technicalData: ProjectTechnicalData | undefined,
): Record<string, unknown> | undefined {
  const crop = isPlainRecord(technicalData?.crop) ? technicalData.crop : undefined;
  const location = isPlainRecord(technicalData?.location)
    ? technicalData.location
    : undefined;
  const water = isPlainRecord(technicalData?.water) ? technicalData.water : undefined;
  const planting = isPlainRecord(technicalData?.planting)
    ? technicalData.planting
    : undefined;
  const irrigation = isPlainRecord(technicalData?.irrigation)
    ? technicalData.irrigation
    : undefined;
  const energy = isPlainRecord(technicalData?.energy)
    ? technicalData.energy
    : undefined;

  const project: Record<string, unknown> = {};

  const pickedCrop = pick(crop, ["crop", "variety", "cropId", "quantity", "plantCount"]);
  const pickedLocation = normalizeLocation(location);
  const pickedWater = pick(water, ["distanceMeters", "elevationDifferenceMeters"]);
  const pickedPlanting = pick(planting, [
    "edadCultivo",
    "faseCultivo",
    "tipoSuelo",
    "otroSuelo",
  ]);

  if (pickedCrop !== undefined) {
    project.crop = Object.freeze(pickedCrop);
  }
  if (pickedLocation !== undefined) {
    project.location = Object.freeze(pickedLocation);
  }
  if (pickedWater !== undefined) {
    project.water = Object.freeze(pickedWater);
  }
  if (pickedPlanting !== undefined) {
    project.planting = Object.freeze(pickedPlanting);
  }
  if (irrigation !== undefined) {
    project.irrigation = Object.freeze({ ...irrigation });
  }
  if (energy !== undefined) {
    project.energy = Object.freeze({ ...energy });
  }

  return Object.keys(project).length === 0 ? undefined : Object.freeze(project);
}

function findTechnicalValueByPath(
  values: readonly IdentifiedTechnicalValue[],
  path: string,
): Readonly<IdentifiedTechnicalValue> | undefined {
  return values.find((value) => value.identity.path === path);
}

function requireTechnicalValue(
  values: readonly IdentifiedTechnicalValue[],
  path: string,
): Readonly<IdentifiedTechnicalValue> {
  const value = findTechnicalValueByPath(values, path);

  if (value === undefined) {
    throw new AgronomyProjectExecutionSnapshotError(
      `project technicalData.values is missing ${path}`,
    );
  }

  return value;
}

/**
 * Adapta los valores técnicos ya existentes en ProjectModel.technicalData a
 * un ExecutionSnapshot ejecutable por AgronomyExecutionAssembly. Solo lee
 * entradas externas (ETo, Kc, rainfall, lluvia efectiva observada); no
 * calcula ETc/EffectiveRainfall/NetNeed/GrossNeed ni los duplica aquí.
 */
export function createAgronomyProjectExecutionSnapshot(
  input: AgronomyProjectExecutionSnapshotInput,
): Readonly<ExecutionSnapshot> {
  const values = input.technicalData?.values ?? [];

  const eto = requireTechnicalValue(values, AGRONOMY_ETO_INPUT_PATH);
  const kc = requireTechnicalValue(values, AGRONOMY_KC_INPUT_PATH);
  const rainfall = requireTechnicalValue(values, AGRONOMY_RAINFALL_INPUT_PATH);
  const effectiveRainfall = requireTechnicalValue(
    values,
    AGRONOMY_EFFECTIVE_RAINFALL_OBSERVED_INPUT_PATH,
  );
  const sectorAreaM2 = findTechnicalValueByPath(
    values,
    "agronomy.inputs.sectorAreaM2",
  );
  const period = validatePeriod(input.period);
  const project = buildProjectEffectiveParameters(input.technicalData);

  return createExecutionSnapshot({
    identity: input.identity,
    configurationRef: input.configurationRef,
    sourceRefs: input.sourceRefs,
    inputRefs: input.inputRefs,
    effectiveParameters: {
      eto,
      kc,
      rainfall,
      effectiveRainfall,
      period,
      contract: input.effectiveRainfallContract,
      irrigationSystemEfficiency: input.irrigationSystemEfficiency,
      ...(sectorAreaM2 === undefined ? {} : { sectorAreaM2 }),
      ...(input.monthlyEstimation === undefined
        ? {}
        : { monthlyEstimation: input.monthlyEstimation }),
      ...(project === undefined ? {} : { project }),
    },
    ...(input.conditions === undefined ? {} : { conditions: input.conditions }),
  });
}
