import {
  createIdentifiedTechnicalValue,
  type IdentifiedTechnicalValue,
  isTechnicalValueEvidence,
} from "../../../src/domain/shared/TechnicalValue.js";
import { Provenance } from "../../../src/domain/shared/Provenance.js";
import { ValidationStatus } from "../../../src/domain/shared/ValidationStatus.js";
import {
  AgroSourceContract,
  AgroSourceType,
  AgroSourceVersionStatus,
} from "./AgroSourceContract.js";
import { AgroRuleMetadata, AgroRulePurpose } from "./AgroRuleMetadata.js";
import { AgroRuleContract, AgroRuleState } from "./AgroRuleContract.js";

export const IRRIGATION_SYSTEM_EFFICIENCY_UNIT = "coefficient";
export const IRRIGATION_SYSTEM_EFFICIENCY_PATH =
  "agronomy.irrigationSystemEfficiency";
export const IRRIGATION_SYSTEM_EFFICIENCY_FIELD =
  "irrigationSystemEfficiency";

export enum IrrigationSystemKind {
  DRIP = "drip",
  SPRINKLER = "sprinkler",
  OTHER = "other",
}

export interface DripIrrigationSystem {
  readonly kind: IrrigationSystemKind.DRIP;
}

export interface SprinklerIrrigationSystem {
  readonly kind: IrrigationSystemKind.SPRINKLER;
}

export interface OtherIrrigationSystem {
  readonly kind: IrrigationSystemKind.OTHER;
  readonly systemId: string;
  readonly label?: string;
}

export type IrrigationSystemDescriptor =
  | DripIrrigationSystem
  | SprinklerIrrigationSystem
  | OtherIrrigationSystem;

export interface IrrigationSystemEfficiencyContract {
  readonly efficiency: IdentifiedTechnicalValue<
    typeof IRRIGATION_SYSTEM_EFFICIENCY_UNIT
  >;
  readonly irrigationSystem: IrrigationSystemDescriptor;
  readonly source?: AgroSourceContract;
  readonly metadata?: AgroRuleMetadata;
  readonly ruleContract?: AgroRuleContract;
  readonly conditions?: Readonly<Record<string, unknown>>;
  readonly notes?: string;
}

export class IrrigationSystemEfficiencyContractError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "IrrigationSystemEfficiencyContractError";
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isProvenance(value: unknown): value is Provenance {
  return Object.values(Provenance).includes(value as Provenance);
}

function isValidationStatus(value: unknown): value is ValidationStatus {
  return Object.values(ValidationStatus).includes(value as ValidationStatus);
}

function isAgroSourceType(value: unknown): value is AgroSourceType {
  return Object.values(AgroSourceType).includes(value as AgroSourceType);
}

function isAgroSourceVersionStatus(value: unknown): value is AgroSourceVersionStatus {
  return Object.values(AgroSourceVersionStatus).includes(
    value as AgroSourceVersionStatus,
  );
}

function isAgroRulePurpose(value: unknown): value is AgroRulePurpose {
  return Object.values(AgroRulePurpose).includes(value as AgroRulePurpose);
}

function isAgroRuleState(value: unknown): value is AgroRuleState {
  return Object.values(AgroRuleState).includes(value as AgroRuleState);
}

function freezeStringList(value: unknown, fieldName: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new IrrigationSystemEfficiencyContractError(
      `${fieldName} must be an array`,
    );
  }

  if (value.some((entry) => !isNonEmptyString(entry))) {
    throw new IrrigationSystemEfficiencyContractError(
      `${fieldName} must contain non-empty strings`,
    );
  }

  return Object.freeze([...value]);
}

function cloneArray<T>(value: readonly T[]): T[] {
  return [...value];
}

