import { Provenance } from "../../../src/domain/shared/Provenance.js";
import { ValidationStatus } from "../../../src/domain/shared/ValidationStatus.js";
import { TechnicalResult } from "../../shared/types/TechnicalResult.js";

export enum AgroRulePurpose {
  ET0_REFERENCE = "ET0_REFERENCE",
  KC_REFERENCE = "KC_REFERENCE",
  ETC_COMPUTATION = "ETC_COMPUTATION",
  CLIMATE_SELECTION = "CLIMATE_SELECTION",
  IRRIGATION_PROGRAMMING = "IRRIGATION_PROGRAMMING",
  OTHER = "OTHER",
}

export interface AgroRuleInputSpec {
  field: string;
  unit: string;
  required: boolean;
  provenance: Provenance;
  notes?: string;
}

export interface AgroRuleOutputSpec {
  field: string;
  unit: string;
  resultStatus: ValidationStatus;
  notes?: string;
}

export interface AgroRuleDependency {
  dependencyId: string;
  dependencyName: string;
  required: boolean;
  source?: string;
}

export interface AgroRuleMetadata {
  ruleId: string;
  version: string;
  purpose: AgroRulePurpose;
  title: string;
  summary: string;
  description: string;
  inputs: AgroRuleInputSpec[];
  outputs: AgroRuleOutputSpec[];
  dependencies: AgroRuleDependency[];
  sourceContractId?: string;
  fao56Reference?: string;
  procedureDescription: string;
  methodReference?: string;
  validations: string[];
  missingDataPolicy: string;
  expectedResultState: ValidationStatus;
  resultShape?: TechnicalResult;
}
