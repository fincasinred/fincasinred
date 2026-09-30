import { ValidationStatus } from "../shared/ValidationStatus.js";

export enum TechnicalProductCategory {
  PIPE = "PIPE",
  DRIPLINE_EMITTER = "DRIPLINE_EMITTER",
  FILTER = "FILTER",
  VALVE = "VALVE",
  FITTING = "FITTING",
  PUMP = "PUMP",
  TANK = "TANK",
  CONTROLLER = "CONTROLLER",
  SOLAR_PANEL = "SOLAR_PANEL",
  BATTERY = "BATTERY",
}

export interface TechnicalSource {
  readonly sourceName: string;
  readonly documentReference: string;
  readonly sourceUrl: string;
  readonly version: string;
  readonly checkedAt: string;
}

export interface PipeTechnicalSpecification {
  readonly innerDiameterMm: number;
  readonly outerDiameterMm: number;
  readonly wallThicknessMm: number;
  readonly material: string;
  readonly nominalLengthM?: number;
  readonly hazenWilliamsCoefficient?: number;
  readonly workingPressureMca: number;
  readonly maximumPressureMca: number;
}

export interface DriplineEmitterTechnicalSpecification {
  readonly emitterFlowLph: number;
  readonly emitterSpacingMm: number;
  readonly innerDiameterMm: number;
  readonly outerDiameterMm: number;
  readonly minimumOperatingPressureMca: number;
  readonly maximumOperatingPressureMca: number;
  readonly pressureCompensating: boolean;
  readonly dischargeExponent?: number;
}

export interface FilterConnection {
  readonly type: string;
  readonly size: number;
  readonly unit: string;
}

export interface FilterTechnicalSpecification {
  readonly filterType: string;
  readonly connection: FilterConnection;
  readonly nominalFlowLpm: number;
  readonly maximumFlowLpm: number;
  readonly workingPressureMca: number;
  readonly maximumPressureMca: number;
  readonly filtrationRatingMicron?: number;
  readonly filtrationRatingMesh?: number;
}

export interface ValveTechnicalSpecification {
  readonly valveType: string;
  readonly connection: FilterConnection;
  readonly nominalFlowLpm: number;
  readonly maximumFlowLpm: number;
  readonly minimumOperatingPressureMca?: number;
  readonly maximumOperatingPressureMca: number;
  readonly normallyOpen?: boolean;
}

export interface FittingTechnicalSpecification {
  readonly fittingType: string;
  readonly connections: readonly FilterConnection[];
  readonly material: string;
  readonly maximumPressureMca?: number;
}

export interface PumpConnection {
  readonly suction: FilterConnection;
  readonly discharge: FilterConnection;
}

export interface PumpCurvePoint {
  readonly flowLpm: number;
  readonly headMca: number;
}

export interface PumpTechnicalSpecification {
  readonly pumpType: string;
  readonly connection: PumpConnection;
  readonly nominalFlowLpm?: number;
  readonly maximumFlowLpm?: number;
  readonly nominalHeadMca?: number;
  readonly maximumHeadMca?: number;
  readonly minimumOperatingHeadMca?: number;
  readonly maximumOperatingHeadMca?: number;
  readonly motorPowerKw?: number;
  readonly efficiencyPercent?: number;
  readonly voltageV?: number;
  readonly phase?: string;
  readonly frequencyHz?: number;
  readonly maximumPressureMca?: number;
  readonly curvePoints?: readonly PumpCurvePoint[];
}

export interface TankConnection {
  readonly inlet?: FilterConnection;
  readonly outlet: FilterConnection;
}

export interface TankTechnicalSpecification {
  readonly tankType: string;
  readonly nominalCapacityL: number;
  readonly usableCapacityL?: number;
  readonly material: string;
  readonly installationType: string;
  readonly connection: TankConnection;
  readonly maximumOperatingPressureMca?: number;
  readonly maximumTemperatureC?: number;
}

export interface ControllerPowerSupply {
  readonly voltageV: number;
  readonly phase?: string;
  readonly frequencyHz?: number;
}

export interface ControllerOutputs {
  readonly numberOfOutputs: number;
  readonly outputType: string;
}

export interface ControllerValveCompatibility {
  readonly valveVoltageV: number;
  readonly valveType?: string;
}

export interface ControllerCommunication {
  readonly technology: string;
  readonly protocol?: string;
}

export interface ControllerTechnicalSpecification {
  readonly controllerType: string;
  readonly powerSupply: ControllerPowerSupply;
  readonly outputs: ControllerOutputs;
  readonly valveCompatibility: ControllerValveCompatibility;
  readonly communication?: ControllerCommunication;
  readonly minimumTemperatureC?: number;
  readonly maximumTemperatureC?: number;
  readonly protectionRating?: string;
  readonly installationType: string;
}

export interface SolarPanelTechnicalSpecification {
  readonly nominalPowerWp: number;
}

export interface BatteryTechnicalSpecification {
  readonly batteryType: string;
  readonly nominalEnergyKwh: number;
}

export interface TechnicalPipeProduct {
  readonly productId: string;
  readonly manufacturer: string;
  readonly model: string;
  readonly name: string;
  readonly category: TechnicalProductCategory.PIPE;
  readonly technicalSpecification: PipeTechnicalSpecification;
  readonly technicalSource: TechnicalSource;
  readonly technicalStatus: ValidationStatus;
}

