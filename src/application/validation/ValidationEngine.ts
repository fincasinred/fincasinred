import { createProject } from "../../domain/project/Project.js";
import {
  ProjectModel,
  ProjectTechnicalData,
  projectDomainsFromTechnicalData,
} from "../../domain/project/ProjectModel.js";
import { ProjectStatus } from "../../domain/project/ProjectStatus.js";
import { isProjectVersion } from "../../domain/project/ProjectVersion.js";
import { Provenance } from "../../domain/shared/Provenance.js";
import {
  createIdentifiedTechnicalValue,
  IdentifiedTechnicalValue,
  isTechnicalValueEvidence,
} from "../../domain/shared/TechnicalValue.js";
import { ValidationStatus } from "../../domain/shared/ValidationStatus.js";
import { cloneAndFreeze } from "../normalization/NormalizationEngine.js";
import { isSupportedUnit } from "../../shared/units/UnitCatalog.js";
import { EngineError } from "../../shared/errors/EngineError.js";
import {
  ValidationIssue,
  ValidationResult,
} from "./ValidationResult.js";

export interface ValidationEngine {
  validate(model: unknown): ValidationResult;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

interface ProjectCore {
  readonly projectId: string;
  readonly version: ProjectModel["version"];
  readonly createdAt: ProjectModel["createdAt"];
  readonly updatedAt: ProjectModel["updatedAt"];
  readonly status: ProjectStatus;
}

function isProjectStatus(value: unknown): value is ProjectStatus {
  return Object.values(ProjectStatus).includes(value as ProjectStatus);
}

function isProjectCore(
  value: Record<string, unknown>,
): value is ProjectCore & Record<string, unknown> {
  return (
    typeof value.projectId === "string" &&
    isProjectVersion(value.version) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    isProjectStatus(value.status)
  );
}

function isProvenance(value: unknown): value is Provenance {
  return Object.values(Provenance).includes(value as Provenance);
}

function isValidationStatus(value: unknown): value is ValidationStatus {
  return Object.values(ValidationStatus).includes(value as ValidationStatus);
}

function isTechnicalValueIdentity(value: unknown): value is IdentifiedTechnicalValue["identity"] {
  return (
    isRecord(value) &&
    typeof value.field === "string" &&
    value.field.trim().length > 0 &&
    typeof value.path === "string" &&
    value.path.trim().length > 0 &&
    (value.domain === undefined ||
      (typeof value.domain === "string" && value.domain.trim().length > 0))
  );
}

function isTechnicalValue(value: unknown): value is IdentifiedTechnicalValue {
  return (
    isRecord(value) &&
    typeof value.value === "number" &&
    Number.isFinite(value.value) &&
    typeof value.unit === "string" &&
    value.unit.length > 0 &&
    isProvenance(value.provenance) &&
    isValidationStatus(value.status) &&
    isTechnicalValueIdentity(value.identity) &&
    (value.evidence === undefined || isTechnicalValueEvidence(value.evidence))
  );
}

function isProjectTechnicalData(
  value: unknown,
): value is ProjectTechnicalData | undefined {
  return (
    value === undefined ||
    (isRecord(value) &&
      (value.values === undefined || Array.isArray(value.values)))
  );
}

function issue(
  code: string,
  message: string,
  path: string,
): ValidationIssue {
  return Object.freeze({ code, message, path });
}

function statusFromValues(
  values: readonly { status: ValidationStatus }[],
): ValidationStatus {
  const statuses = new Set(values.map((value) => value.status));
  if (statuses.has(ValidationStatus.INVALID)) {
    return ValidationStatus.INVALID;
  }
  if (statuses.has(ValidationStatus.BLOCKED)) {
    return ValidationStatus.BLOCKED;
  }
  if (statuses.has(ValidationStatus.PROVISIONAL)) {
    return ValidationStatus.PROVISIONAL;
  }
  if (statuses.has(ValidationStatus.PENDING)) {
    return ValidationStatus.PENDING;
  }
  return ValidationStatus.VALIDATED;
}

export class DeterministicValidationEngine implements ValidationEngine {
  public validate(model: unknown): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!isRecord(model)) {
      return Object.freeze({
        status: ValidationStatus.INVALID,
        issues: Object.freeze([
          issue("model.invalid", "Model must be an object", "model"),
        ]),
      });
    }

