export interface ProjectVersion {
  readonly projectId: string;
  readonly version: number;
  readonly versionId: string;
}

const projectVersions = new WeakSet<object>();

function buildVersionId(projectId: string, version: number): string {
  return `${projectId}:v${version}`;
}

export class ProjectVersionError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ProjectVersionError";
  }
}

export function createProjectVersion(
  projectId: string,
  version: number,
): Readonly<ProjectVersion> {
  if (typeof projectId !== "string" || projectId.trim().length === 0) {
    throw new ProjectVersionError("projectId is required");
  }

  if (!Number.isInteger(version) || version < 1) {
    throw new ProjectVersionError("version must be a positive integer");
  }

  const projectVersion = Object.freeze({
    projectId,
    version,
    versionId: buildVersionId(projectId, version),
  });

  projectVersions.add(projectVersion);
  return projectVersion;
}

export function isProjectVersion(value: unknown): value is ProjectVersion {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ProjectVersion>;
  return (
    projectVersions.has(value) &&
    typeof candidate.projectId === "string" &&
    candidate.projectId.trim().length > 0 &&
    typeof candidate.version === "number" &&
    Number.isInteger(candidate.version) &&
    candidate.version > 0 &&
    candidate.versionId === buildVersionId(candidate.projectId, candidate.version)
  );
}
