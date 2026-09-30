import { Provenance } from "../../domain/shared/Provenance.js";
import { ValidationStatus } from "../../domain/shared/ValidationStatus.js";
import type {
  EffectiveRainfallExternalAdapterInput,
  EtoExternalAdapterInput,
} from "../../../engine/domain/agronomy/AgronomyExternalInputAdapters.js";
import type {
  SiarEffectiveRainfallProvider,
  SiarEtoProvider,
} from "../../../engine/domain/agronomy/AgronomyExternalInputPorts.js";

export const SIAR_API_BASE_URL = "https://servicio.mapa.gob.es/siarapi";
export const SIAR_API_TOKEN_ENV_VAR = "FINCASINRED_SIAR_API_TOKEN";
export const SIAR_DAILY_CCAA_PATH = "/API/V1/Datos/Diarios/CCAA";
export const SIAR_DAILY_STATION_PATH = "/API/V1/Datos/Diarios/ESTACION";
export const SIAR_DEFAULT_DATASET_ID = "EXT";

export interface SiarDailyDataRequest {
  readonly startDate: string;
  readonly endDate: string;
  readonly id?: string;
  readonly datosCalculados?: boolean;
  readonly stationId?: string;
}

export type SiarPeriod = Pick<
  SiarDailyDataRequest,
  "startDate" | "endDate"
>;

interface SiarHttpResponseLike {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

type SiarHttpFetch = (
  url: string,
  init: {
    readonly method: "GET";
    readonly headers: Readonly<Record<string, string>>;
    readonly signal: AbortSignal;
  },
) => Promise<SiarHttpResponseLike>;

export type SiarProviderErrorKind =
  | "CONFIGURATION"
  | "AUTHENTICATION"
  | "MINIMUM_DATE_RESTRICTION"
  | "HTTP"
  | "STATION_NOT_SELECTED"
  | "RESPONSE";

export class SiarProviderError extends Error {
  public readonly kind: SiarProviderErrorKind;
  public readonly statusCode?: number;

  public constructor(
    kind: SiarProviderErrorKind,
    message: string,
    statusCode?: number,
  ) {
    super(message);
    this.name = "SiarProviderError";
    this.kind = kind;
    if (statusCode === undefined) return;
    this.statusCode = statusCode;
  }
}

interface CreateSiarDailyDataProviderInput {
  readonly apiToken: string;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly fetch?: SiarHttpFetch;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function requireString(value: unknown, field: string): string {
  if (!isNonEmptyString(value)) {
    throw new SiarProviderError("RESPONSE", `SIAR response is missing ${field}`);
  }
  return value;
}

function requireFiniteNumber(value: unknown, field: string): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(parsed)) {
    throw new SiarProviderError("RESPONSE", `SIAR response has invalid ${field}`);
  }
  return parsed;
}

function requireDate(value: unknown, field: string): string {
  const result = requireString(value, field);
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(result)) {
    throw new SiarProviderError("RESPONSE", `SIAR ${field} must be an ISO date`);
  }
  return result;
}

function normalizeBaseUrl(value: string): string {
  if (!isNonEmptyString(value)) {
    throw new SiarProviderError("CONFIGURATION", "SIAR base URL is required");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SiarProviderError("CONFIGURATION", "SIAR base URL is invalid");
  }

  if (url.protocol !== "https:") {
    throw new SiarProviderError("CONFIGURATION", "SIAR base URL must use HTTPS");
  }

  return url.href.endsWith("/") ? url.href.slice(0, -1) : url.href;
}

function resolveFetch(candidate?: SiarHttpFetch): SiarHttpFetch {
  if (candidate !== undefined) return candidate;
  if (typeof fetch !== "function") {
    throw new SiarProviderError("CONFIGURATION", "fetch is not available");
  }
  return async (url, init) => fetch(url, init);
}

