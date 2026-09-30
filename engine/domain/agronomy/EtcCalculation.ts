import {
  createIdentifiedTechnicalValue,
  type IdentifiedTechnicalValue,
} from "../../../src/domain/shared/TechnicalValue.js";
import { Provenance } from "../../../src/domain/shared/Provenance.js";
import { ValidationStatus } from "../../../src/domain/shared/ValidationStatus.js";
import { isSupportedUnit } from "../../../src/shared/units/UnitCatalog.js";

export const AGRONOMY_ETC_METHOD_REF = "agronomy.compute_etc";
export const AGRONOMY_ETC_RESULT_PATH = "agronomy.etc";
export const KC_UNIT = "coefficient";

export type EtcCompatibleUnit = "mm";

export interface EtcCalculationInput {
  readonly eto: IdentifiedTechnicalValue<string>;
  readonly kc: IdentifiedTechnicalValue<string>;
}

export interface EtcCalculationTrace {
  readonly eto: Readonly<IdentifiedTechnicalValue<string>>;
  readonly kc: Readonly<IdentifiedTechnicalValue<string>>;
}

export interface EtcCalculationResult {
  readonly technicalValue: Readonly<IdentifiedTechnicalValue<EtcCompatibleUnit>>;
  readonly methodRef: typeof AGRONOMY_ETC_METHOD_REF;
  readonly dependencyRefs: readonly string[];
  readonly trace: Readonly<EtcCalculationTrace>;
}

export class EtcCalculationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "EtcCalculationError";
  }
}

function isAdmissibleInputStatus(value: ValidationStatus): boolean {
  return (
    value === ValidationStatus.VALIDATED ||
    value === ValidationStatus.PROVISIONAL ||
    value === ValidationStatus.PENDING ||
    value === ValidationStatus.BLOCKED
  );
}

function deriveResultStatus(
  etoStatus: ValidationStatus,
  kcStatus: ValidationStatus,
): ValidationStatus {
  if (etoStatus === ValidationStatus.BLOCKED || kcStatus === ValidationStatus.BLOCKED) {
    return ValidationStatus.BLOCKED;
  }

  if (etoStatus === ValidationStatus.PENDING || kcStatus === ValidationStatus.PENDING) {
    return ValidationStatus.PENDING;
  }

  if (
    etoStatus === ValidationStatus.PROVISIONAL ||
    kcStatus === ValidationStatus.PROVISIONAL
  ) {
    return ValidationStatus.PROVISIONAL;
  }

  return ValidationStatus.VALIDATED;
}

export function createEtcCalculationInput(
  input: EtcCalculationInput,
): Readonly<EtcCalculationInput> {
  const eto = createIdentifiedTechnicalValue(input.eto);
  const kc = createIdentifiedTechnicalValue(input.kc);

  if (!isSupportedUnit(eto.unit)) {
    throw new EtcCalculationError("eto.unit is not supported");
  }

  if (eto.unit !== "mm") {
    throw new EtcCalculationError("eto.unit must be mm");
  }

  if (eto.value < 0) {
    throw new EtcCalculationError("eto.value must be greater than or equal to 0");
  }

  if (!isAdmissibleInputStatus(eto.status)) {
    throw new EtcCalculationError("eto.status is not admissible for ETc calculation");
  }

  if (kc.unit !== KC_UNIT) {
    throw new EtcCalculationError(`kc.unit must be ${KC_UNIT}`);
  }

  if (kc.value < 0) {
    throw new EtcCalculationError("kc.value must be greater than or equal to 0");
  }

  if (!isAdmissibleInputStatus(kc.status)) {
    throw new EtcCalculationError("kc.status is not admissible for ETc calculation");
  }

  if (eto.identity.path === kc.identity.path) {
    throw new EtcCalculationError("eto.identity.path and kc.identity.path must be different");
  }

  return Object.freeze({
    eto,
    kc,
  });
}

export function calculateEtc(
  input: EtcCalculationInput,
): Readonly<EtcCalculationResult> {
  const validatedInput = createEtcCalculationInput(input);
  const status = deriveResultStatus(
    validatedInput.eto.status,
    validatedInput.kc.status,
  );

  const technicalValue = createIdentifiedTechnicalValue({
    value: validatedInput.eto.value * validatedInput.kc.value,
    unit: "mm",
    provenance: Provenance.CALCULATED,
    status,
    identity: {
      domain: "agronomy",
      field: "ETc",
      path: AGRONOMY_ETC_RESULT_PATH,
    },
  });

  return Object.freeze({
    technicalValue,
    methodRef: AGRONOMY_ETC_METHOD_REF,
    dependencyRefs: Object.freeze([
      validatedInput.eto.identity.path,
      validatedInput.kc.identity.path,
    ]),
    trace: Object.freeze({
      eto: validatedInput.eto,
      kc: validatedInput.kc,
    }),
  });
}
