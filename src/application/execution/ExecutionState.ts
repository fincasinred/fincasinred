/**
 * Estado del PROCESO de una ejecución (progreso), distinto del estado de
 * VALIDEZ de un dato/resultado (`ValidationStatus`, sin ampliar) y distinto
 * de la completitud de un `TechnicalResult` (`"PARTIAL" | "FINAL"`).
 *
 * Procedencia de cada valor respecto al Documento Maestro (bloque
 * 60.851–60.950 "Orquestador de ejecución", repetido en 93.851–93.950 y
 * 112.951–113.050, y 61.551–61.650 "Ejecuciones interrumpidas"):
 *
 * - El Maestro EXIGE literalmente el concepto de "ejecución parcial"
 *   (→ "PARTIAL") y de "bloqueo"/"bloqueos" (→ "BLOCKED").
 * - El Maestro EXIGE que existan "estados" de ejecución y distingue
 *   conceptualmente "ejecuciones interrumpidas" (61.551–61.650,
 *   84.351–84.450: "interrupciones, checkpoints, snapshots y reanudación
 *   segura") de la recuperabilidad temporal/permanente de un fallo
 *   (50.371–50.380). El Maestro no nombra un valor concreto para este eje;
 *   "INTERRUPTED" es la traducción más fiel de "interrumpida", pero sigue
 *   siendo una elección de nombre nuestra, no una cita literal.
 * - La recuperabilidad (temporal vs. permanente) NO se modela aquí como un
 *   segundo valor del catálogo: es un atributo distinto que deberá vivir en
 *   otro contrato (p. ej. `Checkpoint`), para mantener este catálogo como
 *   un único eje, igual que `ValidationStatus`/`TechnicalResultCompleteness`.
 * - "PENDING", "RUNNING" y "COMPLETED" son PROPUESTA DE DISEÑO nuestra para
 *   completar un ciclo de vida mínimo y coherente; no son cita literal del
 *   Maestro. Se documentan así para no presentarlos como requisito
 *   documental.
 *
 * Esta misión NO implementa transiciones automáticas entre estados: solo
 * define y valida el conjunto cerrado de valores posibles.
 */
export type ExecutionState =
  | "PENDING"
  | "RUNNING"
  | "PARTIAL"
  | "COMPLETED"
  | "BLOCKED"
  | "INTERRUPTED";

export const EXECUTION_STATES: readonly ExecutionState[] = Object.freeze([
  "PENDING",
  "RUNNING",
  "PARTIAL",
  "COMPLETED",
  "BLOCKED",
  "INTERRUPTED",
]);

export class ExecutionStateError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ExecutionStateError";
  }
}

export function isExecutionState(value: unknown): value is ExecutionState {
  return (
    typeof value === "string" &&
    EXECUTION_STATES.includes(value as ExecutionState)
  );
}

export function requireExecutionState(value: unknown): ExecutionState {
  if (!isExecutionState(value)) {
    throw new ExecutionStateError(`execution state is not supported: ${String(value)}`);
  }

  return value;
}