function validateRequest(request: Readonly<Record<string, unknown>>): SiarDailyDataRequest {
  const startDate = requireString(request.startDate, "request.startDate");
  const endDate = requireString(request.endDate, "request.endDate");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new SiarProviderError("RESPONSE", "SIAR dates must use YYYY-MM-DD");
  }
  if (endDate < startDate) {
    throw new SiarProviderError("RESPONSE", "SIAR endDate precedes startDate");
  }

  const id = request.id === undefined ? SIAR_DEFAULT_DATASET_ID : requireString(request.id, "request.id");
  const datosCalculados =
    request.datosCalculados === undefined
      ? false
      : request.datosCalculados;
  if (typeof datosCalculados !== "boolean") {
    throw new SiarProviderError("RESPONSE", "SIAR datosCalculados must be boolean");
  }
  if (request.stationId === undefined) {
    throw new SiarProviderError(
      "STATION_NOT_SELECTED",
      "SIAR stationId is required; station selection must be explicit",
    );
  }

  return Object.freeze({
    startDate,
    endDate,
    id,
    datosCalculados,
    stationId: requireString(request.stationId, "request.stationId"),
  });
}

function buildUrl(baseUrl: string, token: string, request: SiarDailyDataRequest): string {
  const url = new URL(`${baseUrl}${SIAR_DAILY_STATION_PATH}`);
  url.searchParams.set("token", token);
  url.searchParams.set("Id", request.stationId ?? "");
  url.searchParams.set("FechaInicial", request.startDate);
  url.searchParams.set("FechaFinal", request.endDate);
  url.searchParams.set("DatosCalculados", String(request.datosCalculados ?? false));
  return url.toString();
}

async function readBody(response: SiarHttpResponseLike): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function bodyText(body: unknown): string {
  if (typeof body === "string") return body;
  if (!isRecord(body)) return "";
  return Object.values(body)
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

function classifyHttpError(status: number, body: unknown): SiarProviderError {
  const text = bodyText(body).toLowerCase();
  if (status === 401) {
    return new SiarProviderError("AUTHENTICATION", "SIAR rejected the API token", status);
  }
  if (
    status === 403 &&
    /(fecha\s*m[ií]nima|fecha inicial|fechainicial|minimum.*date)/i.test(text)
  ) {
    return new SiarProviderError(
      "MINIMUM_DATE_RESTRICTION",
      "SIAR rejected the requested period because it is below the authorized minimum date",
      status,
    );
  }
  if (status === 403) {
    return new SiarProviderError("AUTHENTICATION", "SIAR rejected the request", status);
  }
  return new SiarProviderError("HTTP", `SIAR request failed with HTTP ${status}`, status);
}

function extractRows(body: unknown): readonly Record<string, unknown>[] {
  if (Array.isArray(body)) {
    return body.filter(isRecord);
  }
  if (!isRecord(body)) {
    throw new SiarProviderError("RESPONSE", "SIAR response is not an object or array");
  }

  for (const key of ["datos", "Datos", "data", "Data", "resultados", "Resultados", "items"]) {
    if (Array.isArray(body[key])) return body[key].filter(isRecord);
  }
  return [body];
}

function firstField(row: Record<string, unknown>, names: readonly string[]): unknown {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== null) return row[name];
  }
  return undefined;
}

interface NormalizedRow {
  readonly stationId: string;
  readonly date: string;
  readonly eto: number;
  readonly effectiveRainfall: number;
}

function normalizeRows(
  body: unknown,
  request: SiarDailyDataRequest,
): readonly NormalizedRow[] {
  const rows = extractRows(body);
  if (rows.length === 0) {
    throw new SiarProviderError("RESPONSE", "SIAR response contains no data rows");
  }

  const normalized = rows.map((row) => {
    const stationId = requireString(
      firstField(row, [
        "StationId",
        "stationId",
        "IdEstacion",
        "idEstacion",
        "EstacionId",
        "estacionId",
        "CodigoEstacion",
        "codigoEstacion",
        "Estacion",
        "estacion",
        "Id",
      ]),
      "stationId",
    );
    if (stationId !== request.stationId) {
      throw new SiarProviderError(
        "RESPONSE",
        "SIAR response does not match the requested station",
      );
    }
    const date = requireDate(
      firstField(row, ["Fecha", "fecha", "Date", "date"]) ?? request.startDate,
      "date",
    );
    return Object.freeze({
      stationId,
      date,
      eto: requireFiniteNumber(row.EtPMon, "EtPMon"),
      effectiveRainfall: requireFiniteNumber(row.PePMon, "PePMon"),
    });
  });

  const selected = normalized.filter(
    (row) =>
      row.date.slice(0, 10) >= request.startDate &&
      row.date.slice(0, 10) <= request.endDate,
  );
  if (selected.length === 0) {
    throw new SiarProviderError("RESPONSE", "SIAR response has no row for the requested period");
  }
  return Object.freeze(selected);
}