export interface TechnicalDriplineEmitterProduct {
  readonly productId: string;
  readonly manufacturer: string;
  readonly model: string;
  readonly name: string;
  readonly category: TechnicalProductCategory.DRIPLINE_EMITTER;
  readonly technicalSpecification: DriplineEmitterTechnicalSpecification;
  readonly technicalSource: TechnicalSource;
  readonly technicalStatus: ValidationStatus;
}

export interface TechnicalFilterProduct {
  readonly productId: string;
  readonly manufacturer: string;
  readonly model: string;
  readonly name: string;
  readonly category: TechnicalProductCategory.FILTER;
  readonly technicalSpecification: FilterTechnicalSpecification;
  readonly technicalSource: TechnicalSource;
  readonly technicalStatus: ValidationStatus;
}

export interface TechnicalValveProduct {
  readonly productId: string;
  readonly manufacturer: string;
  readonly model: string;
  readonly name: string;
  readonly category: TechnicalProductCategory.VALVE;
  readonly technicalSpecification: ValveTechnicalSpecification;
  readonly technicalSource: TechnicalSource;
  readonly technicalStatus: ValidationStatus;
}

export interface TechnicalFittingProduct {
  readonly productId: string;
  readonly manufacturer: string;
  readonly model: string;
  readonly name: string;
  readonly category: TechnicalProductCategory.FITTING;
  readonly technicalSpecification: FittingTechnicalSpecification;
  readonly technicalSource: TechnicalSource;
  readonly technicalStatus: ValidationStatus;
}

export interface TechnicalPumpProduct {
  readonly productId: string;
  readonly manufacturer: string;
  readonly model: string;
  readonly name: string;
  readonly category: TechnicalProductCategory.PUMP;
  readonly technicalSpecification: PumpTechnicalSpecification;
  readonly technicalSource: TechnicalSource;
  readonly technicalStatus: ValidationStatus;
}

export interface TechnicalTankProduct {
  readonly productId: string;
  readonly manufacturer: string;
  readonly model: string;
  readonly name: string;
  readonly category: TechnicalProductCategory.TANK;
  readonly technicalSpecification: TankTechnicalSpecification;
  readonly technicalSource: TechnicalSource;
  readonly technicalStatus: ValidationStatus;
}

export interface TechnicalControllerProduct {
  readonly productId: string;
  readonly manufacturer: string;
  readonly model: string;
  readonly name: string;
  readonly category: TechnicalProductCategory.CONTROLLER;
  readonly technicalSpecification: ControllerTechnicalSpecification;
  readonly technicalSource: TechnicalSource;
  readonly technicalStatus: ValidationStatus;
}

export interface TechnicalSolarPanelProduct {
  readonly productId: string;
  readonly manufacturer: string;
  readonly model: string;
  readonly name: string;
  readonly category: TechnicalProductCategory.SOLAR_PANEL;
  readonly technicalSpecification: SolarPanelTechnicalSpecification;
  readonly technicalSource: TechnicalSource;
  readonly technicalStatus: ValidationStatus;
}

export interface TechnicalBatteryProduct {
  readonly productId: string;
  readonly manufacturer: string;
  readonly model: string;
  readonly name: string;
  readonly category: TechnicalProductCategory.BATTERY;
  readonly technicalSpecification: BatteryTechnicalSpecification;
  readonly technicalSource: TechnicalSource;
  readonly technicalStatus: ValidationStatus;
}

export type TechnicalProduct =
  | TechnicalPipeProduct
  | TechnicalDriplineEmitterProduct
  | TechnicalFilterProduct
  | TechnicalValveProduct
  | TechnicalFittingProduct
  | TechnicalPumpProduct
  | TechnicalTankProduct
  | TechnicalControllerProduct
  | TechnicalSolarPanelProduct
  | TechnicalBatteryProduct;

export class TechnicalProductError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "TechnicalProductError";
  }
}

const COMMERCIAL_FIELDS = new Set([
  "price",
  "seller",
  "merchant",
  "supplier",
  "purchaseUrl",
  "affiliateUrl",
  "commission",
  "availability",
  "bom",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TechnicalProductError(`${fieldName} is required`);
  }

  return value;
}

function requirePositiveNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new TechnicalProductError(
      `${fieldName} must be finite and positive`,
    );
  }

  return value;
}

function requireOptionalPositiveNumber(
  value: unknown,
  fieldName: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return requirePositiveNumber(value, fieldName);
}

function requireOptionalFiniteNumber(
  value: unknown,
  fieldName: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TechnicalProductError(
      `${fieldName} must be finite`,
    );
  }

  return value;
}

function requireSource(source: unknown): TechnicalSource {
  if (!isRecord(source)) {
    throw new TechnicalProductError("technicalSource is required");
  }

  return Object.freeze({
    sourceName: requireNonEmptyString(
      source.sourceName,
      "technicalSource.sourceName",
    ),
    documentReference: requireNonEmptyString(
      source.documentReference,
      "technicalSource.documentReference",
    ),
    sourceUrl: requireNonEmptyString(
      source.sourceUrl,
      "technicalSource.sourceUrl",
    ),
    version: requireNonEmptyString(source.version, "technicalSource.version"),
    checkedAt: requireNonEmptyString(
      source.checkedAt,
      "technicalSource.checkedAt",
    ),
  });
}

