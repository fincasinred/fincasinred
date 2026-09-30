import { ProjectModel } from "../../domain/project/ProjectModel.js";
import { ValidationStatus } from "../../domain/shared/ValidationStatus.js";

export interface ValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly path: string;
}

export interface ValidationResult {
  readonly status: ValidationStatus;
  readonly issues: readonly ValidationIssue[];
  readonly model?: Readonly<ProjectModel>;
}