function sourceRef(request: SiarDailyDataRequest, stationId: string): string {
  return `SIAR:${stationId}:${request.startDate}:${request.endDate}`;
}

function createProvider(input: CreateSiarDailyDataProviderInput) {
  if (!isNonEmptyString(input.apiToken)) {
    throw new SiarProviderError(
      "CONFIGURATION",
      `${SIAR_API_TOKEN_ENV_VAR} is required`,
    );
  }
  const baseUrl = normalizeBaseUrl(input.baseUrl ?? SIAR_API_BASE_URL);
  const fetchImplementation = resolveFetch(input.fetch);
  const timeoutMs = input.timeoutMs ?? 10_000;

  async function fetchRows(rawRequest: Readonly<Record<string, unknown>>) {
    const request = validateRequest(rawRequest);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImplementation(buildUrl(baseUrl, input.apiToken, request), {
        method: "GET",
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      const body = await readBody(response);
      if (!response.ok) throw classifyHttpError(response.status, body);
      return { request, rows: normalizeRows(body, request) };
    } catch (error) {
      if (error instanceof SiarProviderError) throw error;
      throw new SiarProviderError("HTTP", "SIAR request could not be completed");
    } finally {
      clearTimeout(timeout);
    }
  }

  return Object.freeze({
    async fetchEto(
      rawRequest: Readonly<Record<string, unknown>>,
    ): Promise<Readonly<EtoExternalAdapterInput>> {
      const { request, rows } = await fetchRows(rawRequest);
      const first = rows[0];
      if (first === undefined) throw new SiarProviderError("RESPONSE", "SIAR response contains no data rows");
      return Object.freeze({
        value: rows.reduce((total, row) => total + row.eto, 0),
        status: ValidationStatus.VALIDATED,
        provenance: Provenance.AUTOMATIC,
        period: { start: request.startDate, end: request.endDate, timezone: "UTC" },
        sourceRef: sourceRef(request, first.stationId),
        stationId: first.stationId,
        temporalResolution: "DAILY",
      });
    },
    async fetchEffectiveRainfall(
      rawRequest: Readonly<Record<string, unknown>>,
    ): Promise<Readonly<EffectiveRainfallExternalAdapterInput>> {
      const { request, rows } = await fetchRows(rawRequest);
      const first = rows[0];
      if (first === undefined) throw new SiarProviderError("RESPONSE", "SIAR response contains no data rows");
      return Object.freeze({
        value: rows.reduce((total, row) => total + row.effectiveRainfall, 0),
        status: ValidationStatus.VALIDATED,
        provenance: Provenance.AUTOMATIC,
        period: { start: request.startDate, end: request.endDate, timezone: "UTC" },
        sourceRef: sourceRef(request, first.stationId),
        methodology: "SIAR_PePMon",
      });
    },
  });
}

export function createSiarDailyDataProvidersFromEnvironment(
  fetchImplementation?: SiarHttpFetch,
): Readonly<{
  readonly eto: SiarEtoProvider;
  readonly effectiveRainfall: SiarEffectiveRainfallProvider;
}> {
  const provider = createProvider({
    apiToken: process.env[SIAR_API_TOKEN_ENV_VAR] ?? "",
    ...(fetchImplementation === undefined ? {} : { fetch: fetchImplementation }),
  });
  return Object.freeze({ eto: provider, effectiveRainfall: provider });
}