function requireStatus(value: unknown): ValidationStatus {
  if (!Object.values(ValidationStatus).includes(value as ValidationStatus)) {
    throw new TechnicalProductError("technicalStatus is invalid");
  }

  return value as ValidationStatus;
}

function rejectCommercialFields(value: Record<string, unknown>): void {
  for (const fieldName of Object.keys(value)) {
    if (COMMERCIAL_FIELDS.has(fieldName)) {
      throw new TechnicalProductError(
        `commercial field is not allowed in technical catalog: ${fieldName}`,
      );
    }
  }
}

function requireCommonProductFields(input: unknown): Record<string, unknown> {
  if (!isRecord(input)) {
    throw new TechnicalProductError("product must be an object");
  }

  rejectCommercialFields(input);

  requireNonEmptyString(input.productId, "productId");
  requireNonEmptyString(input.manufacturer, "manufacturer");
  requireNonEmptyString(input.model, "model");
  requireNonEmptyString(input.name, "name");
  requireSource(input.technicalSource);
  requireStatus(input.technicalStatus);

  return input;
}

function requirePipeSpecification(
  value: unknown,
): Readonly<PipeTechnicalSpecification> {
  if (!isRecord(value)) {
    throw new TechnicalProductError("technicalSpecification is required");
  }

  rejectCommercialFields(value);

  const innerDiameterMm = requirePositiveNumber(
    value.innerDiameterMm,
    "technicalSpecification.innerDiameterMm",
  );

  const outerDiameterMm = requirePositiveNumber(
    value.outerDiameterMm,
    "technicalSpecification.outerDiameterMm",
  );

  const wallThicknessMm = requirePositiveNumber(
    value.wallThicknessMm,
    "technicalSpecification.wallThicknessMm",
  );

  const workingPressureMca = requirePositiveNumber(
    value.workingPressureMca,
    "technicalSpecification.workingPressureMca",
  );

  const maximumPressureMca = requirePositiveNumber(
    value.maximumPressureMca,
    "technicalSpecification.maximumPressureMca",
  );

  if (outerDiameterMm <= innerDiameterMm) {
    throw new TechnicalProductError(
      "technicalSpecification.outerDiameterMm must be greater than innerDiameterMm",
    );
  }

  if (workingPressureMca > maximumPressureMca) {
    throw new TechnicalProductError(
      "technicalSpecification.workingPressureMca must not exceed maximumPressureMca",
    );
  }

  const material = requireNonEmptyString(
    value.material,
    "technicalSpecification.material",
  );

  const nominalLengthM = requireOptionalPositiveNumber(
    value.nominalLengthM,
    "technicalSpecification.nominalLengthM",
  );

  const hazenWilliamsCoefficient = requireOptionalPositiveNumber(
    value.hazenWilliamsCoefficient,
    "technicalSpecification.hazenWilliamsCoefficient",
  );

  return Object.freeze({
    innerDiameterMm,
    outerDiameterMm,
    wallThicknessMm,
    material,
    workingPressureMca,
    maximumPressureMca,
    ...(nominalLengthM === undefined ? {} : { nominalLengthM }),
    ...(hazenWilliamsCoefficient === undefined
      ? {}
      : { hazenWilliamsCoefficient }),
  });
}

function requireDriplineSpecification(
  value: unknown,
): Readonly<DriplineEmitterTechnicalSpecification> {
  if (!isRecord(value)) {
    throw new TechnicalProductError("technicalSpecification is required");
  }

  rejectCommercialFields(value);

  const minimumOperatingPressureMca = requirePositiveNumber(
    value.minimumOperatingPressureMca,
    "technicalSpecification.minimumOperatingPressureMca",
  );

  const maximumOperatingPressureMca = requirePositiveNumber(
    value.maximumOperatingPressureMca,
    "technicalSpecification.maximumOperatingPressureMca",
  );

  if (minimumOperatingPressureMca > maximumOperatingPressureMca) {
    throw new TechnicalProductError(
      "technicalSpecification.minimumOperatingPressureMca must not exceed maximumOperatingPressureMca",
    );
  }

  if (typeof value.pressureCompensating !== "boolean") {
    throw new TechnicalProductError(
      "technicalSpecification.pressureCompensating must be boolean",
    );
  }

  const dischargeExponent = requireOptionalPositiveNumber(
    value.dischargeExponent,
    "technicalSpecification.dischargeExponent",
  );

  return Object.freeze({
    emitterFlowLph: requirePositiveNumber(
      value.emitterFlowLph,
      "technicalSpecification.emitterFlowLph",
    ),
    emitterSpacingMm: requirePositiveNumber(
      value.emitterSpacingMm,
      "technicalSpecification.emitterSpacingMm",
    ),
    innerDiameterMm: requirePositiveNumber(
      value.innerDiameterMm,
      "technicalSpecification.innerDiameterMm",
    ),
    outerDiameterMm: requirePositiveNumber(
      value.outerDiameterMm,
      "technicalSpecification.outerDiameterMm",
    ),
    minimumOperatingPressureMca,
    maximumOperatingPressureMca,
    pressureCompensating: value.pressureCompensating,
    ...(dischargeExponent === undefined ? {} : { dischargeExponent }),
  });
}