    const technicalData = model.technicalData;
    const projectCore = isProjectCore(model) ? model : undefined;

    try {
      if (projectCore === undefined) {
        throw new EngineError("Project core fields are invalid", "model.invalid");
      }
      createProject({
        projectId: projectCore.projectId,
        version: projectCore.version,
        createdAt: projectCore.createdAt,
        updatedAt: projectCore.updatedAt,
        status: projectCore.status,
        ...projectDomainsFromTechnicalData(
          isProjectTechnicalData(technicalData) ? technicalData : undefined,
        ),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid project";
      issues.push(issue("model.invalid", message, "model"));
    }

    if (!isProjectTechnicalData(technicalData)) {
      issues.push(
        issue(
          "technicalData.invalid",
          "technicalData must be an object",
          "technicalData",
        ),
      );
    }

    const values = isRecord(technicalData) ? technicalData.values : undefined;
    if (values !== undefined && !Array.isArray(values)) {
      issues.push(
        issue(
          "technicalData.values.invalid",
          "technicalData.values must be an array",
          "technicalData.values",
        ),
      );
    }

    const validValues: Array<{ status: ValidationStatus }> = [];
    if (Array.isArray(values)) {
      values.forEach((value, index) => {
        try {
          if (!isTechnicalValue(value)) {
            throw new EngineError("Technical value is invalid", "technicalData.value.invalid");
          }
          if (!isSupportedUnit(value.unit)) {
            throw new EngineError("unit is not supported", "technicalData.value.invalid");
          }
          const validated = createIdentifiedTechnicalValue(value);
          validValues.push(validated);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Invalid value";
          issues.push(
            issue(
              "technicalData.value.invalid",
              message,
              `technicalData.values[${index}]`,
            ),
          );
        }
      });
    }

    if (issues.length > 0) {
      return Object.freeze({
        status: ValidationStatus.INVALID,
        issues: Object.freeze(issues),
      });
    }

    if (projectCore === undefined || !isProjectTechnicalData(technicalData)) {
      return Object.freeze({
        status: ValidationStatus.INVALID,
        issues: Object.freeze([
          issue("model.invalid", "Model structure is invalid", "model"),
        ]),
      });
    }

    const validatedModel: ProjectModel = {
      projectId: projectCore.projectId,
      version: projectCore.version,
      createdAt: projectCore.createdAt,
      updatedAt: projectCore.updatedAt,
      status: projectCore.status,
      ...(technicalData === undefined ? {} : { technicalData }),
    };
    const protectedTechnicalData =
      validatedModel.technicalData === undefined
        ? undefined
        : cloneAndFreeze(validatedModel.technicalData);
    const protectedModel: Readonly<ProjectModel> = Object.freeze({
      projectId: validatedModel.projectId,
      version: validatedModel.version,
      createdAt: validatedModel.createdAt,
      updatedAt: validatedModel.updatedAt,
      status: validatedModel.status,
      ...(protectedTechnicalData === undefined
        ? {}
        : { technicalData: protectedTechnicalData }),
    });

    if (values === undefined || !Array.isArray(values) || values.length === 0) {
      issues.push(
        issue(
          "technicalData.incomplete",
          "Technical values are not available",
          "technicalData.values",
        ),
      );
      return Object.freeze({
        status: ValidationStatus.PENDING,
        issues: Object.freeze(issues),
        model: protectedModel,
      });
    }

    return Object.freeze({
      status: statusFromValues(validValues),
      issues: Object.freeze(issues),
      model: protectedModel,
    });
  }
}
