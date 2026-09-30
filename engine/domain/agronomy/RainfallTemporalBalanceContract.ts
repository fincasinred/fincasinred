import { AgroSourceReference } from "./AgroSourceContract.js";
import { AgroRuleMetadata } from "./AgroRuleMetadata.js";
import { AgroRuleContract } from "./AgroRuleContract.js";
import { ValidationStatus } from "../../../src/domain/shared/ValidationStatus.js";

export enum RainfallBalanceState {
  PENDING = "PENDING",
  PROVISIONAL = "PROVISIONAL",
  BLOCKED = "BLOCKED",
  VALIDATED = "VALIDATED",
}

export interface RainfallTemporalWindow {
  start: string;
  end: string;
  timezone?: string;
}

export interface RainfallTemporalBalanceContract {
  window: RainfallTemporalWindow;
  inputs: string[];
  outputs: string[];
  balanceState: RainfallBalanceState;
  requiredPreconditions: string[];
  noRainfallSubtractionWithoutRule: string;
  source: AgroSourceReference;
  metadata: AgroRuleMetadata;
  ruleContract?: AgroRuleContract;
  status: ValidationStatus;
}