function requireFilterConnection(
  value: unknown,
): Readonly<FilterConnection> {
  if (!isRecord(value)) {
    throw new TechnicalProductError(
      "technicalSpecification.connection is required",
    );
  }

  rejectCommercialFields(value);

  return Object.freeze({
    type: requireNonEmptyString(
      value.type,
      "technicalSpecification.connection.type",
    ),
    size: requirePositiveNumber(
      value.size,
      "technicalSpecification.connection.size",
    ),
    unit: requireNonEmptyString(
      value.unit,
      "technicalSpecification.connection.unit",
    ),
  });
}

function requireFilterSpecification(
  value: unknown,
): Readonly<FilterTechnicalSpecification> {
  if (!isRecord(value)) {
    throw new TechnicalProductError("technicalSpecification is required");
  }

  rejectCommercialFields(value);

  const nominalFlowLpm = requirePositiveNumber(
    value.nominalFlowLpm,
    "technicalSpecification.nominalFlowLpm",
  );

  const maximumFlowLpm = requirePositiveNumber(
    value.maximumFlowLpm,
    "technicalSpecification.maximumFlowLpm",
  );

  const workingPressureMca = requirePositiveNumber(
    value.workingPressureMca,
    "technicalSpecification.workingPressureMca",
  );

  const maximumPressureMca = requirePositiveNumber(
    value.maximumPressureMca,
    "technicalSpecification.maximumPressureMca",
  );

  if (maximumFlowLpm < nominalFlowLpm) {
    throw new TechnicalProductError(
      "technicalSpecification.maximumFlowLpm must not be less than nominalFlowLpm",
    );
  }

  if (maximumPressureMca < workingPressureMca) {
    throw new TechnicalProductError(
      "technicalSpecification.maximumPressureMca must not be less than workingPressureMca",
    );
  }

  const filtrationRatingMicron = requireOptionalPositiveNumber(
    value.filtrationRatingMicron,
    "technicalSpecification.filtrationRatingMicron",
  );

  const filtrationRatingMesh = requireOptionalPositiveNumber(
    value.filtrationRatingMesh,
    "technicalSpecification.filtrationRatingMesh",
  );

  return Object.freeze({
    filterType: requireNonEmptyString(
      value.filterType,
      "technicalSpecification.filterType",
    ),
    connection: requireFilterConnection(value.connection),
    nominalFlowLpm,
    maximumFlowLpm,
    workingPressureMca,
    maximumPressureMca,
    ...(filtrationRatingMicron === undefined
      ? {}
      : { filtrationRatingMicron }),
    ...(filtrationRatingMesh === undefined
      ? {}
      : { filtrationRatingMesh }),
  });
}

function requireValveSpecification(
  value: unknown,
): Readonly<ValveTechnicalSpecification> {
  if (!isRecord(value)) {
    throw new TechnicalProductError("technicalSpecification is required");
  }

  rejectCommercialFields(value);

  const nominalFlowLpm = requirePositiveNumber(
    value.nominalFlowLpm,
    "technicalSpecification.nominalFlowLpm",
  );

  const maximumFlowLpm = requirePositiveNumber(
    value.maximumFlowLpm,
    "technicalSpecification.maximumFlowLpm",
  );

  if (maximumFlowLpm < nominalFlowLpm) {
    throw new TechnicalProductError(
      "technicalSpecification.maximumFlowLpm must not be less than nominalFlowLpm",
    );
  }

  const minimumOperatingPressureMca = requireOptionalPositiveNumber(
    value.minimumOperatingPressureMca,
    "technicalSpecification.minimumOperatingPressureMca",
  );

  const maximumOperatingPressureMca = requirePositiveNumber(
    value.maximumOperatingPressureMca,
    "technicalSpecification.maximumOperatingPressureMca",
  );

  if (
    minimumOperatingPressureMca !== undefined &&
    minimumOperatingPressureMca > maximumOperatingPressureMca
  ) {
    throw new TechnicalProductError(
      "technicalSpecification.minimumOperatingPressureMca must not exceed maximumOperatingPressureMca",
    );
  }

  if (
    value.normallyOpen !== undefined &&
    typeof value.normallyOpen !== "boolean"
  ) {
    throw new TechnicalProductError(
      "technicalSpecification.normallyOpen must be boolean",
    );
  }

  return Object.freeze({
    valveType: requireNonEmptyString(
      value.valveType,
      "technicalSpecification.valveType",
    ),
    connection: requireFilterConnection(value.connection),
    nominalFlowLpm,
    maximumFlowLpm,
    ...(minimumOperatingPressureMca === undefined
      ? {}
      : { minimumOperatingPressureMca }),
    maximumOperatingPressureMca,
    ...(value.normallyOpen === undefined
      ? {}
      : { normallyOpen: value.normallyOpen }),
  });
}

function requireFittingSpecification(
  value: unknown,
): Readonly<FittingTechnicalSpecification> {
  if (!isRecord(value)) {
    throw new TechnicalProductError("technicalSpecification is required");
  }

  rejectCommercialFields(value);

  if (!Array.isArray(value.connections) || value.connections.length < 2) {
    throw new TechnicalProductError(
      "technicalSpecification.connections must contain at least two connections",
    );
  }

  const connections = value.connections.map((connection, index) => {
    try {
      return requireFilterConnection(connection);
    } catch (error) {
      if (error instanceof TechnicalProductError) {
        throw new TechnicalProductError(
          error.message.replace(
            "technicalSpecification.connection.",
            `technicalSpecification.connections[${index}].`,
          ),
        );
      }

      throw error;
    }
  });

  const maximumPressureMca = requireOptionalPositiveNumber(
    value.maximumPressureMca,
    "technicalSpecification.maximumPressureMca",
  );

  return Object.freeze({
    fittingType: requireNonEmptyString(
      value.fittingType,
      "technicalSpecification.fittingType",
    ),
    connections: Object.freeze(connections),
    material: requireNonEmptyString(
      value.material,
      "technicalSpecification.material",
    ),
    ...(maximumPressureMca === undefined ? {} : { maximumPressureMca }),
  });
}