function validateEfficiency(
  value: IdentifiedTechnicalValue<string>,
): Readonly<IdentifiedTechnicalValue<typeof IRRIGATION_SYSTEM_EFFICIENCY_UNIT>> {
  const efficiency = createIdentifiedTechnicalValue(value);

  if (efficiency.unit !== IRRIGATION_SYSTEM_EFFICIENCY_UNIT) {
    throw new IrrigationSystemEfficiencyContractError(
      `efficiency.unit must be ${IRRIGATION_SYSTEM_EFFICIENCY_UNIT}`,
    );
  }

  if (!(efficiency.value > 0 && efficiency.value <= 1)) {
    throw new IrrigationSystemEfficiencyContractError(
      "efficiency.value must be greater than 0 and less than or equal to 1",
    );
  }

  if (efficiency.identity.field !== IRRIGATION_SYSTEM_EFFICIENCY_FIELD) {
    throw new IrrigationSystemEfficiencyContractError(
      `efficiency.identity.field must be ${IRRIGATION_SYSTEM_EFFICIENCY_FIELD}`,
    );
  }

  if (efficiency.identity.path !== IRRIGATION_SYSTEM_EFFICIENCY_PATH) {
    throw new IrrigationSystemEfficiencyContractError(
      `efficiency.identity.path must be ${IRRIGATION_SYSTEM_EFFICIENCY_PATH}`,
    );
  }

  if (
    efficiency.identity.domain !== undefined &&
    efficiency.identity.domain !== "agronomy"
  ) {
    throw new IrrigationSystemEfficiencyContractError(
      'efficiency.identity.domain must be "agronomy" when provided',
    );
  }

  if (efficiency.evidence !== undefined && !isTechnicalValueEvidence(efficiency.evidence)) {
    throw new IrrigationSystemEfficiencyContractError(
      "efficiency.evidence is invalid",
    );
  }

  return efficiency as Readonly<
    IdentifiedTechnicalValue<typeof IRRIGATION_SYSTEM_EFFICIENCY_UNIT>
  >;
}

function validateIrrigationSystem(
  value: IrrigationSystemDescriptor,
): Readonly<IrrigationSystemDescriptor> {
  if (!isPlainRecord(value)) {
    throw new IrrigationSystemEfficiencyContractError(
      "irrigationSystem is required",
    );
  }

  if (value.kind === IrrigationSystemKind.DRIP) {
    return Object.freeze({ kind: IrrigationSystemKind.DRIP });
  }

  if (value.kind === IrrigationSystemKind.SPRINKLER) {
    return Object.freeze({ kind: IrrigationSystemKind.SPRINKLER });
  }

  if (value.kind === IrrigationSystemKind.OTHER) {
    if (!isNonEmptyString(value.systemId)) {
      throw new IrrigationSystemEfficiencyContractError(
        "irrigationSystem.systemId is required for other systems",
      );
    }

    if (value.label !== undefined && !isNonEmptyString(value.label)) {
      throw new IrrigationSystemEfficiencyContractError(
        "irrigationSystem.label is invalid",
      );
    }

    return Object.freeze({
      kind: IrrigationSystemKind.OTHER,
      systemId: value.systemId,
      ...(value.label === undefined ? {} : { label: value.label }),
    });
  }

  throw new IrrigationSystemEfficiencyContractError(
    "irrigationSystem.kind is invalid",
  );
}

function validateConditions(
  value: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isPlainRecord(value)) {
    throw new IrrigationSystemEfficiencyContractError(
      "conditions must be a plain object",
    );
  }

  return Object.freeze({ ...value });
}

