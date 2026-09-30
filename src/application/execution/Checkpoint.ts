import {
  ExecutionState,
  requireExecutionState,
} from "./ExecutionState.js";

export interface Checkpoint {
  readonly checkpointId: string;
  readonly executionId: string;
  readonly executionState: ExecutionState;
  readonly moduleProgressRefs: readonly string[];
}

export class CheckpointError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "CheckpointError";
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasDuplicates(refs: readonly string[]): boolean {
  return new Set(refs).size !== refs.length;
}

function validateModuleProgressRefs(refs: unknown): readonly string[] {
  if (!Array.isArray(refs) || refs.length === 0) {
    throw new CheckpointError("moduleProgressRefs must be a non-empty array");
  }

  if (refs.some((ref) => !isNonEmptyString(ref))) {
    throw new CheckpointError(
      "moduleProgressRefs must contain non-empty references",
    );
  }

  if (hasDuplicates(refs)) {
    throw new CheckpointError(
      "moduleProgressRefs must not contain duplicate references",
    );
  }

  return Object.freeze([...refs]);
}

export function createCheckpoint(input: Checkpoint): Readonly<Checkpoint> {
  if (!isNonEmptyString(input.checkpointId)) {
    throw new CheckpointError("checkpointId is required");
  }

  if (!isNonEmptyString(input.executionId)) {
    throw new CheckpointError("executionId is required");
  }

  const executionState = requireExecutionState(input.executionState);
  const moduleProgressRefs = validateModuleProgressRefs(
    input.moduleProgressRefs,
  );

  return Object.freeze({
    checkpointId: input.checkpointId,
    executionId: input.executionId,
    executionState,
    moduleProgressRefs,
  });
}
