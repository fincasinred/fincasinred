import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type {
  EffectiveRainfallExternalAdapterInput,
  EtoExternalAdapterInput,
} from "../../engine/domain/agronomy/AgronomyExternalInputAdapters.js";
import {
  createSiarDailyDataProvidersFromEnvironment,
  type SiarPeriod,
} from "../application/execution/SiarDailyDataProvider.js";
import {
  buildSiarDailyRequest,
  isValidSiarPeriod,
} from "../application/execution/SiarDailyRequestBuilder.js";

export const SIAR_DATA_ENDPOINT = "/api/paso7/siar-data";

function allowedOrigins(): readonly string[] {
  return (process.env.FINCASINRED_V12_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function applyCors(
  request: IncomingMessage,
  response: ServerResponse,
): boolean {
  const origin = request.headers.origin;
  if (origin === undefined) return true;
  if (!allowedOrigins().includes(origin)) return false;
  response.setHeader("access-control-allow-origin", origin);
  response.setHeader("vary", "Origin");
  response.setHeader("access-control-allow-methods", "POST, OPTIONS");
  response.setHeader("access-control-allow-headers", "accept, content-type");
  return true;
}

interface SiarDataProviders {
  readonly eto: {
    fetchEto(
      request: Readonly<Record<string, unknown>>,
    ): Promise<Readonly<EtoExternalAdapterInput>>;
  };
  readonly effectiveRainfall: {
    fetchEffectiveRainfall(
      request: Readonly<Record<string, unknown>>,
    ): Promise<Readonly<EffectiveRainfallExternalAdapterInput>>;
  };
}

export interface SiarDataHttpServerOptions {
  readonly createProviders?: () => Readonly<SiarDataProviders>;
  readonly maxBodyBytes?: number;
}

interface SiarDataRequestBody {
  readonly stationId: string;
  readonly siarPeriod: SiarPeriod;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function jsonResponse(
  response: ServerResponse,
  statusCode: number,
  body: Readonly<Record<string, unknown>>,
): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function validationError(
  response: ServerResponse,
  missingFields: readonly string[],
): void {
  jsonResponse(response, 400, {
    status: "PENDING",
    missingFields,
  });
}

async function readBody(
  request: IncomingMessage,
  maxBodyBytes: number,
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBodyBytes) {
      throw new Error("request body is too large");
    }
    chunks.push(buffer);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function parseRequestBody(value: unknown):
  | { readonly body: SiarDataRequestBody }
  | { readonly missingFields: readonly string[] } {
  if (!isRecord(value)) {
    return { missingFields: ["body"] };
  }

  const missingFields: string[] = [];
  const stationId = value.stationId;
  const siarPeriod = value.siarPeriod;

  if (typeof stationId !== "string" || stationId.trim().length === 0) {
    missingFields.push("stationId");
  }
  if (!isValidSiarPeriod(siarPeriod)) {
    missingFields.push("siarPeriod");
  }

  if (missingFields.length > 0) {
    return { missingFields };
  }

  return {
    body: {
      stationId: stationId as string,
      siarPeriod: siarPeriod as SiarPeriod,
    },
  };
}

function normalizedEto(
  value: Readonly<EtoExternalAdapterInput>,
): Readonly<Record<string, unknown>> {
  return {
    value: value.value,
    unit: "mm",
    status: value.status,
    provenance: value.provenance,
    period: value.period,
    stationId: value.stationId,
    sourceRef: value.sourceRef,
    temporalResolution: value.temporalResolution,
  };
}

function normalizedEffectiveRainfall(
  value: Readonly<EffectiveRainfallExternalAdapterInput>,
): Readonly<Record<string, unknown>> {
  return {
    value: value.value,
    unit: "mm",
    status: value.status,
    provenance: value.provenance,
    period: value.period,
    sourceRef: value.sourceRef,
    methodology: value.methodology,
  };
}

export async function handleSiarDataRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: Readonly<SiarDataHttpServerOptions> = {},
): Promise<void> {
  if (request.method !== "POST" || request.url !== SIAR_DATA_ENDPOINT) {
    jsonResponse(response, 404, { status: "FAILED", error: "Not found" });
    return;
  }

  let parsed: unknown;
  try {
    parsed = await readBody(request, options.maxBodyBytes ?? 1_048_576);
  } catch {
    jsonResponse(response, 400, {
      status: "FAILED",
      error: "Invalid JSON request",
    });
    return;
  }

  const requestBody = parseRequestBody(parsed);
  if ("missingFields" in requestBody) {
    validationError(response, requestBody.missingFields);
    return;
  }

  const { stationId, siarPeriod } = requestBody.body;
  const siarRequest = buildSiarDailyRequest(siarPeriod, stationId);

  let providers: Readonly<SiarDataProviders>;
  try {
    providers =
      options.createProviders?.() ?? createSiarDailyDataProvidersFromEnvironment();
  } catch {
    jsonResponse(response, 503, {
      status: "FAILED",
      error: "SIAR provider is not configured",
    });
    return;
  }

  try {
    const [eto, effectiveRainfall] = await Promise.all([
      providers.eto.fetchEto(siarRequest),
      providers.effectiveRainfall.fetchEffectiveRainfall(siarRequest),
    ]);

    jsonResponse(response, 200, {
      status: "READY",
      stationId,
      siarPeriod,
      eto: normalizedEto(eto),
      effectiveRainfall: normalizedEffectiveRainfall(effectiveRainfall),
    });
  } catch {
    jsonResponse(response, 502, {
      status: "FAILED",
      error: "SIAR data unavailable",
    });
  }
}

export function createSiarDataHttpServer(
  options: Readonly<SiarDataHttpServerOptions> = {},
): Server {
  return createServer((request, response) => {
    if (!applyCors(request, response)) {
      jsonResponse(response, 403, { status: "FAILED", error: "Origin not allowed" });
      return;
    }
    if (request.method === "OPTIONS" && request.url === SIAR_DATA_ENDPOINT) {
      response.statusCode = 204;
      response.end();
      return;
    }
    void handleSiarDataRequest(request, response, options);
  });
}

if (process.argv[1]?.endsWith("siar-data-server.mjs")) {
  const port = Number(process.env.PORT ?? "10001");
  createSiarDataHttpServer()
    .listen(port, "0.0.0.0")
    .on("listening", () => {
      process.stdout.write(`SIAR data server listening on port ${port}\n`);
    });
}