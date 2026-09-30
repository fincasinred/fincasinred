import type { SiarPeriod } from "./SiarDailyDataProvider.js";

const SIAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class SiarDailyRequestBuilderError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "SiarDailyRequestBuilderError";
  }
}

function isCalendarDate(value: string): boolean {
  if (!SIAR_DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return date.toISOString().slice(0, 10) === value;
}

export function isValidSiarPeriod(value: unknown): value is SiarPeriod {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const period = value as Record<string, unknown>;
  return (
    typeof period.startDate === "string" &&
    typeof period.endDate === "string" &&
    period.startDate.trim().length > 0 &&
    period.endDate.trim().length > 0 &&
    isCalendarDate(period.startDate) &&
    isCalendarDate(period.endDate) &&
    period.startDate <= period.endDate
  );
}

export function buildSiarDailyRequest(
  period: SiarPeriod,
  stationId: string,
): Readonly<Record<string, unknown>> {
  if (!isValidSiarPeriod(period)) {
    throw new SiarDailyRequestBuilderError("Invalid SIAR period");
  }
  if (typeof stationId !== "string" || stationId.trim().length === 0) {
    throw new SiarDailyRequestBuilderError("SIAR stationId is required");
  }

  return Object.freeze({
    startDate: period.startDate,
    endDate: period.endDate,
    stationId,
  });
}