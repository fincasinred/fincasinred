import { createProject } from "../../domain/project/Project.js";
import {
  ProjectModel,
  ProjectModelInput,
  ProjectTechnicalData,
  projectDomainsFromTechnicalData,
} from "../../domain/project/ProjectModel.js";
import { NormalizationResult } from "./NormalizationResult.js";

export class NormalizationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "NormalizationError";
  }
}

export interface NormalizationEngine {
  normalize(input: ProjectModelInput): NormalizationResult;
}

export function cloneAndFreeze<T>(
  value: T,
  seen = new WeakMap<object, unknown>(),
  inProgress = new WeakSet<object>(),
): T {
  if (value === null) {
    return value;
  }

  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new NormalizationError("Non-finite numbers are not JSON compatible");
    }
    return value;
  }

  if (typeof value !== "object") {
    throw new NormalizationError("Value is not JSON compatible");
  }

  if (inProgress.has(value)) {
    throw new NormalizationError("Cyclic structures are not supported");
  }

  const existing = seen.get(value);
  if (existing !== undefined) {
    return existing as T;
  }

  if (Array.isArray(value)) {
    const arrayKeys = Reflect.ownKeys(value);
    const stringKeys = arrayKeys.filter(
      (key): key is string => typeof key === "string",
    );
    if (stringKeys.length !== arrayKeys.length) {
      throw new NormalizationError("Symbol properties are not JSON compatible");
    }
    if (
      stringKeys.some(
        (key) =>
          key !== "length" &&
          (!/^\d+$/.test(key) || Number(key) >= value.length),
      )
    ) {
      throw new NormalizationError("Array properties are not JSON compatible");
    }
    if (value.some((item) => item === undefined)) {
      throw new NormalizationError("Undefined array values are not JSON compatible");
    }

    const clone: unknown[] = [];
    seen.set(value, clone);
    for (const item of value) {
      clone.push(cloneAndFreeze(item, seen));
    }
    return Object.freeze(clone) as T;
  }

  if (value instanceof Date) {
    throw new NormalizationError("Date values are not supported");
  }

  if (Object.getPrototypeOf(value) !== Object.prototype) {
    throw new NormalizationError("Only plain JSON objects are supported");
  }

  const clone: Record<string, unknown> = {};
  seen.set(value, clone);
  inProgress.add(value);
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== "string")) {
    throw new NormalizationError("Symbol properties are not JSON compatible");
  }
  if (ownKeys.some((key) => !Object.prototype.propertyIsEnumerable.call(value, key))) {
    throw new NormalizationError("Non-enumerable properties are not JSON compatible");
  }
  for (const [key, child] of Object.entries(value)) {
    clone[key] = cloneAndFreeze(child, seen, inProgress);
  }
  inProgress.delete(value);
  return Object.freeze(clone) as T;
}

function cloneTechnicalData(
  technicalData: ProjectTechnicalData | undefined,
): ProjectTechnicalData | undefined {
  if (technicalData === undefined) {
    return undefined;
  }

  return cloneAndFreeze(technicalData);
}

export class DeterministicNormalizationEngine implements NormalizationEngine {
  public normalize(input: ProjectModelInput): NormalizationResult {
    const project = createProject({
      projectId: input.projectId,
      version: input.version,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
      status: input.status,
      ...projectDomainsFromTechnicalData(input.technicalData),
    });
    const original = cloneAndFreeze(input);
    const technicalData = cloneTechnicalData(input.technicalData);
    const model: Readonly<ProjectModel> = Object.freeze({
      projectId: project.projectId,
      version: project.version,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      status: project.status,
      ...(technicalData === undefined ? {} : { technicalData }),
    });

    return Object.freeze({ original, model });
  }
}
