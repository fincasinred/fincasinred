import {
  createModuleDependency,
  ModuleDependency,
  ModuleDependencyError,
} from "./ModuleDependency.js";

export interface DependencyGraph {
  readonly dependencies: readonly ModuleDependency[];
}

export class DependencyGraphError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "DependencyGraphError";
  }
}

function dependencyKey(dependency: ModuleDependency): string {
  return `${dependency.moduleRef}->${dependency.dependsOnModuleRef}`;
}

export function createDependencyGraph(
  input: DependencyGraph,
): Readonly<DependencyGraph> {
  if (!Array.isArray(input.dependencies)) {
    throw new DependencyGraphError("dependencies must be an array");
  }

  const dependencies = input.dependencies.map((dependency) => {
    try {
      return createModuleDependency(dependency);
    } catch (error) {
      if (error instanceof ModuleDependencyError) {
        throw new DependencyGraphError(error.message);
      }

      throw error;
    }
  });

  const dependencyKeys = dependencies.map(dependencyKey);
  if (new Set(dependencyKeys).size !== dependencyKeys.length) {
    throw new DependencyGraphError("dependencies must not contain duplicates");
  }

  return Object.freeze({
    dependencies: Object.freeze([...dependencies]),
  });
}
