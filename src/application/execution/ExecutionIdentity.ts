/**
 * Identidad mínima de una ejecución técnica: permite responder únicamente
 * "¿es exactamente la misma ejecución?", sin conservar el contexto completo
 * (eso vive en `ExecutionSnapshot`).
 *
 * `fingerprint` se trata como un valor opaco: esta misión NO decide ni
 * implementa el algoritmo que lo genera (queda para una misión posterior).
 */
export interface ExecutionIdentity {
  readonly executionId: string;
  readonly fingerprint: string;
  readonly engineVersion: string;
  readonly rulesVersion: string;
  readonly createdAt: string;
}

export class ExecutionIdentityError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ExecutionIdentityError";
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseIsoDate(value: unknown, fieldName: string): string {
  if (!isNonEmptyString(value)) {
    throw new ExecutionIdentityError(`${fieldName} must be an ISO date`);
  }

  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new ExecutionIdentityError(`${fieldName} must be a valid ISO date`);
  }

  return value;
}

export function createExecutionIdentity(
  input: ExecutionIdentity,
): Readonly<ExecutionIdentity> {
  if (!isNonEmptyString(input.executionId)) {
    throw new ExecutionIdentityError("executionId is required");
  }

  if (!isNonEmptyString(input.fingerprint)) {
    throw new ExecutionIdentityError("fingerprint is required");
  }

  if (!isNonEmptyString(input.engineVersion)) {
    throw new ExecutionIdentityError("engineVersion is required");
  }

  if (!isNonEmptyString(input.rulesVersion)) {
    throw new ExecutionIdentityError("rulesVersion is required");
  }

  const createdAt = parseIsoDate(input.createdAt, "createdAt");

  return Object.freeze({
    executionId: input.executionId,
    fingerprint: input.fingerprint,
    engineVersion: input.engineVersion,
    rulesVersion: input.rulesVersion,
    createdAt,
  });
}
