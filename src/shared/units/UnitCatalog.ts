export type UnitName =
  | "m"
  | "m2"
  | "ha"
  | "mm"
  | "coefficient"
  | "L"
  | "L/h"
  | "m3/h"
  | "mca"
  | "bar"
  | "m/s"
  | "W"
  | "kW"
  | "Wh"
  | "kWh"
  | "h"
  | "V"
  | "A"
  | "years";

export const UNIT_CATALOG: readonly UnitName[] = Object.freeze([
  "m",
  "m2",
  "ha",
  "mm",
  "coefficient",
  "L",
  "L/h",
  "m3/h",
  "mca",
  "bar",
  "m/s",
  "W",
  "kW",
  "Wh",
  "kWh",
  "h",
  "V",
  "A",
  "years",
]);

export class UnitCatalogError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "UnitCatalogError";
  }
}

export function isSupportedUnit(unit: string): unit is UnitName {
  return UNIT_CATALOG.includes(unit as UnitName);
}

export function requireSupportedUnit(unit: string): UnitName {
  if (!isSupportedUnit(unit)) {
    throw new UnitCatalogError(`unit is not supported: ${unit}`);
  }

  return unit;
}