function validateSource(
  value: AgroSourceContract | undefined,
): AgroSourceContract | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isPlainRecord(value) || !isPlainRecord(value.source)) {
    throw new IrrigationSystemEfficiencyContractError("source is invalid");
  }

  if (!isNonEmptyString(value.source.sourceId)) {
    throw new IrrigationSystemEfficiencyContractError("source.source.sourceId is required");
  }
  if (!isNonEmptyString(value.source.sourceName)) {
    throw new IrrigationSystemEfficiencyContractError("source.source.sourceName is required");
  }
  if (!isAgroSourceType(value.source.sourceType)) {
    throw new IrrigationSystemEfficiencyContractError("source.source.sourceType is invalid");
  }
  if (!isNonEmptyString(value.source.version)) {
    throw new IrrigationSystemEfficiencyContractError("source.source.version is required");
  }
  if (!isAgroSourceVersionStatus(value.source.versionStatus)) {
    throw new IrrigationSystemEfficiencyContractError(
      "source.source.versionStatus is invalid",
    );
  }
  if (!isProvenance(value.source.provenance)) {
    throw new IrrigationSystemEfficiencyContractError("source.source.provenance is invalid");
  }
  if (!isValidationStatus(value.source.validationStatus)) {
    throw new IrrigationSystemEfficiencyContractError(
      "source.source.validationStatus is invalid",
    );
  }
  if (!isNonEmptyString(value.methodologyContext)) {
    throw new IrrigationSystemEfficiencyContractError("source.methodologyContext is required");
  }
  if (!isNonEmptyString(value.interpretationRule)) {
    throw new IrrigationSystemEfficiencyContractError("source.interpretationRule is required");
  }

  return Object.freeze({
    source: Object.freeze({ ...value.source }),
    methodologyContext: value.methodologyContext,
    interpretationRule: value.interpretationRule,
    inputFields: cloneArray(
      freezeStringList(value.inputFields, "source.inputFields"),
    ),
    outputFields: cloneArray(
      freezeStringList(value.outputFields, "source.outputFields"),
    ),
    ...(value.notes === undefined ? {} : { notes: value.notes }),
  }) as AgroSourceContract;
}

function validateMetadata(
  value: AgroRuleMetadata | undefined,
): AgroRuleMetadata | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isPlainRecord(value)) {
    throw new IrrigationSystemEfficiencyContractError("metadata is invalid");
  }

  if (!isNonEmptyString(value.ruleId)) {
    throw new IrrigationSystemEfficiencyContractError("metadata.ruleId is required");
  }
  if (!isNonEmptyString(value.version)) {
    throw new IrrigationSystemEfficiencyContractError("metadata.version is required");
  }
  if (!isAgroRulePurpose(value.purpose)) {
    throw new IrrigationSystemEfficiencyContractError("metadata.purpose is invalid");
  }
  if (!isNonEmptyString(value.title)) {
    throw new IrrigationSystemEfficiencyContractError("metadata.title is required");
  }
  if (!isNonEmptyString(value.summary)) {
    throw new IrrigationSystemEfficiencyContractError("metadata.summary is required");
  }
  if (!isNonEmptyString(value.description)) {
    throw new IrrigationSystemEfficiencyContractError("metadata.description is required");
  }
  if (!Array.isArray(value.inputs)) {
    throw new IrrigationSystemEfficiencyContractError("metadata.inputs must be an array");
  }
  if (!Array.isArray(value.outputs)) {
    throw new IrrigationSystemEfficiencyContractError("metadata.outputs must be an array");
  }
  if (!Array.isArray(value.dependencies)) {
    throw new IrrigationSystemEfficiencyContractError(
      "metadata.dependencies must be an array",
    );
  }
  if (!isNonEmptyString(value.procedureDescription)) {
    throw new IrrigationSystemEfficiencyContractError(
      "metadata.procedureDescription is required",
    );
  }
  if (!Array.isArray(value.validations)) {
    throw new IrrigationSystemEfficiencyContractError(
      "metadata.validations must be an array",
    );
  }
  if (!isNonEmptyString(value.missingDataPolicy)) {
    throw new IrrigationSystemEfficiencyContractError(
      "metadata.missingDataPolicy is required",
    );
  }
  if (!isValidationStatus(value.expectedResultState)) {
    throw new IrrigationSystemEfficiencyContractError(
      "metadata.expectedResultState is invalid",
    );
  }

  return Object.freeze({
    ...value,
    inputs: cloneArray(value.inputs),
    outputs: cloneArray(value.outputs),
    dependencies: cloneArray(value.dependencies),
    validations: cloneArray(value.validations),
  }) as AgroRuleMetadata;
}