function requirePumpConnection(
  value: unknown,
): Readonly<PumpConnection> {
  if (!isRecord(value)) {
    throw new TechnicalProductError(
      "technicalSpecification.connection is required",
    );
  }

  rejectCommercialFields(value);

  if (!isRecord(value.suction)) {
    throw new TechnicalProductError(
      "technicalSpecification.connection.suction is required",
    );
  }

  if (!isRecord(value.discharge)) {
    throw new TechnicalProductError(
      "technicalSpecification.connection.discharge is required",
    );
  }

  const suction = requireFilterConnection(value.suction);
  const discharge = requireFilterConnection(value.discharge);

  return Object.freeze({
    suction: Object.freeze({
      type: requireNonEmptyString(
        suction.type,
        "technicalSpecification.connection.suction.type",
      ),
      size: requirePositiveNumber(
        suction.size,
        "technicalSpecification.connection.suction.size",
      ),
      unit: requireNonEmptyString(
        suction.unit,
        "technicalSpecification.connection.suction.unit",
      ),
    }),
    discharge: Object.freeze({
      type: requireNonEmptyString(
        discharge.type,
        "technicalSpecification.connection.discharge.type",
      ),
      size: requirePositiveNumber(
        discharge.size,
        "technicalSpecification.connection.discharge.size",
      ),
      unit: requireNonEmptyString(
        discharge.unit,
        "technicalSpecification.connection.discharge.unit",
      ),
    }),
  });
}

function requirePumpCurvePoints(
  value: unknown,
): readonly PumpCurvePoint[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.length === 0) {
    throw new TechnicalProductError(
      "technicalSpecification.curvePoints must contain at least one point",
    );
  }

  const points = value.map((point, index) => {
    if (!isRecord(point)) {
      throw new TechnicalProductError(
        `technicalSpecification.curvePoints[${index}] must be an object`,
      );
    }

    rejectCommercialFields(point);

    return Object.freeze({
      flowLpm: requirePositiveNumber(
        point.flowLpm,
        `technicalSpecification.curvePoints[${index}].flowLpm`,
      ),
      headMca: requirePositiveNumber(
        point.headMca,
        `technicalSpecification.curvePoints[${index}].headMca`,
      ),
    });
  });

  return Object.freeze(points);
}

function requirePumpSpecification(
  value: unknown,
): Readonly<PumpTechnicalSpecification> {
  if (!isRecord(value)) {
    throw new TechnicalProductError("technicalSpecification is required");
  }

  rejectCommercialFields(value);

  const nominalFlowLpm = requireOptionalPositiveNumber(
    value.nominalFlowLpm,
    "technicalSpecification.nominalFlowLpm",
  );

  const maximumFlowLpm = requireOptionalPositiveNumber(
    value.maximumFlowLpm,
    "technicalSpecification.maximumFlowLpm",
  );

  if (
    nominalFlowLpm !== undefined &&
    maximumFlowLpm !== undefined &&
    maximumFlowLpm < nominalFlowLpm
  ) {
    throw new TechnicalProductError(
      "technicalSpecification.maximumFlowLpm must not be less than nominalFlowLpm",
    );
  }

  const nominalHeadMca = requireOptionalPositiveNumber(
    value.nominalHeadMca,
    "technicalSpecification.nominalHeadMca",
  );

  const maximumHeadMca = requireOptionalPositiveNumber(
    value.maximumHeadMca,
    "technicalSpecification.maximumHeadMca",
  );

  if (
    nominalHeadMca !== undefined &&
    maximumHeadMca !== undefined &&
    maximumHeadMca < nominalHeadMca
  ) {
    throw new TechnicalProductError(
      "technicalSpecification.maximumHeadMca must not be less than nominalHeadMca",
    );
  }

  const minimumOperatingHeadMca = requireOptionalPositiveNumber(
    value.minimumOperatingHeadMca,
    "technicalSpecification.minimumOperatingHeadMca",
  );

  const maximumOperatingHeadMca = requireOptionalPositiveNumber(
    value.maximumOperatingHeadMca,
    "technicalSpecification.maximumOperatingHeadMca",
  );

  if (
    minimumOperatingHeadMca !== undefined &&
    maximumOperatingHeadMca !== undefined &&
    minimumOperatingHeadMca > maximumOperatingHeadMca
  ) {
    throw new TechnicalProductError(
      "technicalSpecification.minimumOperatingHeadMca must not exceed maximumOperatingHeadMca",
    );
  }

  const motorPowerKw = requireOptionalPositiveNumber(
    value.motorPowerKw,
    "technicalSpecification.motorPowerKw",
  );

  const efficiencyPercent = requireOptionalPositiveNumber(
    value.efficiencyPercent,
    "technicalSpecification.efficiencyPercent",
  );

  if (efficiencyPercent !== undefined && efficiencyPercent > 100) {
    throw new TechnicalProductError(
      "technicalSpecification.efficiencyPercent must not exceed 100",
    );
  }

  const voltageV = requireOptionalPositiveNumber(
    value.voltageV,
    "technicalSpecification.voltageV",
  );

  const frequencyHz = requireOptionalPositiveNumber(
    value.frequencyHz,
    "technicalSpecification.frequencyHz",
  );

  const maximumPressureMca = requireOptionalPositiveNumber(
    value.maximumPressureMca,
    "technicalSpecification.maximumPressureMca",
  );

  const curvePoints = requirePumpCurvePoints(value.curvePoints);

  return Object.freeze({
    pumpType: requireNonEmptyString(
      value.pumpType,
      "technicalSpecification.pumpType",
    ),
    connection: requirePumpConnection(value.connection),
    ...(nominalFlowLpm === undefined ? {} : { nominalFlowLpm }),
    ...(maximumFlowLpm === undefined ? {} : { maximumFlowLpm }),
    ...(nominalHeadMca === undefined ? {} : { nominalHeadMca }),
    ...(maximumHeadMca === undefined ? {} : { maximumHeadMca }),
    ...(minimumOperatingHeadMca === undefined
      ? {}
      : { minimumOperatingHeadMca }),
    ...(maximumOperatingHeadMca === undefined
      ? {}
      : { maximumOperatingHeadMca }),
    ...(motorPowerKw === undefined ? {} : { motorPowerKw }),
    ...(efficiencyPercent === undefined ? {} : { efficiencyPercent }),
    ...(voltageV === undefined ? {} : { voltageV }),
    ...(value.phase === undefined
      ? {}
      : {
          phase: requireNonEmptyString(
            value.phase,
            "technicalSpecification.phase",
          ),
        }),
    ...(frequencyHz === undefined ? {} : { frequencyHz }),
    ...(maximumPressureMca === undefined
      ? {}
      : { maximumPressureMca }),
    ...(curvePoints === undefined ? {} : { curvePoints }),
  });
}

