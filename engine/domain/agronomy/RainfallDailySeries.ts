import { Provenance } from "../../../src/domain/shared/Provenance.js";
import { ValidationStatus } from "../../../src/domain/shared/ValidationStatus.js";
import { RainfallTemporalWindow } from "./RainfallTemporalBalanceContract.js";

/**
 * Observación diaria normalizada (p. ej. producida por AemetDailyPrecipitationProvider).
 * `precipitationMm` ausente = sin dato ese día; nunca equivale a 0.
 * `qualifier: "TRACE"` = dato presente pero no cuantificado (p. ej. "Ip" de AEMET);
 * se conserva como no cuantificado, nunca se convierte en un número arbitrario.
 */
export interface RainfallDailyObservation {
  readonly date: string;
  readonly precipitationMm?: number;
  readonly qualifier?: "TRACE";
  readonly stationId: string;
  readonly provenance: Provenance;
  readonly sourceReference: string;
}

export interface RainfallMonthlyMissingDay {
  readonly date: string;
  readonly reason: "ABSENT" | "TRACE";
}

/**
 * Agrupación mensual mínima de una serie diaria. No es una regla (a diferencia
 * de RainfallTemporalBalanceContract/RainfallExcessContract): solo transporta
 * datos ya observados, agregados sin inventar ni descartar ausencias.
 */
export interface RainfallMonthlyPrecipitation {
  readonly month: string;
  readonly period: RainfallTemporalWindow;
  readonly totalPrecipitationMm: number;
  readonly observedDayCount: number;
  readonly missingDays: readonly RainfallMonthlyMissingDay[];
  readonly stationId: string;
  readonly provenance: Provenance;
  readonly sourceReference: string;
  readonly status: ValidationStatus;
}

export class RainfallDailySeriesError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "RainfallDailySeriesError";
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

const DAILY_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function requireDailyDate(value: unknown, fieldName: string): string {
  if (!isNonEmptyString(value) || !DAILY_DATE_PATTERN.test(value)) {
    throw new RainfallDailySeriesError(`${fieldName} must be an ISO calendar date (yyyy-mm-dd)`);
  }

  if (!Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))) {
    throw new RainfallDailySeriesError(`${fieldName} must be a valid calendar date`);
  }

  return value;
}

function isProvenance(value: unknown): value is Provenance {
  return Object.values(Provenance).includes(value as Provenance);
}

function validateObservation(
  observation: RainfallDailyObservation,
): Readonly<RainfallDailyObservation> {
  const date = requireDailyDate(observation?.date, "date");
  const stationId = isNonEmptyString(observation?.stationId)
    ? observation.stationId
    : (() => {
        throw new RainfallDailySeriesError("stationId is required");
      })();
  const sourceReference = isNonEmptyString(observation?.sourceReference)
    ? observation.sourceReference
    : (() => {
        throw new RainfallDailySeriesError("sourceReference is required");
      })();

  if (!isProvenance(observation?.provenance)) {
    throw new RainfallDailySeriesError("provenance is invalid");
  }

  if (
    observation.precipitationMm !== undefined &&
    (typeof observation.precipitationMm !== "number" ||
      !Number.isFinite(observation.precipitationMm))
  ) {
    throw new RainfallDailySeriesError("precipitationMm must be a finite number when present");
  }

  if (observation.qualifier !== undefined && observation.qualifier !== "TRACE") {
    throw new RainfallDailySeriesError("qualifier is invalid");
  }

  if (observation.qualifier === "TRACE" && observation.precipitationMm !== undefined) {
    throw new RainfallDailySeriesError(
      "a TRACE observation must not also carry a numeric precipitationMm",
    );
  }

  return Object.freeze({
    date,
    ...(observation.precipitationMm === undefined
      ? {}
      : { precipitationMm: observation.precipitationMm }),
    ...(observation.qualifier === undefined ? {} : { qualifier: observation.qualifier }),
    stationId,
    provenance: observation.provenance,
    sourceReference,
  });
}

function monthOf(date: string): string {
  return date.slice(0, 7);
}

function monthWindow(month: string): Readonly<RainfallTemporalWindow> {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const start = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999));

  return Object.freeze({
    start: start.toISOString(),
    end: end.toISOString(),
  });
}

function deriveMonthlyStatus(
  observedDayCount: number,
  missingDays: readonly RainfallMonthlyMissingDay[],
): ValidationStatus {
  if (observedDayCount === 0) {
    return ValidationStatus.BLOCKED;
  }

  return missingDays.length === 0 ? ValidationStatus.VALIDATED : ValidationStatus.PROVISIONAL;
}

/**
 * Agrupa una serie diaria ya normalizada por mes calendario, sin inventar
 * datos ausentes ni descartarlos silenciosamente.
 */
export function aggregateRainfallDailySeriesByMonth(
  observations: readonly RainfallDailyObservation[],
): readonly RainfallMonthlyPrecipitation[] {
  if (!Array.isArray(observations) || observations.length === 0) {
    throw new RainfallDailySeriesError("observations must be a non-empty array");
  }

  const validated = observations.map(validateObservation);

  const stationId = validated[0]!.stationId;
  const sourceReference = validated[0]!.sourceReference;

  if (
    validated.some(
      (observation) =>
        observation.stationId !== stationId || observation.sourceReference !== sourceReference,
    )
  ) {
    throw new RainfallDailySeriesError(
      "all observations in a series must share the same stationId and sourceReference",
    );
  }

  const byMonth = new Map<string, RainfallDailyObservation[]>();
  for (const observation of validated) {
    const month = monthOf(observation.date);
    const bucket = byMonth.get(month);
    if (bucket === undefined) {
      byMonth.set(month, [observation]);
    } else {
      bucket.push(observation);
    }
  }

  const months = [...byMonth.keys()].sort();

  return Object.freeze(
    months.map((month) => {
      const dailyObservations = byMonth.get(month)!;
      let totalPrecipitationMm = 0;
      let observedDayCount = 0;
      const missingDays: RainfallMonthlyMissingDay[] = [];

      for (const observation of dailyObservations) {
        if (observation.precipitationMm !== undefined) {
          totalPrecipitationMm += observation.precipitationMm;
          observedDayCount += 1;
        } else if (observation.qualifier === "TRACE") {
          missingDays.push(Object.freeze({ date: observation.date, reason: "TRACE" }));
        } else {
          missingDays.push(Object.freeze({ date: observation.date, reason: "ABSENT" }));
        }
      }

      return Object.freeze({
        month,
        period: monthWindow(month),
        totalPrecipitationMm,
        observedDayCount,
        missingDays: Object.freeze(missingDays),
        stationId,
        provenance: Provenance.CALCULATED,
        sourceReference,
        status: deriveMonthlyStatus(observedDayCount, missingDays),
      });
    }),
  );
}
