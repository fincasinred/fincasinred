import { AgroSourceContract, AgroSourceReference } from "./AgroSourceContract.js";
import { AgroRuleMetadata } from "./AgroRuleMetadata.js";
import { AgroRuleContract } from "./AgroRuleContract.js";
import { ValidationStatus } from "../../../src/domain/shared/ValidationStatus.js";

export enum EffectiveRainfallMode {
  REFERENCE = "REFERENCE",
  ESTIMATION = "ESTIMATION",
  OBSERVED = "OBSERVED",
}

export interface EffectiveRainfallInputSpec {
  field: string;
  description: string;
  unit?: string;
  required: boolean;
}

export interface EffectiveRainfallOutputSpec {
  field: string;
  resultDescription: string;
  unit?: string;
  status: ValidationStatus;
}

export interface EffectiveRainfallContract {
  mode: EffectiveRainfallMode;
  policyName: string;
  summary: string;
  description: string;
  inputSpecs: EffectiveRainfallInputSpec[];
  outputSpecs: EffectiveRainfallOutputSpec[];
  source: AgroSourceReference;
  metadata: AgroRuleMetadata;
  ruleContract?: AgroRuleContract;
  notes?: string;
}