function requireTankSpecification(
  value: unknown,
): Readonly<TankTechnicalSpecification> {
  if (!isRecord(value)) {
    throw new TechnicalProductError("technicalSpecification is required");
  }

  rejectCommercialFields(value);

  const nominalCapacityL = requirePositiveNumber(
    value.nominalCapacityL,
    "technicalSpecification.nominalCapacityL",
  );

  const usableCapacityL = requireOptionalPositiveNumber(
    value.usableCapacityL,
    "technicalSpecification.usableCapacityL",
  );

  if (
    usableCapacityL !== undefined &&
    usableCapacityL > nominalCapacityL
  ) {
    throw new TechnicalProductError(
      "technicalSpecification.usableCapacityL must not exceed nominalCapacityL",
    );
  }

  const maximumOperatingPressureMca = requireOptionalPositiveNumber(
    value.maximumOperatingPressureMca,
    "technicalSpecification.maximumOperatingPressureMca",
  );

  const maximumTemperatureC = requireOptionalPositiveNumber(
    value.maximumTemperatureC,
    "technicalSpecification.maximumTemperatureC",
  );

  if (!isRecord(value.connection)) {
    throw new TechnicalProductError(
      "technicalSpecification.connection is required",
    );
  }

  rejectCommercialFields(value.connection);

  if (value.connection.outlet === undefined) {
    throw new TechnicalProductError(
      "technicalSpecification.connection.outlet is required",
    );
  }

  const outlet = requireFilterConnection(value.connection.outlet);

  const inlet =
    value.connection.inlet === undefined
      ? undefined
      : requireFilterConnection(value.connection.inlet);

  return Object.freeze({
    tankType: requireNonEmptyString(
      value.tankType,
      "technicalSpecification.tankType",
    ),
    nominalCapacityL,
    ...(usableCapacityL === undefined ? {} : { usableCapacityL }),
    material: requireNonEmptyString(
      value.material,
      "technicalSpecification.material",
    ),
    installationType: requireNonEmptyString(
      value.installationType,
      "technicalSpecification.installationType",
    ),
    connection: Object.freeze({
      ...(inlet === undefined ? {} : { inlet }),
      outlet,
    }),
    ...(maximumOperatingPressureMca === undefined
      ? {}
      : { maximumOperatingPressureMca }),
    ...(maximumTemperatureC === undefined
      ? {}
      : { maximumTemperatureC }),
  });
}

