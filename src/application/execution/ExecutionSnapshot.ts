import {
  createExecutionIdentity,
  ExecutionIdentity,
} from "./ExecutionIdentity.js";

/**
 * Contexto efectivo con el que se ejecutó un cálculo: qué configuración,
 * fuentes, entradas, parámetros y condiciones se usaron.
 *
 * Contiene solo referencias (strings) a configuración/fuentes/entradas, no
 * copias en vivo de `ProjectModel` ni de ningún otro agregado mutable: una
 * modificación posterior del proyecto, de una fuente o de la configuración
 * activa no altera un snapshot ya construido.
 *
 * No contiene ningún resultado calculado: eso pertenece exclusivamente a
 * `IntermediateResult`/`TechnicalResult`.
 *
 * El Documento Maestro exige conservar "parámetros efectivos" y
 * "condiciones relevantes" sin especificar su estructura. Se modelan aquí
 * deliberadamente como registros genéricos (`Record<string, unknown>`) en
 * vez de inventar una forma cerrada no respaldada documentalmente.
 */
export interface ExecutionSnapshot {
  readonly identity: ExecutionIdentity;
  readonly configurationRef: string;
  readonly sourceRefs: readonly string[];
  readonly inputRefs: readonly string[];
  readonly effectiveParameters: Readonly<Record<string, unknown>>;
  readonly conditions?: Readonly<Record<string, unknown>>;
}

export class ExecutionSnapshotError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ExecutionSnapshotError";
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasDuplicates(refs: readonly string[]): boolean {
  return new Set(refs).size !== refs.length;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function validateRefList(
  refs: unknown,
  fieldName: string,
): readonly string[] {
  if (!Array.isArray(refs)) {
    throw new ExecutionSnapshotError(`${fieldName} must be an array`);
  }

  if (refs.some((ref) => !isNonEmptyString(ref))) {
    throw new ExecutionSnapshotError(`${fieldName} must contain non-empty references`);
  }

  if (hasDuplicates(refs)) {
    throw new ExecutionSnapshotError(`${fieldName} must not contain duplicate references`);
  }

  return Object.freeze([...refs]);
}

export function createExecutionSnapshot(
  input: ExecutionSnapshot,
): Readonly<ExecutionSnapshot> {
  const identity = createExecutionIdentity(input.identity);

  if (!isNonEmptyString(input.configurationRef)) {
    throw new ExecutionSnapshotError("configurationRef is required");
  }

  const sourceRefs = validateRefList(input.sourceRefs, "sourceRefs");
  const inputRefs = validateRefList(input.inputRefs, "inputRefs");

  if (!isPlainRecord(input.effectiveParameters)) {
    throw new ExecutionSnapshotError("effectiveParameters must be a plain object");
  }

  const effectiveParameters = Object.freeze({ ...input.effectiveParameters });

  let conditions: Readonly<Record<string, unknown>> | undefined;
  if (input.conditions !== undefined) {
    if (!isPlainRecord(input.conditions)) {
      throw new ExecutionSnapshotError("conditions must be a plain object");
    }

    conditions = Object.freeze({ ...input.conditions });
  }

  return Object.freeze({
    identity,
    configurationRef: input.configurationRef,
    sourceRefs,
    inputRefs,
    effectiveParameters,
    ...(conditions === undefined ? {} : { conditions }),
  });
}
