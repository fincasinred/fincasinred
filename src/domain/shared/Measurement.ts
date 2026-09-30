import {
  createTechnicalValue,
  TechnicalValue,
} from "./TechnicalValue.js";
import {
  isSupportedUnit,
  UnitName,
} from "../../shared/units/UnitCatalog.js";

// Single source of truth for supported units: src/shared/units/UnitCatalog.ts
export type MeasurementUnit = UnitName;

export type Measurement = TechnicalValue<MeasurementUnit>;

export class MeasurementError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "MeasurementError";
  }
}

export function createMeasurement(
  input: Measurement,
): Readonly<Measurement> {
  const measurement = createTechnicalValue(input);

  if (!isSupportedUnit(measurement.unit)) {
    throw new MeasurementError("unit is not supported");
  }

  return measurement;
}
