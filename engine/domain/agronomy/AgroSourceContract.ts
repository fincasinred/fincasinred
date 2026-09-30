import { Provenance } from "../../../src/domain/shared/Provenance.js";
import { ValidationStatus } from "../../../src/domain/shared/ValidationStatus.js";

export enum AgroSourceType {
  EXTERNAL_DATA = "EXTERNAL_DATA",
  EXTERNAL_METHOD = "EXTERNAL_METHOD",
  INTERNAL_RULE = "INTERNAL_RULE",
}

export enum AgroSourceVersionStatus {
  DRAFT = "DRAFT",
  APPROVED = "APPROVED",
  DEPRECATED = "DEPRECATED",
}

export interface AgroSourceReference {
  sourceId: string;
  sourceName: string;
  sourceType: AgroSourceType;
  version: string;
  versionStatus: AgroSourceVersionStatus;
  citation?: string;
  uri?: string;
  provenance: Provenance;
  validationStatus: ValidationStatus;
}

export interface AgroSourceContract {
  source: AgroSourceReference;
  methodologyContext: string;
  interpretationRule: string;
  inputFields: string[];
  outputFields: string[];
  notes?: string;
}