function requireControllerSpecification(
  value: unknown,
): Readonly<ControllerTechnicalSpecification> {
  if (!isRecord(value)) {
    throw new TechnicalProductError("technicalSpecification is required");
  }

  rejectCommercialFields(value);

  if (!isRecord(value.powerSupply)) {
    throw new TechnicalProductError(
      "technicalSpecification.powerSupply is required",
    );
  }

  rejectCommercialFields(value.powerSupply);

  const voltageV = requirePositiveNumber(
    value.powerSupply.voltageV,
    "technicalSpecification.powerSupply.voltageV",
  );

  const phase =
    value.powerSupply.phase === undefined
      ? undefined
      : requireNonEmptyString(
          value.powerSupply.phase,
          "technicalSpecification.powerSupply.phase",
        );

  const frequencyHz = requireOptionalPositiveNumber(
    value.powerSupply.frequencyHz,
    "technicalSpecification.powerSupply.frequencyHz",
  );

  if (!isRecord(value.outputs)) {
    throw new TechnicalProductError(
      "technicalSpecification.outputs is required",
    );
  }

  rejectCommercialFields(value.outputs);

  const numberOfOutputs = requirePositiveNumber(
    value.outputs.numberOfOutputs,
    "technicalSpecification.outputs.numberOfOutputs",
  );

  const outputType = requireNonEmptyString(
    value.outputs.outputType,
    "technicalSpecification.outputs.outputType",
  );

  if (!isRecord(value.valveCompatibility)) {
    throw new TechnicalProductError(
      "technicalSpecification.valveCompatibility is required",
    );
  }

  rejectCommercialFields(value.valveCompatibility);

  const valveVoltageV = requirePositiveNumber(
    value.valveCompatibility.valveVoltageV,
    "technicalSpecification.valveCompatibility.valveVoltageV",
  );

  const valveType =
    value.valveCompatibility.valveType === undefined
      ? undefined
      : requireNonEmptyString(
          value.valveCompatibility.valveType,
          "technicalSpecification.valveCompatibility.valveType",
        );

  let communication: ControllerCommunication | undefined;

  if (value.communication !== undefined) {
    if (!isRecord(value.communication)) {
      throw new TechnicalProductError(
        "technicalSpecification.communication must be an object",
      );
    }

    rejectCommercialFields(value.communication);

    communication = Object.freeze({
      technology: requireNonEmptyString(
        value.communication.technology,
        "technicalSpecification.communication.technology",
      ),
      ...(value.communication.protocol === undefined
        ? {}
        : {
            protocol: requireNonEmptyString(
              value.communication.protocol,
              "technicalSpecification.communication.protocol",
            ),
          }),
    });
  }

  const minimumTemperatureC = requireOptionalFiniteNumber(
    value.minimumTemperatureC,
    "technicalSpecification.minimumTemperatureC",
  );

  const maximumTemperatureC = requireOptionalFiniteNumber(
    value.maximumTemperatureC,
    "technicalSpecification.maximumTemperatureC",
  );

  if (
    minimumTemperatureC !== undefined &&
    maximumTemperatureC !== undefined &&
    minimumTemperatureC > maximumTemperatureC
  ) {
    throw new TechnicalProductError(
      "technicalSpecification.minimumTemperatureC must not exceed maximumTemperatureC",
    );
  }

  const protectionRating =
    value.protectionRating === undefined
      ? undefined
      : requireNonEmptyString(
          value.protectionRating,
          "technicalSpecification.protectionRating",
        );

  const installationType = requireNonEmptyString(
    value.installationType,
    "technicalSpecification.installationType",
  );

  return Object.freeze({
    controllerType: requireNonEmptyString(
      value.controllerType,
      "technicalSpecification.controllerType",
    ),
    powerSupply: Object.freeze({
      voltageV,
      ...(phase === undefined ? {} : { phase }),
      ...(frequencyHz === undefined ? {} : { frequencyHz }),
    }),
    outputs: Object.freeze({
      numberOfOutputs,
      outputType,
    }),
    valveCompatibility: Object.freeze({
      valveVoltageV,
      ...(valveType === undefined ? {} : { valveType }),
    }),
    ...(communication === undefined ? {} : { communication }),
    ...(minimumTemperatureC === undefined
      ? {}
      : { minimumTemperatureC }),
    ...(maximumTemperatureC === undefined
      ? {}
      : { maximumTemperatureC }),
    ...(protectionRating === undefined ? {} : { protectionRating }),
    installationType,
  });
}

function requireSolarPanelSpecification(
  value: unknown,
): Readonly<SolarPanelTechnicalSpecification> {
  if (!isRecord(value)) {
    throw new TechnicalProductError("technicalSpecification is required");
  }

  rejectCommercialFields(value);

  return Object.freeze({
    nominalPowerWp: requirePositiveNumber(
      value.nominalPowerWp,
      "technicalSpecification.nominalPowerWp",
    ),
  });
}

function requireBatterySpecification(
  value: unknown,
): Readonly<BatteryTechnicalSpecification> {
  if (!isRecord(value)) {
    throw new TechnicalProductError("technicalSpecification is required");
  }

  rejectCommercialFields(value);

  return Object.freeze({
    batteryType: requireNonEmptyString(
      value.batteryType,
      "technicalSpecification.batteryType",
    ),
    nominalEnergyKwh: requirePositiveNumber(
      value.nominalEnergyKwh,
      "technicalSpecification.nominalEnergyKwh",
    ),
  });
}