function validateRuleContract(
  value: AgroRuleContract | undefined,
): AgroRuleContract | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isPlainRecord(value) || !isPlainRecord(value.context)) {
    throw new IrrigationSystemEfficiencyContractError("ruleContract is invalid");
  }

  if (!isNonEmptyString(value.ruleId)) {
    throw new IrrigationSystemEfficiencyContractError("ruleContract.ruleId is required");
  }
  if (!isNonEmptyString(value.version)) {
    throw new IrrigationSystemEfficiencyContractError("ruleContract.version is required");
  }
  if (!isAgroRuleState(value.state)) {
    throw new IrrigationSystemEfficiencyContractError("ruleContract.state is invalid");
  }
  if (!isNonEmptyString(value.metadataId)) {
    throw new IrrigationSystemEfficiencyContractError("ruleContract.metadataId is required");
  }
  if (!isNonEmptyString(value.context.ruleId)) {
    throw new IrrigationSystemEfficiencyContractError("ruleContract.context.ruleId is required");
  }
  if (!isNonEmptyString(value.context.version)) {
    throw new IrrigationSystemEfficiencyContractError("ruleContract.context.version is required");
  }
  if (!isNonEmptyString(value.context.purpose)) {
    throw new IrrigationSystemEfficiencyContractError("ruleContract.context.purpose is required");
  }
  if (!isValidationStatus(value.context.requiredStatus)) {
    throw new IrrigationSystemEfficiencyContractError(
      "ruleContract.context.requiredStatus is invalid",
    );
  }
  if (!isProvenance(value.context.provenance)) {
    throw new IrrigationSystemEfficiencyContractError(
      "ruleContract.context.provenance is invalid",
    );
  }

  return Object.freeze({
    ...value,
    context: Object.freeze({
      ...value.context,
      inputFields: cloneArray(
        freezeStringList(
          value.context.inputFields,
          "ruleContract.context.inputFields",
        ),
      ),
      outputFields: cloneArray(
        freezeStringList(
          value.context.outputFields,
          "ruleContract.context.outputFields",
        ),
      ),
      dependencies: cloneArray(
        freezeStringList(
          value.context.dependencies,
          "ruleContract.context.dependencies",
        ),
      ),
    }),
  }) as AgroRuleContract;
}

export function createIrrigationSystemEfficiencyContract(
  input: IrrigationSystemEfficiencyContract,
): Readonly<IrrigationSystemEfficiencyContract> {
  if (!isPlainRecord(input)) {
    throw new IrrigationSystemEfficiencyContractError(
      "irrigation system efficiency contract is required",
    );
  }

  const efficiency = validateEfficiency(input.efficiency);
  const irrigationSystem = validateIrrigationSystem(input.irrigationSystem);
  const source = validateSource(input.source);
  const metadata = validateMetadata(input.metadata);
  const ruleContract = validateRuleContract(input.ruleContract);
  const conditions = validateConditions(input.conditions);

  if (input.notes !== undefined && !isNonEmptyString(input.notes)) {
    throw new IrrigationSystemEfficiencyContractError("notes is invalid");
  }

  if (ruleContract !== undefined && metadata === undefined) {
    throw new IrrigationSystemEfficiencyContractError(
      "metadata is required when ruleContract is provided",
    );
  }

  if (
    metadata !== undefined &&
    ruleContract !== undefined &&
    (metadata.ruleId !== ruleContract.ruleId || metadata.version !== ruleContract.version)
  ) {
    throw new IrrigationSystemEfficiencyContractError(
      "metadata and ruleContract must reference the same ruleId and version",
    );
  }

  return Object.freeze({
    efficiency,
    irrigationSystem,
    ...(source === undefined ? {} : { source }),
    ...(metadata === undefined ? {} : { metadata }),
    ...(ruleContract === undefined ? {} : { ruleContract }),
    ...(conditions === undefined ? {} : { conditions }),
    ...(input.notes === undefined ? {} : { notes: input.notes }),
  });
}
