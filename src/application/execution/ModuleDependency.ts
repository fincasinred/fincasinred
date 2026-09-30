import { ModuleRef } from "./ModuleProgress.js";

export interface ModuleDependency {
  readonly moduleRef: ModuleRef;
  readonly dependsOnModuleRef: ModuleRef;
}

export class ModuleDependencyError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ModuleDependencyError";
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function createModuleDependency(
  input: ModuleDependency,
): Readonly<ModuleDependency> {
  if (!isNonEmptyString(input.moduleRef)) {
    throw new ModuleDependencyError("moduleRef is required");
  }

  if (!isNonEmptyString(input.dependsOnModuleRef)) {
    throw new ModuleDependencyError("dependsOnModuleRef is required");
  }

  if (input.moduleRef === input.dependsOnModuleRef) {
    throw new ModuleDependencyError(
      "a module cannot depend on itself",
    );
  }

  return Object.freeze({
    moduleRef: input.moduleRef,
    dependsOnModuleRef: input.dependsOnModuleRef,
  });
}
