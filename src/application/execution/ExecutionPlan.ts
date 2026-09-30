import { ModuleRef } from "./ModuleProgress.js";
import {
  createDependencyGraph,
  DependencyGraph,
  DependencyGraphError,
} from "./DependencyGraph.js";

export interface ExecutionPlan {
  readonly moduleRefs: readonly ModuleRef[];
  readonly dependencyGraph: DependencyGraph;
}

export class ExecutionPlanError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ExecutionPlanError";
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function validateModuleRefs(moduleRefs: unknown): readonly ModuleRef[] {
  if (!Array.isArray(moduleRefs) || moduleRefs.length === 0) {
    throw new ExecutionPlanError("moduleRefs must be a non-empty array");
  }

  if (moduleRefs.some((moduleRef) => !isNonEmptyString(moduleRef))) {
    throw new ExecutionPlanError(
      "moduleRefs must contain non-empty module references",
    );
  }

  if (hasDuplicates(moduleRefs)) {
    throw new ExecutionPlanError("moduleRefs must not contain duplicates");
  }

  return Object.freeze([...moduleRefs]);
}

function validateDependencyEndpoints(
  moduleRefs: readonly ModuleRef[],
  dependencyGraph: Readonly<DependencyGraph>,
): void {
  const moduleRefSet = new Set(moduleRefs);

  for (const dependency of dependencyGraph.dependencies) {
    if (!moduleRefSet.has(dependency.moduleRef)) {
      throw new ExecutionPlanError(
        "dependency.moduleRef must exist in moduleRefs",
      );
    }

    if (!moduleRefSet.has(dependency.dependsOnModuleRef)) {
      throw new ExecutionPlanError(
        "dependency.dependsOnModuleRef must exist in moduleRefs",
      );
    }
  }
}

function validateAcyclicGraph(
  moduleRefs: readonly ModuleRef[],
  dependencyGraph: Readonly<DependencyGraph>,
): void {
  const incomingCount = new Map<ModuleRef, number>();
  const dependentsByModule = new Map<ModuleRef, ModuleRef[]>();

  for (const moduleRef of moduleRefs) {
    incomingCount.set(moduleRef, 0);
    dependentsByModule.set(moduleRef, []);
  }

  for (const dependency of dependencyGraph.dependencies) {
    incomingCount.set(
      dependency.moduleRef,
      (incomingCount.get(dependency.moduleRef) ?? 0) + 1,
    );
    dependentsByModule.get(dependency.dependsOnModuleRef)?.push(
      dependency.moduleRef,
    );
  }

  const queue = moduleRefs.filter(
    (moduleRef) => incomingCount.get(moduleRef) === 0,
  );
  let visitedCount = 0;

  while (queue.length > 0) {
    const moduleRef = queue.shift();
    if (moduleRef === undefined) {
      continue;
    }

    visitedCount += 1;

    for (const dependent of dependentsByModule.get(moduleRef) ?? []) {
      const nextIncomingCount = (incomingCount.get(dependent) ?? 0) - 1;
      incomingCount.set(dependent, nextIncomingCount);

      if (nextIncomingCount === 0) {
        queue.push(dependent);
      }
    }
  }

  if (visitedCount !== moduleRefs.length) {
    throw new ExecutionPlanError("dependencyGraph must not contain cycles");
  }
}

export function createExecutionPlan(
  input: ExecutionPlan,
): Readonly<ExecutionPlan> {
  const moduleRefs = validateModuleRefs(input.moduleRefs);

  let dependencyGraph: Readonly<DependencyGraph>;
  try {
    dependencyGraph = createDependencyGraph(input.dependencyGraph);
  } catch (error) {
    if (error instanceof DependencyGraphError) {
      throw new ExecutionPlanError(error.message);
    }

    throw error;
  }

  validateDependencyEndpoints(moduleRefs, dependencyGraph);
  validateAcyclicGraph(moduleRefs, dependencyGraph);

  return Object.freeze({
    moduleRefs,
    dependencyGraph,
  });
}
