import { ModuleRef } from "./ModuleProgress.js";
import { ModuleExecutor } from "./ModuleExecutor.js";

export interface ModuleExecutorRegistration {
  readonly moduleRef: ModuleRef;
  readonly executor: ModuleExecutor;
}

export interface CreateModuleExecutorRegistryInput {
  readonly registrations: readonly ModuleExecutorRegistration[];
}

export interface ModuleExecutorRegistry {
  resolve(moduleRef: ModuleRef): ModuleExecutor;
}

export class ModuleExecutorRegistryError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ModuleExecutorRegistryError";
  }
}

export class ModuleExecutorNotFoundError extends Error {
  public readonly moduleRef: ModuleRef;

  public constructor(moduleRef: ModuleRef) {
    super(`module executor is not registered for moduleRef: ${moduleRef}`);
    this.name = "ModuleExecutorNotFoundError";
    this.moduleRef = moduleRef;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isModuleExecutor(value: unknown): value is ModuleExecutor {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { execute?: unknown }).execute === "function"
  );
}

function validateRegistration(
  registration: unknown,
): Readonly<ModuleExecutorRegistration> {
  if (registration === null || typeof registration !== "object" || Array.isArray(registration)) {
    throw new ModuleExecutorRegistryError("registrations must contain valid associations");
  }

  const candidate = registration as ModuleExecutorRegistration;

  if (!isNonEmptyString(candidate.moduleRef)) {
    throw new ModuleExecutorRegistryError("moduleRef is required");
  }

  if (!isModuleExecutor(candidate.executor)) {
    throw new ModuleExecutorRegistryError("executor is required");
  }

  return Object.freeze({
    moduleRef: candidate.moduleRef,
    executor: candidate.executor,
  });
}

export function createModuleExecutorRegistry(
  input: CreateModuleExecutorRegistryInput,
): Readonly<ModuleExecutorRegistry> {
  if (!Array.isArray(input.registrations)) {
    throw new ModuleExecutorRegistryError("registrations must be an array");
  }

  const registrations = input.registrations.map(validateRegistration);
  const executorsByModuleRef = new Map<ModuleRef, ModuleExecutor>();

  for (const registration of registrations) {
    if (executorsByModuleRef.has(registration.moduleRef)) {
      throw new ModuleExecutorRegistryError(
        "registrations must not contain duplicate moduleRef values",
      );
    }

    executorsByModuleRef.set(registration.moduleRef, registration.executor);
  }

  return Object.freeze({
    resolve(moduleRef: ModuleRef): ModuleExecutor {
      if (!isNonEmptyString(moduleRef)) {
        throw new ModuleExecutorRegistryError("moduleRef is required");
      }

      const executor = executorsByModuleRef.get(moduleRef);
      if (executor === undefined) {
        throw new ModuleExecutorNotFoundError(moduleRef);
      }

      return executor;
    },
  });
}
