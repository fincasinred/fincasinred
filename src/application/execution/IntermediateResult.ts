import {
  createIdentifiedTechnicalValue,
  IdentifiedTechnicalValue,
} from "../../domain/shared/TechnicalValue.js";
import type { SolarPanelCandidatesIntermediatePayload } from "./SolarPanelCandidatesPreparationContract.js";
import type { SolarPanelSelectionPolicyReference } from "../../domain/catalog/SolarPanelSelectionPolicyContract.js";

/**
 * Resultado producido por un paso de cálculo dentro de una ejecución.
 *
 * Envuelve un `IdentifiedTechnicalValue` ya existente sin modificarlo: la
 * identidad, el valor, la unidad, la procedencia, el estado y la evidencia
 * siguen viviendo y validándose únicamente en `TechnicalValue`/
 * `IdentifiedTechnicalValue`. `methodRef` y `dependencyRefs` son metadatos
 * exclusivos del cálculo que no deben contaminar ese tipo compartido.
 */
export interface SolarPanelSelectionPolicyIntermediatePayload {
  readonly solarPanelSelectionPolicy: Readonly<SolarPanelSelectionPolicyReference>;
}

export interface IntermediateResultPayload {
  readonly solarPanelCandidates?: SolarPanelCandidatesIntermediatePayload["solarPanelCandidates"];
  readonly solarPanelSelectionPolicy?: SolarPanelSelectionPolicyIntermediatePayload["solarPanelSelectionPolicy"];
}

export interface IntermediateResult {
  readonly executionId: string;
  readonly value: IdentifiedTechnicalValue;
  readonly methodRef: string;
  readonly dependencyRefs?: readonly string[];
  readonly payload?: Readonly<IntermediateResultPayload>;
}

export interface PayloadOnlyIntermediateResultInput {
  readonly executionId: string;
  readonly methodRef: string;
  readonly identityPath: string;
  readonly dependencyRefs?: readonly string[];
  readonly payload: Readonly<IntermediateResultPayload>;
}

export type IntermediateResultInput =
  | IntermediateResult
  | PayloadOnlyIntermediateResultInput;

export class IntermediateResultError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "IntermediateResultError";
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasDuplicates(refs: readonly string[]): boolean {
  return new Set(refs).size !== refs.length;
}

function isPayloadOnlyMarker(value: unknown): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as { readonly identity?: unknown };
  return (
    Object.keys(value).length === 1 &&
    candidate.identity !== null &&
    typeof candidate.identity === "object"
  );
}

export function createIntermediateResult(
  input: IntermediateResultInput,
): Readonly<IntermediateResult> {
  if (!isNonEmptyString(input.executionId)) {
    throw new IntermediateResultError("executionId is required");
  }

  if (!isNonEmptyString(input.methodRef)) {
    throw new IntermediateResultError("methodRef is required");
  }

  if (!("value" in input) && !isNonEmptyString(input.identityPath)) {
    throw new IntermediateResultError("identityPath is required for payload-only results");
  }

  const value = "value" in input && !isPayloadOnlyMarker(input.value)
    ? createIdentifiedTechnicalValue(input.value)
    : "value" in input
      ? input.value
      : {
          identity: {
            domain: "payload",
            field: "solarPanelCandidates",
              path: input.identityPath,
          },
        };

  let dependencyRefs: readonly string[] | undefined;
  if (input.dependencyRefs !== undefined) {
    if (!Array.isArray(input.dependencyRefs)) {
      throw new IntermediateResultError("dependencyRefs must be an array");
    }

    if (input.dependencyRefs.some((ref) => !isNonEmptyString(ref))) {
      throw new IntermediateResultError("dependencyRefs must contain non-empty references");
    }

    if (hasDuplicates(input.dependencyRefs)) {
      throw new IntermediateResultError("dependencyRefs must not contain duplicates");
    }

    dependencyRefs = Object.freeze([...input.dependencyRefs]);
  }

  let payload: Readonly<IntermediateResultPayload> | undefined;
  if (input.payload !== undefined) {
    payload = Object.freeze({
      ...(input.payload.solarPanelCandidates === undefined
        ? {}
        : { solarPanelCandidates: input.payload.solarPanelCandidates }),
      ...(input.payload.solarPanelSelectionPolicy === undefined
        ? {}
        : {
            solarPanelSelectionPolicy:
              input.payload.solarPanelSelectionPolicy,
          }),
    });
  }

  return Object.freeze({
    executionId: input.executionId,
    methodRef: input.methodRef,
    value,
    ...(dependencyRefs === undefined ? {} : { dependencyRefs }),
    ...(payload === undefined ? {} : { payload }),
  }) as Readonly<IntermediateResult>;
}

/** Localiza, por identidad semántica estable, el resultado producido por un módulo dependiente. */
export function findIntermediateResultByPath(
  results: readonly IntermediateResult[],
  path: string,
): Readonly<IntermediateResult> | undefined {
  return results.find((result) => result.value.identity.path === path);
}
