import { ProjectStatus } from "./ProjectStatus.js";
import {
  isProjectVersion,
  ProjectVersion,
} from "./ProjectVersion.js";

export type ProjectDomainData = Readonly<Record<string, unknown>>;
export type IsoDateTime = string;

export interface ProjectTechnicalDomains {
  readonly location?: ProjectDomainData;
  readonly crop?: ProjectDomainData;
  readonly planting?: ProjectDomainData;
  readonly water?: ProjectDomainData;
  readonly irrigation?: ProjectDomainData;
  readonly energy?: ProjectDomainData;
  readonly automation?: ProjectDomainData;
  readonly measurements?: ProjectDomainData;
  readonly assumptions?: ProjectDomainData;
  readonly traceability?: ProjectDomainData;
  readonly provenance?: ProjectDomainData;
  readonly validation?: ProjectDomainData;
}

export interface Project extends ProjectTechnicalDomains {
  readonly projectId: string;
  readonly version: ProjectVersion;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
  readonly status: ProjectStatus;
}

export class ProjectValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ProjectValidationError";
  }
}

function isProjectStatus(value: unknown): value is ProjectStatus {
  return Object.values(ProjectStatus).includes(value as ProjectStatus);
}

export interface CreateProjectInput extends ProjectTechnicalDomains {
  readonly projectId: string;
  readonly version: ProjectVersion;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
  readonly status: ProjectStatus;
}

function parseIsoDate(value: unknown, fieldName: string): IsoDateTime {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ProjectValidationError(`${fieldName} must be an ISO date`);
  }

  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new ProjectValidationError(`${fieldName} must be a valid ISO date`);
  }

  return value;
}

function preserveDomainData(
  value: ProjectDomainData | undefined,
  fieldName: string,
): ProjectDomainData | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ProjectValidationError(`${fieldName} must be an object`);
  }

  return Object.freeze({ ...value });
}

export function createProject(input: CreateProjectInput): Readonly<Project> {
  if (typeof input.projectId !== "string" || input.projectId.trim().length === 0) {
    throw new ProjectValidationError("projectId is required");
  }

  if (!isProjectStatus(input.status)) {
    throw new ProjectValidationError("status is invalid");
  }

  if (!isProjectVersion(input.version)) {
    throw new ProjectValidationError("version is invalid");
  }

  if (input.version.projectId !== input.projectId) {
    throw new ProjectValidationError("version must belong to projectId");
  }

  const createdAt = parseIsoDate(input.createdAt, "createdAt");
  const updatedAt = parseIsoDate(input.updatedAt, "updatedAt");

  if (Date.parse(updatedAt) < Date.parse(createdAt)) {
    throw new ProjectValidationError("updatedAt cannot precede createdAt");
  }

  const location = preserveDomainData(input.location, "location");
  const crop = preserveDomainData(input.crop, "crop");
  const planting = preserveDomainData(input.planting, "planting");
  const water = preserveDomainData(input.water, "water");
  const irrigation = preserveDomainData(input.irrigation, "irrigation");
  const energy = preserveDomainData(input.energy, "energy");
  const automation = preserveDomainData(input.automation, "automation");
  const measurements = preserveDomainData(input.measurements, "measurements");
  const assumptions = preserveDomainData(input.assumptions, "assumptions");
  const traceability = preserveDomainData(input.traceability, "traceability");
  const provenance = preserveDomainData(input.provenance, "provenance");
  const validation = preserveDomainData(input.validation, "validation");

  return Object.freeze({
    projectId: input.projectId,
    version: input.version,
    createdAt,
    updatedAt,
    status: input.status,
    ...(location === undefined ? {} : { location }),
    ...(crop === undefined ? {} : { crop }),
    ...(planting === undefined ? {} : { planting }),
    ...(water === undefined ? {} : { water }),
    ...(irrigation === undefined ? {} : { irrigation }),
    ...(energy === undefined ? {} : { energy }),
    ...(automation === undefined ? {} : { automation }),
    ...(measurements === undefined ? {} : { measurements }),
    ...(assumptions === undefined ? {} : { assumptions }),
    ...(traceability === undefined ? {} : { traceability }),
    ...(provenance === undefined ? {} : { provenance }),
    ...(validation === undefined ? {} : { validation }),
  });
}
