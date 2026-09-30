export enum EngineProvenance {
  USER_PROVIDED = "USER_PROVIDED",
  MEASURED = "MEASURED",
  CALCULATED = "CALCULATED",
  AUTOMATIC = "AUTOMATIC",
  ESTIMATED = "ESTIMATED",
}

export enum EngineValidationStatus {
  VALIDATED = "VALIDATED",
  PROVISIONAL = "PROVISIONAL",
  PENDING = "PENDING",
  BLOCKED = "BLOCKED",
  INVALID = "INVALID",
}

export enum EngineCriticality {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  CRITICAL = "CRITICAL",
}

export interface TechnicalResult {
  readonly resultVersion: string;
  readonly engineVersion: string;
  readonly rulesVersion: string;
  readonly createdAt: string;
  readonly calculationId: string;
}

export interface TechnicalEvidence {
  readonly provenance: EngineProvenance;
  readonly status: EngineValidationStatus;
  readonly criticality: EngineCriticality;
  readonly source?: string;
}
