import { AgroSourceReference } from "./AgroSourceContract.js";
import { AgroRuleMetadata } from "./AgroRuleMetadata.js";
import { AgroRuleContract } from "./AgroRuleContract.js";
import { ValidationStatus } from "../../../src/domain/shared/ValidationStatus.js";

export enum RainfallExcessKind {
  STORAGE_EXCESS = "STORAGE_EXCESS",
  RUNOFF_EXCESS = "RUNOFF_EXCESS",
  UNSUPPORTED_EXCESS = "UNSUPPORTED_EXCESS",
}

export interface RainfallExcessRule {
  kind: RainfallExcessKind;
  description: string;
  preconditions: string[];
  triggeringCondition: string;
  source: AgroSourceReference;
  metadata: AgroRuleMetadata;
  ruleContract?: AgroRuleContract;
}

export interface RainfallExcessContract {
  rule: RainfallExcessRule;
  status: ValidationStatus;
  outputs: string[];
  notes?: string;
}