export function createTechnicalProduct(
  input: unknown,
): Readonly<TechnicalProduct> {
  const product = requireCommonProductFields(input);
  const technicalSource = requireSource(product.technicalSource);
  const technicalStatus = requireStatus(product.technicalStatus);

  if (product.category === TechnicalProductCategory.PIPE) {
    return Object.freeze({
      productId: requireNonEmptyString(product.productId, "productId"),
      manufacturer: requireNonEmptyString(
        product.manufacturer,
        "manufacturer",
      ),
      model: requireNonEmptyString(product.model, "model"),
      name: requireNonEmptyString(product.name, "name"),
      category: TechnicalProductCategory.PIPE,
      technicalSpecification: requirePipeSpecification(
        product.technicalSpecification,
      ),
      technicalSource,
      technicalStatus,
    });
  }

  if (product.category === TechnicalProductCategory.DRIPLINE_EMITTER) {
    return Object.freeze({
      productId: requireNonEmptyString(product.productId, "productId"),
      manufacturer: requireNonEmptyString(
        product.manufacturer,
        "manufacturer",
      ),
      model: requireNonEmptyString(product.model, "model"),
      name: requireNonEmptyString(product.name, "name"),
      category: TechnicalProductCategory.DRIPLINE_EMITTER,
      technicalSpecification: requireDriplineSpecification(
        product.technicalSpecification,
      ),
      technicalSource,
      technicalStatus,
    });
  }

  if (product.category === TechnicalProductCategory.FILTER) {
    return Object.freeze({
      productId: requireNonEmptyString(product.productId, "productId"),
      manufacturer: requireNonEmptyString(
        product.manufacturer,
        "manufacturer",
      ),
      model: requireNonEmptyString(product.model, "model"),
      name: requireNonEmptyString(product.name, "name"),
      category: TechnicalProductCategory.FILTER,
      technicalSpecification: requireFilterSpecification(
        product.technicalSpecification,
      ),
      technicalSource,
      technicalStatus,
    });
  }

  if (product.category === TechnicalProductCategory.VALVE) {
    return Object.freeze({
      productId: requireNonEmptyString(product.productId, "productId"),
      manufacturer: requireNonEmptyString(
        product.manufacturer,
        "manufacturer",
      ),
      model: requireNonEmptyString(product.model, "model"),
      name: requireNonEmptyString(product.name, "name"),
      category: TechnicalProductCategory.VALVE,
      technicalSpecification: requireValveSpecification(
        product.technicalSpecification,
      ),
      technicalSource,
      technicalStatus,
    });
  }

  if (product.category === TechnicalProductCategory.FITTING) {
    return Object.freeze({
      productId: requireNonEmptyString(product.productId, "productId"),
      manufacturer: requireNonEmptyString(
        product.manufacturer,
        "manufacturer",
      ),
      model: requireNonEmptyString(product.model, "model"),
      name: requireNonEmptyString(product.name, "name"),
      category: TechnicalProductCategory.FITTING,
      technicalSpecification: requireFittingSpecification(
        product.technicalSpecification,
      ),
      technicalSource,
      technicalStatus,
    });
  }

  if (product.category === TechnicalProductCategory.PUMP) {
    return Object.freeze({
      productId: requireNonEmptyString(product.productId, "productId"),
      manufacturer: requireNonEmptyString(
        product.manufacturer,
        "manufacturer",
      ),
      model: requireNonEmptyString(product.model, "model"),
      name: requireNonEmptyString(product.name, "name"),
      category: TechnicalProductCategory.PUMP,
      technicalSpecification: requirePumpSpecification(
        product.technicalSpecification,
      ),
      technicalSource,
      technicalStatus,
    });
  }

  if (product.category === TechnicalProductCategory.TANK) {
    return Object.freeze({
      productId: requireNonEmptyString(product.productId, "productId"),
      manufacturer: requireNonEmptyString(
        product.manufacturer,
        "manufacturer",
      ),
      model: requireNonEmptyString(product.model, "model"),
      name: requireNonEmptyString(product.name, "name"),
      category: TechnicalProductCategory.TANK,
      technicalSpecification: requireTankSpecification(
        product.technicalSpecification,
      ),
      technicalSource,
      technicalStatus,
    });
  }

  if (product.category === TechnicalProductCategory.CONTROLLER) {
    return Object.freeze({
      productId: requireNonEmptyString(product.productId, "productId"),
      manufacturer: requireNonEmptyString(
        product.manufacturer,
        "manufacturer",
      ),
      model: requireNonEmptyString(product.model, "model"),
      name: requireNonEmptyString(product.name, "name"),
      category: TechnicalProductCategory.CONTROLLER,
      technicalSpecification: requireControllerSpecification(
        product.technicalSpecification,
      ),
      technicalSource,
      technicalStatus,
    });
  }

  if (product.category === TechnicalProductCategory.SOLAR_PANEL) {
    return Object.freeze({
      productId: requireNonEmptyString(product.productId, "productId"),
      manufacturer: requireNonEmptyString(
        product.manufacturer,
        "manufacturer",
      ),
      model: requireNonEmptyString(product.model, "model"),
      name: requireNonEmptyString(product.name, "name"),
      category: TechnicalProductCategory.SOLAR_PANEL,
      technicalSpecification: requireSolarPanelSpecification(
        product.technicalSpecification,
      ),
      technicalSource,
      technicalStatus,
    });
  }

  if (product.category === TechnicalProductCategory.BATTERY) {
    return Object.freeze({
      productId: requireNonEmptyString(product.productId, "productId"),
      manufacturer: requireNonEmptyString(
        product.manufacturer,
        "manufacturer",
      ),
      model: requireNonEmptyString(product.model, "model"),
      name: requireNonEmptyString(product.name, "name"),
      category: TechnicalProductCategory.BATTERY,
      technicalSpecification: requireBatterySpecification(
        product.technicalSpecification,
      ),
      technicalSource,
      technicalStatus,
    });
  }

  throw new TechnicalProductError("category is invalid");
}