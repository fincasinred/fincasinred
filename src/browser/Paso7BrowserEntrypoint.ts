import {
  executePaso7ProjectExecution,
  type Paso7AgronomyExecutionContext,
  type Paso7ProjectExecutionResult,
} from "../application/execution/Paso7ProjectExecutionAdapter.js";
import {
  resolveSiarStation,
  type SiarStationCatalogEntry,
  type Wgs84Coordinates,
} from "../application/execution/SiarStationResolver.js";
import type { SiarPeriod } from "../application/execution/SiarDailyDataProvider.js";
import type { SessionStorageReader } from "../application/execution/SessionStorageAgronomyPipelineAdapter.js";
import { Provenance } from "../domain/shared/Provenance.js";
import { ValidationStatus } from "../domain/shared/ValidationStatus.js";
import { createIdentifiedTechnicalValue } from "../domain/shared/TechnicalValue.js";

const fastApiBaseUrl =
  process.env.FINCASINRED_FASTAPI_BASE_URL || "https://fincasinred.onrender.com";
const siarBaseUrl = process.env.FINCASINRED_SIAR_BASE_URL ?? "";

function apiUrl(baseUrl: string, path: string): string {
  return baseUrl === "" ? path : `${baseUrl.replace(/\/$/, "")}${path}`;
}

export interface Paso7BrowserExecutionInput {
  readonly context?: Paso7AgronomyExecutionContext;
  /** Optional explicit override; otherwise the server catalog is resolved from PASO 2. */
  readonly stationId?: string;
  /** Optional explicit SIAR query period; PASO 1-6 do not provide it. */
  readonly siarPeriod?: SiarPeriod;
}

export type Paso7BrowserExecutionResult = Paso7ProjectExecutionResult;

function browserSessionStorage(): SessionStorageReader {
  return Object.freeze({
    getItem(key: string): string | null {
      return globalThis.sessionStorage.getItem(key);
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function coordinateFromStep2(value: unknown): Wgs84Coordinates | undefined {
  if (!isRecord(value)) return undefined;
  const latitude = Number(value.latitude ?? value.latitud);
  const longitude = Number(value.longitude ?? value.longitud);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return undefined;
  }
  return { latitude, longitude };
}

async function resolveStationIdFromBrowser(
  storage: SessionStorageReader,
): Promise<string | undefined> {
  const rawStep2 = storage.getItem("fincasinred_paso2");
  if (rawStep2 === null) return undefined;

  let step2: unknown;
  try {
    step2 = JSON.parse(rawStep2);
  } catch {
    return undefined;
  }

  const farmCoordinates = coordinateFromStep2(step2);
  if (farmCoordinates === undefined) return undefined;

  try {
    const response = await fetch(apiUrl(fastApiBaseUrl, "/api/siar/stations"), {
      headers: { accept: "application/json" },
    });
    if (!response.ok) return undefined;
    const body: unknown = await response.json();
    if (!isRecord(body) || !Array.isArray(body.stations)) return undefined;

    const resolution = resolveSiarStation({
      farmCoordinates,
      catalog: body.stations as readonly SiarStationCatalogEntry[],
    });
    return resolution.status === "RESOLVED"
      ? resolution.selection.stationId
      : undefined;
  } catch {
    return undefined;
  }
}

interface SiarDataResponse {
  readonly status: string;
  readonly eto?: { readonly value?: unknown };
  readonly effectiveRainfall?: { readonly value?: unknown };
}

async function fetchSiarData(
  stationId: string,
  siarPeriod: SiarPeriod,
): Promise<Readonly<SiarDataResponse> | undefined> {
  try {
    const response = await fetch(apiUrl(siarBaseUrl, "/api/paso7/siar-data"), {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ stationId, siarPeriod }),
    });
    if (!response.ok) return undefined;
    const body: unknown = await response.json();
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return undefined;
    }
    return body as SiarDataResponse;
  } catch {
    return undefined;
  }
}

function identifiedMillimetres(
  value: unknown,
  field: "eto" | "effectiveRainfall",
  sourceRef: string,
) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return createIdentifiedTechnicalValue({
    value,
    unit: "mm",
    provenance: Provenance.AUTOMATIC,
    status: ValidationStatus.VALIDATED,
    evidence: { sourceReference: sourceRef },
    identity: {
      field,
      domain: "agronomy",
      path:
        field === "eto"
          ? "agronomy.inputs.eto"
          : "agronomy.inputs.effectiveRainfallObserved",
    },
  });
}

export function executePaso7ProjectExecutionFromBrowser(
  input: Readonly<Paso7BrowserExecutionInput> = {},
): Promise<Readonly<Paso7BrowserExecutionResult>> {
  return (async () => {
    const storage = browserSessionStorage();
    const explicitStationId = input.stationId ?? input.context?.stationId;
    const stationId =
      explicitStationId ?? (await resolveStationIdFromBrowser(storage));
    const siarPeriod = input.siarPeriod ?? input.context?.siarPeriod;
    const siarData =
      stationId !== undefined && siarPeriod !== undefined
        ? await fetchSiarData(stationId, siarPeriod)
        : undefined;
    const sourceRef =
      stationId !== undefined && siarPeriod !== undefined
        ? `SIAR:${stationId}:${siarPeriod.startDate}:${siarPeriod.endDate}`
        : "SIAR";
    const eto = identifiedMillimetres(siarData?.eto?.value, "eto", sourceRef);
    const effectiveRainfallObserved = identifiedMillimetres(
      siarData?.effectiveRainfall?.value,
      "effectiveRainfall",
      sourceRef,
    );
    const context = {
      ...(input.context ?? {}),
      ...(stationId === undefined ? {} : { stationId }),
      ...(siarPeriod === undefined ? {} : { siarPeriod }),
      ...(eto === undefined ? {} : { eto }),
      ...(effectiveRainfallObserved === undefined
        ? {}
        : { effectiveRainfallObserved }),
    };

    return executePaso7ProjectExecution({
      storage,
      context,
    });
  })();
}