import { ValidationStatus } from "../../../src/domain/shared/ValidationStatus.js";
import { Provenance } from "../../../src/domain/shared/Provenance.js";
import { TechnicalResult } from "../../shared/types/TechnicalResult.js";

export enum AgroRuleState {
  DRAFT = "DRAFT",
  READY = "READY",
  BLOCKED = "BLOCKED",
  DEPRECATED = "DEPRECATED",
}

export interface AgroRuleExecutionContext {
  ruleId: string;
  version: string;
  purpose: string;
  inputFields: string[];
  outputFields: string[];
  requiredStatus: ValidationStatus;
  dependencies: string[];
  provenance: Provenance;
}

export interface AgroRuleContract {
  ruleId: string;
  version: string;
  state: AgroRuleState;
  metadataId: string;
  sourceContractId?: string;
  context: AgroRuleExecutionContext;
  resultContract?: TechnicalResult;
  notes?: string;
}

export type AgroRuleSignature = string;
