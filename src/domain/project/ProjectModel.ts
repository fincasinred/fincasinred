import {
  IsoDateTime,
  ProjectTechnicalDomains,
} from "./Project.js";
import { ProjectStatus } from "./ProjectStatus.js";
import { ProjectVersion } from "./ProjectVersion.js";
import { IdentifiedTechnicalValue } from "../shared/TechnicalValue.js";

export interface ProjectTechnicalData extends ProjectTechnicalDomains {
  readonly values?: readonly IdentifiedTechnicalValue[];
}

export interface ProjectModel {
  readonly projectId: string;
  readonly version: ProjectVersion;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
  readonly status: ProjectStatus;
  readonly technicalData?: ProjectTechnicalData;
}

export type ProjectModelInput = ProjectModel;

export function projectDomainsFromTechnicalData(
  technicalData: ProjectTechnicalData | undefined,
): ProjectTechnicalDomains {
  if (technicalData === undefined) {
    return {};
  }

  const { values: _values, ...domains } = technicalData;
  return domains;
}
