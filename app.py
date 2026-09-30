from typing import Literal, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware

import os
import json
import zlib
import base64
import io
import re
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from datetime import datetime
from html import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak,
    KeepTogether,
)
from reportlab.graphics.shapes import Drawing, Rect, Line, Circle, String, Polygon
import stripe

from backend.domain.hydraulic import HydraulicEndpoint, HydraulicInputError, calculate_sector
from backend.domain.pump import (
    PumpRequirementProvenance,
    PumpRequirementStatus,
    build_pump_requirement_from_sector,
)

app = FastAPI(title="FincaSinRed", version="8.0")
stripe.api_key = os.environ.get("STRIPE_SECRET_KEY")

cors_origins = [
    origin.strip()
    for origin in os.environ.get("FINCASINRED_V12_ORIGIN", "").split(",")
    if origin.strip()
]
if cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["accept", "content-type"],
    )

SIAR_API_BASE_URL = "https://servicio.mapa.gob.es/siarapi"
SIAR_STATIONS_PATH = "/API/V1/Info/ESTACIONES"
SIAR_API_TOKEN_ENV_VAR = "FINCASINRED_SIAR_API_TOKEN"

@app.get("/")
def home():
    return FileResponse("index.html")

@app.get("/proyecto.html")
def proyecto():
    return FileResponse("proyecto.html")

@app.get("/calculadora")
def calculadora():
    return FileResponse("FincaSinRed_V10_DEFINITIVA_index.html")


@app.get("/logo-fincasinred.webp")
def logo_fincasinred():
    return FileResponse(
        "logo-fincasinred.webp",
        media_type="image/webp",
    )


@app.get("/portada-riego-30-cerezos.jpeg")
def portada_riego():
    return FileResponse(
        "portada-riego-30-cerezos.jpeg",
        media_type="image/jpeg",
    )


@app.get("/satellite-el-colmenar.jpeg")
def satellite_el_colmenar():
    return FileResponse(
        "satellite-el-colmenar.jpeg",
        media_type="image/jpeg",
    )


@app.get("/health")
def health():
    return {"status": "ok", "version": app.version}


def _siar_first(record, names):
    for name in names:
        value = record.get(name)
        if value is not None and value != "":
            return value
    return None


def _siar_coordinate(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        match = re.fullmatch(r"(\d{2,3})(\d{2})(\d{2})(\d{3})([NSEW])", str(value).strip().upper())
        if match is None:
            return None
        degrees, minutes, seconds, milliseconds, hemisphere = match.groups()
        number = int(degrees) + int(minutes) / 60 + (
            int(seconds) + int(milliseconds) / 1000
        ) / 3600
        if hemisphere in {"S", "W"}:
            number = -number
    return number if number == number and abs(number) != float("inf") else None


def _siar_active(record):
    active = _siar_first(record, ("Activa", "activa", "Active", "active"))
    if isinstance(active, bool):
        return active
    if active is not None:
        return str(active).strip().upper() in {"1", "TRUE", "SI", "SÍ", "ACTIVA", "ACTIVE"}

    status = _siar_first(
        record,
        ("Estado", "estado", "Status", "status", "Situacion", "situacion"),
    )
    if status is not None:
        return str(status).strip().upper() in {"1", "TRUE", "SI", "SÍ", "ACTIVA", "ACTIVE"}

    discharge_date = _siar_first(record, ("Fecha_Baja", "fecha_baja", "FechaBaja", "fechaBaja"))
    if discharge_date in (None, ""):
        return True
    try:
        return datetime.fromisoformat(str(discharge_date).replace("Z", "+00:00")).date() > datetime.now().date()
    except ValueError:
        return False


def _siar_rows(body):
    if isinstance(body, list):
        return [row for row in body if isinstance(row, dict)]
    if not isinstance(body, dict):
        return []
    for key in ("datos", "Datos", "data", "Data", "estaciones", "Estaciones", "items"):
        value = body.get(key)
        if isinstance(value, list):
            return [row for row in value if isinstance(row, dict)]
    return [body]


def _normalize_siar_station_catalog(body):
    stations = []
    for row in _siar_rows(body):
        station_id = _siar_first(
            row,
            (
                "CodigoEstacion",
                "codigoEstacion",
                "Codigo",
                "codigo",
                "IdEstacion",
                "idEstacion",
                "Estacion",
                "estacion",
            ),
        )
        latitude = _siar_coordinate(
            _siar_first(row, ("Latitud", "latitud", "Latitude", "latitude", "Lat", "lat"))
        )
        longitude = _siar_coordinate(
            _siar_first(row, ("Longitud", "longitud", "Longitude", "longitude", "Lon", "lon"))
        )
        if (
            station_id is None
            or latitude is None
            or longitude is None
            or not -90 <= latitude <= 90
            or not -180 <= longitude <= 180
        ):
            continue
        stations.append(
            {
                "stationId": str(station_id),
                "coordinates": {"latitude": latitude, "longitude": longitude},
                "active": _siar_active(row),
            }
        )
    return stations


@app.get("/api/siar/stations")
def siar_stations():
    token = os.environ.get(SIAR_API_TOKEN_ENV_VAR)
    if not token:
        raise HTTPException(status_code=503, detail="SIAR station catalog is not configured")

    request = Request(
        f"{SIAR_API_BASE_URL}{SIAR_STATIONS_PATH}?token={token}",
        headers={"Accept": "application/json"},
        method="GET",
    )
    try:
        with urlopen(request, timeout=10) as response:
            body = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, ValueError, OSError) as error:
        raise HTTPException(status_code=502, detail="SIAR station catalog unavailable") from error

    stations = _normalize_siar_station_catalog(body)
    if not stations:
        raise HTTPException(status_code=502, detail="SIAR station catalog has no usable stations")
    return {"stations": stations}


class HydraulicApiUnits(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pressure: Literal["mca"] = "mca"
    flow: Literal["lpm"] = "lpm"


class HydraulicApiSectorRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sector_id: str = Field(min_length=1, max_length=120)
    pressure_required_mca: float = 0.0
    flow_lpm: float = 0.0
    head_loss_mca: float = 0.0
    available_pressure_mca: Optional[float] = None
    minimum_pressure_mca: Optional[float] = None
    pump_head_mca: Optional[float] = None
    phase: int = 1


class HydraulicApiPumpRequirementRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scenarios: Optional[list[str]] = None
    critical_point_id: Optional[str] = Field(default=None, max_length=120)
    hydraulic_path_id: Optional[str] = Field(default=None, max_length=120)
    distributed_losses_mca: Optional[float] = None
    local_losses_mca: Optional[float] = None
    source_system_restrictions: Optional[dict[str, str]] = None
    split_source_system_restrictions: Optional[dict[str, str]] = None
    provenance: Optional[
        Literal["USER_PROVIDED", "MEASURED", "CALCULATED", "AUTOMATIC", "ESTIMATED"]
    ] = None
    status: Optional[
        Literal["VALIDATED", "PROVISIONAL", "PENDING", "BLOCKED", "INVALID"]
    ] = None
    value_version: Optional[str] = Field(default=None, max_length=120)
    pump_required: Optional[bool] = None
    required_hmt_mca: Optional[float] = None


class HydraulicApiCalculationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    units: HydraulicApiUnits = Field(default_factory=HydraulicApiUnits)
    sector: HydraulicApiSectorRequest
    pump_requirement: Optional[HydraulicApiPumpRequirementRequest] = None


class HydraulicApiSectorResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sector_id: str
    flow_lpm: float
    head_loss_mca: float
    required_pressure_mca: float
    available_pressure_mca: Optional[float] = None
    pressure_margin_mca: Optional[float] = None
    minimum_pressure_mca: Optional[float] = None
    pump_head_mca: Optional[float] = None
    satisfied: Optional[bool] = None
    phase: int


class HydraulicApiPumpRequirementResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sector_id: str
    scenarios: Optional[list[str]] = None
    design_flow_lpm: float
    required_hmt_mca: Optional[float] = None
    required_pressure_mca: float
    available_pressure_mca: Optional[float] = None
    pressure_margin_mca: Optional[float] = None
    pump_required: Optional[bool] = None
    critical_point_id: Optional[str] = None
    hydraulic_path_id: Optional[str] = None
    distributed_losses_mca: Optional[float] = None
    local_losses_mca: Optional[float] = None
    source_system_restrictions: Optional[dict[str, str]] = None
    split_source_system_restrictions: Optional[dict[str, str]] = None
    provenance: Optional[
        Literal["USER_PROVIDED", "MEASURED", "CALCULATED", "AUTOMATIC", "ESTIMATED"]
    ] = None
    status: Optional[
        Literal["VALIDATED", "PROVISIONAL", "PENDING", "BLOCKED", "INVALID"]
    ] = None
    value_version: Optional[str] = None


class HydraulicApiCalculationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    units: HydraulicApiUnits = Field(default_factory=HydraulicApiUnits)
    sector: HydraulicApiSectorResponse
    pump_requirement: Optional[HydraulicApiPumpRequirementResponse] = None


def _hydraulic_http_error(message: str) -> HTTPException:
    return HTTPException(
        status_code=422,
        detail={
            "type": "hydraulic_calculation_error",
            "message": str(message),
        },
    )


def _build_hydraulic_endpoint(request: HydraulicApiSectorRequest) -> HydraulicEndpoint:
    return HydraulicEndpoint(
        sector_id=request.sector_id,
        pressure_required_mca=request.pressure_required_mca,
        flow_lpm=request.flow_lpm,
    )


def _build_hydraulic_pump_requirement_response(requirement) -> HydraulicApiPumpRequirementResponse:
    return HydraulicApiPumpRequirementResponse(
        sector_id=requirement.sector_id,
        scenarios=list(requirement.scenarios) if requirement.scenarios is not None else None,
        design_flow_lpm=requirement.design_flow_lpm,
        required_hmt_mca=requirement.required_hmt_mca,
        required_pressure_mca=requirement.required_pressure_mca,
        available_pressure_mca=requirement.available_pressure_mca,
        pressure_margin_mca=requirement.pressure_margin_mca,
        pump_required=requirement.pump_required,
        critical_point_id=requirement.critical_point_id,
        hydraulic_path_id=requirement.hydraulic_path_id,
        distributed_losses_mca=requirement.distributed_losses_mca,
        local_losses_mca=requirement.local_losses_mca,
        source_system_restrictions=(
            dict(requirement.source_system_restrictions)
            if requirement.source_system_restrictions is not None
            else None
        ),
        split_source_system_restrictions=(
            dict(requirement.split_source_system_restrictions)
            if requirement.split_source_system_restrictions is not None
            else None
        ),
        provenance=(
            requirement.provenance.value if requirement.provenance is not None else None
        ),
        status=requirement.status.value if requirement.status is not None else None,
        value_version=requirement.value_version,
    )


@app.post(
    "/api/hydraulic/calculate",
    response_model=HydraulicApiCalculationResponse,
    response_model_exclude_none=True,
)
def calculate_hydraulic(request: HydraulicApiCalculationRequest):
    try:
        sector_result = calculate_sector(
            _build_hydraulic_endpoint(request.sector),
            head_loss_mca=request.sector.head_loss_mca,
            available_pressure_mca=request.sector.available_pressure_mca,
            minimum_pressure_mca=request.sector.minimum_pressure_mca,
            pump_head_mca=request.sector.pump_head_mca,
            phase=request.sector.phase,
        )

        pump_requirement_result = None
        if request.pump_requirement is not None:
            provenance = (
                PumpRequirementProvenance(request.pump_requirement.provenance)
                if request.pump_requirement.provenance is not None
                else None
            )
            status = (
                PumpRequirementStatus(request.pump_requirement.status)
                if request.pump_requirement.status is not None
                else None
            )
            pump_requirement_result = build_pump_requirement_from_sector(
                sector_result,
                scenarios=request.pump_requirement.scenarios,
                critical_point_id=request.pump_requirement.critical_point_id,
                hydraulic_path_id=request.pump_requirement.hydraulic_path_id,
                distributed_losses_mca=request.pump_requirement.distributed_losses_mca,
                local_losses_mca=request.pump_requirement.local_losses_mca,
                source_system_restrictions=request.pump_requirement.source_system_restrictions,
                split_source_system_restrictions=request.pump_requirement.split_source_system_restrictions,
                provenance=provenance,
                status=status,
                value_version=request.pump_requirement.value_version,
                pump_required=request.pump_requirement.pump_required,
                required_hmt_mca=request.pump_requirement.required_hmt_mca,
            )

        response = HydraulicApiCalculationResponse(
            sector=HydraulicApiSectorResponse(
                sector_id=sector_result.sector_id,
                flow_lpm=sector_result.flow_lpm,
                head_loss_mca=sector_result.head_loss_mca,
                required_pressure_mca=sector_result.required_pressure_mca,
                available_pressure_mca=sector_result.available_pressure_mca,
                pressure_margin_mca=sector_result.pressure_margin_mca,
                minimum_pressure_mca=sector_result.minimum_pressure_mca,
                pump_head_mca=sector_result.pump_head_mca,
                satisfied=sector_result.satisfied,
                phase=sector_result.phase,
            ),
            pump_requirement=(
                None
                if pump_requirement_result is None
                else _build_hydraulic_pump_requirement_response(pump_requirement_result)
            ),
        )

        return response
    except HydraulicInputError as error:
        raise _hydraulic_http_error(str(error))


@app.post("/crear-pago")
def crear_pago():
    if not stripe.api_key:
        raise HTTPException(status_code=500, detail="Stripe no está configurado")
    try:
        session = stripe.checkout.Session.create(
            mode="payment",
            line_items=[{"price": "price_1U5pre1xCi4MDD5SmFZc57WT", "quantity": 1}],
           success_url="https://fincasinred.com/?pago=ok&session_id={CHECKOUT_SESSION_ID}",
cancel_url="https://fincasinred.com/?pago=cancelado",
        )
        return {"url": session.url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class ProyectoDatos(BaseModel):
    datos: dict


@app.post("/guardar-proyecto")
def guardar_proyecto(proyecto: ProyectoDatos):
    if not proyecto.datos:
        raise HTTPException(status_code=400, detail="No se han recibido datos del proyecto")
    return {"ok": True, "mensaje": "Datos del proyecto recibidos correctamente"}


@app.post("/crear-checkout")
def crear_checkout(proyecto: ProyectoDatos):
    if not stripe.api_key:
        raise HTTPException(status_code=500, detail="Stripe no está configurado")
    if not proyecto.datos:
        raise HTTPException(status_code=400, detail="No se han recibido los datos del proyecto")
    try:
        session = stripe.checkout.Session.create(
            mode="payment",
            line_items=[{"price": "price_1U5pre1xCi4MDD5SmFZc57WT", "quantity": 1}],
            metadata={
                "proyecto": base64.b64encode(
                    zlib.compress(
                        json.dumps(
                            proyecto.datos,
                            separators=(",", ":"),
                            ensure_ascii=False,
                        ).encode("utf-8")
                    )
                ).decode("ascii")
            },
            success_url="https://www.fincasinred.com/?pago=ok&session_id={CHECKOUT_SESSION_ID}",
            cancel_url="https://www.fincasinred.com/?pago=cancelado",
        )
        return {"ok": True, "url": session.url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/verificar-pago")
def verificar_pago(session_id: str):
    try:
        session = stripe.checkout.Session.retrieve(session_id).to_dict()
        if session.get("payment_status") != "paid":
            raise HTTPException(status_code=403, detail="El pago todavía no está confirmado")

        datos_codificados = session.get("metadata", {}).get("proyecto")
        if not datos_codificados:
            raise HTTPException(status_code=400, detail="No se encontraron los datos del proyecto")

        datos = json.loads(
            zlib.decompress(base64.b64decode(datos_codificados)).decode("utf-8")
        )
        return {"ok": True, "pago": "pagado", "proyecto": datos}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _dato(datos, *claves, defecto=None):
    for clave in claves:
        if clave in datos and datos[clave] not in (None, ""):
            return datos[clave]
    return defecto


def _numero(valor, decimales=1):
    try:
        return (
            f"{float(valor):,.{decimales}f}"
            .replace(",", "X")
            .replace(".", ",")
            .replace("X", ".")
        )
    except (TypeError, ValueError):
        return "—"


def _entero(valor):
    try:
        return (
            f"{float(valor):,.0f}"
            .replace(",", "X")
            .replace(".", ",")
            .replace("X", ".")
        )
    except (TypeError, ValueError):
        return "—"


def _texto(valor):
    return "—" if valor is None or valor == "" else str(valor)


def _bool(valor):
    if isinstance(valor, bool):
        return "Sí" if valor else "No"
    return "Sí" if str(valor).lower() in {"true", "1", "si", "sí", "yes"} else "No"


def _safe(value):
    return escape(_texto(value))


def _tabla(filas, estilos, anchos=None):
    datos = [
        [
            Paragraph(f"<b>{escape(str(a))}</b>", estilos["TableLabel"]),
            Paragraph(escape(str(b)), estilos["TableValue"]),
        ]
        for a, b in filas
    ]
    tabla = Table(datos, colWidths=anchos or [70 * mm, 95 * mm])
    tabla.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F1F5F2")),
                ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#C9D4CC")),
                ("INNERGRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#DDE5DF")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return tabla


def _tabla_tres_columnas(filas, estilos, anchos=None):
    contenido = []
    for fila in filas:
        contenido.append(
            [
                Paragraph(str(fila[0]), estilos["TableLabel"]),
                Paragraph(str(fila[1]), estilos["TableValue"]),
                Paragraph(str(fila[2]), estilos["TableValue"]),
            ]
        )

    tabla = Table(
        contenido,
        colWidths=anchos or [43 * mm, 58 * mm, 64 * mm],
        repeatRows=1,
    )
    tabla.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#236B35")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#BFCBC2")),
                ("INNERGRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#DDE5DF")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                (
                    "ROWBACKGROUNDS",
                    (0, 1),
                    (-1, -1),
                    [colors.white, colors.HexColor("#F7F9F7")],
                ),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return tabla


def _seccion(titulo, estilos):
    return [
        Spacer(1, 2 * mm),
        Paragraph(escape(titulo), estilos["Section"]),
        Spacer(1, 2 * mm),
    ]


def _subtitulo(titulo, estilos):
    return [
        Spacer(1, 2 * mm),
        Paragraph(escape(titulo), estilos["Subsection"]),
        Spacer(1, 1.5 * mm),
    ]


def _callout(texto, estilos, fondo="#EEF6EF"):
    return Table(
        [[Paragraph(texto, estilos["Callout"])]],
        colWidths=[165 * mm],
        style=TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(fondo)),
                ("BOX", (0, 0), (-1, -1), 0.7, colors.HexColor("#B8CFBA")),
                ("LEFTPADDING", (0, 0), (-1, -1), 9),
                ("RIGHTPADDING", (0, 0), (-1, -1), 9),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        ),
    )


def _pie(canvas, documento):
    canvas.saveState()
    ancho, _ = A4
    canvas.setStrokeColor(colors.HexColor("#D5DDD7"))
    canvas.line(18 * mm, 14 * mm, ancho - 18 * mm, 14 * mm)
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(colors.HexColor("#66736A"))
    canvas.drawString(18 * mm, 9 * mm, "FincaSinRed · Proyecto técnico orientativo")
    canvas.drawRightString(ancho - 18 * mm, 9 * mm, f"Página {documento.page}")
    canvas.restoreState()


def _grafico_terreno(distancia, desnivel, estilos):
    dibujo = Drawing(470, 180)

    # Terreno y cotas
    dibujo.add(Rect(20, 24, 430, 110, fillColor=colors.HexColor("#F4F7F3"), strokeColor=colors.HexColor("#C7D2C8")))
    dibujo.add(Line(35, 55, 430, 55, strokeColor=colors.HexColor("#7B8B7F"), strokeWidth=2))

    # Depósito
    dibujo.add(Rect(42, 55, 42, 48, fillColor=colors.HexColor("#DCEAF4"), strokeColor=colors.HexColor("#4B718B"), strokeWidth=1.2))
    dibujo.add(String(63, 112, "Depósito", textAnchor="middle", fontSize=8, fillColor=colors.HexColor("#39443D")))

    # Bomba
    dibujo.add(Circle(105, 70, 14, fillColor=colors.HexColor("#E6EEE8"), strokeColor=colors.HexColor("#236B35"), strokeWidth=1.2))
    dibujo.add(String(105, 66, "B", textAnchor="middle", fontSize=9, fillColor=colors.HexColor("#236B35")))

    # Tubería principal
    dibujo.add(Line(119, 70, 420, 70, strokeColor=colors.HexColor("#236B35"), strokeWidth=3))
    dibujo.add(Polygon([420, 70, 407, 76, 407, 64], fillColor=colors.HexColor("#236B35"), strokeColor=colors.HexColor("#236B35")))

    # Ramales
    for x in [190, 245, 300, 355]:
        dibujo.add(Line(x, 70, x, 38, strokeColor=colors.HexColor("#6C9B72"), strokeWidth=1.8))
        dibujo.add(Line(x, 70, x, 102, strokeColor=colors.HexColor("#6C9B72"), strokeWidth=1.8))
        for y in [42, 54, 90, 100]:
            dibujo.add(Circle(x, y, 2.3, fillColor=colors.HexColor("#236B35"), strokeColor=None))

    # Cotas
    dibujo.add(Line(120, 145, 420, 145, strokeColor=colors.HexColor("#7B8B7F")))
    dibujo.add(Line(120, 139, 120, 151, strokeColor=colors.HexColor("#7B8B7F")))
    dibujo.add(Line(420, 139, 420, 151, strokeColor=colors.HexColor("#7B8B7F")))
    dibujo.add(String(270, 153, f"Tramo principal: {_safe(distancia)} m", textAnchor="middle", fontSize=8.5, fillColor=colors.HexColor("#39443D")))

    dibujo.add(Line(440, 55, 440, 130, strokeColor=colors.HexColor("#7B8B7F")))
    dibujo.add(Line(434, 55, 446, 55, strokeColor=colors.HexColor("#7B8B7F")))
    dibujo.add(Line(434, 130, 446, 130, strokeColor=colors.HexColor("#7B8B7F")))
    dibujo.add(String(448, 91, f"Desnivel: {_safe(desnivel)} m", fontSize=8, fillColor=colors.HexColor("#39443D")))

    dibujo.add(String(235, 10, "Esquema orientativo — no representa la escala real de la finca", textAnchor="middle", fontSize=7.5, fillColor=colors.HexColor("#66736A")))
    return dibujo


def _grafico_hidraulico(caudal_recomendado, altura_recomendada, estilos):
    dibujo = Drawing(470, 185)

    # Ejes
    dibujo.add(Line(45, 35, 445, 35, strokeColor=colors.HexColor("#7B8B7F"), strokeWidth=1))
    dibujo.add(Line(45, 35, 45, 150, strokeColor=colors.HexColor("#7B8B7F"), strokeWidth=1))

    dibujo.add(String(245, 12, "Caudal", textAnchor="middle", fontSize=8, fillColor=colors.HexColor("#39443D")))
    dibujo.add(String(16, 92, "Altura", textAnchor="middle", fontSize=8, fillColor=colors.HexColor("#39443D"), angle=90))

    # Curva conceptual
    puntos = [(55, 132), (105, 121), (155, 108), (205, 94), (255, 79), (305, 64), (355, 52), (405, 43)]
    for a, b in zip(puntos, puntos[1:]):
        dibujo.add(Line(a[0], a[1], b[0], b[1], strokeColor=colors.HexColor("#236B35"), strokeWidth=2.4))

    # Punto de trabajo conceptual
    px, py = 255, 79
    dibujo.add(Circle(px, py, 5, fillColor=colors.HexColor("#236B35"), strokeColor=colors.white, strokeWidth=1.2))
    dibujo.add(Line(px, py, px + 75, py + 34, strokeColor=colors.HexColor("#7B8B7F"), strokeWidth=1))
    dibujo.add(String(px + 80, py + 36, f"Punto de trabajo orientativo: {_entero(caudal_recomendado)} L/h · {_numero(altura_recomendada,1)} m.c.a.", fontSize=7.5, fillColor=colors.HexColor("#39443D")))

    dibujo.add(String(245, 166, "Curva conceptual caudal-altura", textAnchor="middle", fontSize=9, fillColor=colors.HexColor("#236B35")))
    dibujo.add(String(245, 22, "La bomba real debe verificarse con la curva del fabricante", textAnchor="middle", fontSize=7.5, fillColor=colors.HexColor("#66736A")))
    return dibujo


def _grafico_solar(panel_solar, bomba_w, energia_diaria, estilos):
    dibujo = Drawing(470, 190)

    # Sol
    dibujo.add(Circle(75, 135, 23, fillColor=colors.HexColor("#F4E5A5"), strokeColor=colors.HexColor("#C8A83D")))
    for x1, y1, x2, y2 in [
        (75, 166, 75, 180), (75, 104, 75, 90), (106, 135, 120, 135), (44, 135, 30, 135),
        (97, 157, 108, 168), (53, 113, 42, 102), (97, 113, 108, 102), (53, 157, 42, 168)
    ]:
        dibujo.add(Line(x1, y1, x2, y2, strokeColor=colors.HexColor("#C8A83D"), strokeWidth=1.5))

    # Panel
    dibujo.add(Polygon([155, 60, 285, 78, 270, 135, 140, 117], fillColor=colors.HexColor("#DCE6E9"), strokeColor=colors.HexColor("#52737C"), strokeWidth=1.2))
    for x in [165, 190, 215, 240, 265]:
        dibujo.add(Line(x, 72, x - 12, 126, strokeColor=colors.HexColor("#8AA0A6"), strokeWidth=0.7))
    for y in [86, 101, 116]:
        dibujo.add(Line(145, y, 278, y + 18, strokeColor=colors.HexColor("#8AA0A6"), strokeWidth=0.7))
    dibujo.add(String(213, 45, f"Panel orientativo: {_entero(panel_solar)} Wp", textAnchor="middle", fontSize=8, fillColor=colors.HexColor("#39443D")))

    # Controlador / bomba / riego
    dibujo.add(Rect(320, 105, 55, 35, fillColor=colors.HexColor("#F1F5F2"), strokeColor=colors.HexColor("#236B35")))
    dibujo.add(String(347, 119, "CONTROL", textAnchor="middle", fontSize=7.5, fillColor=colors.HexColor("#236B35")))
    dibujo.add(Line(285, 105, 320, 122, strokeColor=colors.HexColor("#236B35"), strokeWidth=2))

    dibujo.add(Circle(348, 68, 18, fillColor=colors.HexColor("#E6EEE8"), strokeColor=colors.HexColor("#236B35"), strokeWidth=1.2))
    dibujo.add(String(348, 65, "B", textAnchor="middle", fontSize=10, fillColor=colors.HexColor("#236B35")))
    dibujo.add(Line(348, 105, 348, 86, strokeColor=colors.HexColor("#236B35"), strokeWidth=2))
    dibujo.add(Line(366, 68, 425, 68, strokeColor=colors.HexColor("#6C9B72"), strokeWidth=2.2))
    dibujo.add(Polygon([425, 68, 413, 74, 413, 62], fillColor=colors.HexColor("#6C9B72"), strokeColor=colors.HexColor("#6C9B72")))

    dibujo.add(String(348, 43, f"Bomba: ≥ {_entero(bomba_w)} W", textAnchor="middle", fontSize=8, fillColor=colors.HexColor("#39443D")))
    dibujo.add(String(235, 172, f"Energía diaria estimada: {_numero(energia_diaria,2)} Wh/día", textAnchor="middle", fontSize=8.5, fillColor=colors.HexColor("#236B35")))
    return dibujo


def _construir_pdf(datos, session_id):
    buffer = io.BytesIO()

    documento = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=17 * mm,
        leftMargin=17 * mm,
        topMargin=15 * mm,
        bottomMargin=19 * mm,
        title="Proyecto Técnico Premium - FincaSinRed",
        author="FincaSinRed",
        subject="Proyecto orientativo de instalación hidráulica y energía solar",
    )

    base = getSampleStyleSheet()
    estilos = {
        "CoverTitle": ParagraphStyle(
            "CoverTitle",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=29,
            leading=33,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#236B35"),
            spaceAfter=10,
        ),
        "CoverSub": ParagraphStyle(
            "CoverSub",
            parent=base["Heading2"],
            fontName="Helvetica",
            fontSize=14,
            leading=19,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#39443D"),
            spaceAfter=7,
        ),
        "CoverNote": ParagraphStyle(
            "CoverNote",
            parent=base["BodyText"],
            fontSize=9.2,
            leading=13.5,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#66736A"),
        ),
        "Section": ParagraphStyle(
            "Section",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=15,
            leading=19,
            textColor=colors.HexColor("#236B35"),
            spaceBefore=2,
            spaceAfter=5,
        ),
        "Subsection": ParagraphStyle(
            "Subsection",
            parent=base["Heading3"],
            fontName="Helvetica-Bold",
            fontSize=10.5,
            leading=14,
            textColor=colors.HexColor("#39443D"),
            spaceAfter=3,
        ),
        "Body": ParagraphStyle(
            "Body",
            parent=base["BodyText"],
            fontSize=9.4,
            leading=14,
            textColor=colors.HexColor("#333A35"),
            spaceAfter=6,
        ),
        "BodyLarge": ParagraphStyle(
            "BodyLarge",
            parent=base["BodyText"],
            fontSize=10.2,
            leading=15,
            textColor=colors.HexColor("#333A35"),
            spaceAfter=7,
        ),
        "Small": ParagraphStyle(
            "Small",
            parent=base["BodyText"],
            fontSize=7.8,
            leading=10.5,
            textColor=colors.HexColor("#66736A"),
        ),
        "TableLabel": ParagraphStyle(
            "TableLabel",
            parent=base["BodyText"],
            fontSize=8.8,
            leading=11.5,
            textColor=colors.HexColor("#39443D"),
        ),
        "TableValue": ParagraphStyle(
            "TableValue",
            parent=base["BodyText"],
            fontSize=8.8,
            leading=11.5,
            textColor=colors.HexColor("#222822"),
        ),
        "Callout": ParagraphStyle(
            "Callout",
            parent=base["BodyText"],
            fontSize=9.2,
            leading=13.2,
            textColor=colors.HexColor("#39443D"),
        ),
        "Bullet": ParagraphStyle(
            "Bullet",
            parent=base["BodyText"],
            fontSize=9.3,
            leading=13.5,
            leftIndent=8,
            firstLineIndent=-8,
            textColor=colors.HexColor("#333A35"),
            spaceAfter=4,
        ),
    }

    d = lambda *keys, default=None: _dato(datos, *keys, defecto=default)

    distancia = d("distancia")
    desnivel = d("desnivel")
    diametro = d("diametro")
    ramales = d("ramales")
    nramales = d("nramales")
    puntos = d("puntos")
    gotero = d("gotero")
    agua = d("agua")
    horas = d("horas")
    presion = d("presion")
    sol = d("sol")
    rendimiento = d("rendimiento")
    usar_bateria = d("usarBateria", "usar_bateria", default=False)

    caudal_necesario = d("caudalNecesario")
    caudal_recomendado = d("caudalRecomendado")
    perdida_principal = d("perdidaPrincipal")
    perdida_ramales = d("perdidaRamales")
    perdida_total = d("perdidaTotal")
    altura_total = d("alturaTotal")
    altura_recomendada = d("alturaRecomendada")
    potencia_hidraulica = d("potenciaHidraulica")
    potencia_electrica = d("potenciaElectrica")
    energia_diaria = d("energiaDiaria")
    panel_solar = d("panelSolar")
    bomba_w = d("bombaW")
    bateria_wh = d("bateriaWh")
    caudal_m3 = d("caudalRecM3")

    fecha = datetime.now().strftime("%d/%m/%Y")
    referencia = session_id[-10:] if session_id else "—"

    elementos = []

    # PÁGINA 1 — PORTADA
    elementos += [
        Spacer(1, 18 * mm),
        Paragraph("FincaSinRed", estilos["CoverTitle"]),
        Paragraph("PROYECTO TÉCNICO PREMIUM", estilos["CoverSub"]),
        Paragraph(
            "Dimensionamiento orientativo de instalación hidráulica y energía solar",
            estilos["CoverSub"],
        ),
        Spacer(1, 8 * mm),
    ]

    portada = Table(
        [
            [Paragraph("Fecha de emisión", estilos["TableLabel"]), Paragraph(fecha, estilos["TableValue"])],
            [Paragraph("Referencia", estilos["TableLabel"]), Paragraph(escape(referencia), estilos["TableValue"])],
            [
                Paragraph("Estado", estilos["TableLabel"]),
                Paragraph("Proyecto generado tras confirmar el pago", estilos["TableValue"]),
            ],
        ],
        colWidths=[58 * mm, 107 * mm],
    )
    portada.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F1F5F2")),
                ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#BFCBC2")),
                ("INNERGRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#DDE5DF")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 9),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
            ]
        )
    )

    elementos += [
        portada,
        Spacer(1, 10 * mm),
        _callout(
            "<b>Qué incluye este informe:</b> resumen de resultados, lectura de los datos introducidos, "
            "cálculo hidráulico, diseño orientativo de la red, selección de potencia, integración solar, "
            "lista de materiales, procedimiento de montaje, comprobaciones previas y conclusiones.",
            estilos,
        ),
        Spacer(1, 8 * mm),
        Paragraph(
            "Este documento transforma los datos introducidos en una guía de dimensionamiento y compra. "
            "Los valores son orientativos: la instalación real debe verificarse sobre el terreno y los equipos "
            "deben seleccionarse con sus curvas y especificaciones técnicas.",
            estilos["CoverNote"],
        ),
        Spacer(1, 20 * mm),
        Paragraph("INFORME DE 10 PÁGINAS", estilos["CoverSub"]),
        PageBreak(),
    ]

    # PÁGINA 2 — RESUMEN + DATOS
    elementos += _seccion("1. Resumen ejecutivo", estilos)
    elementos.append(
        Paragraph(
            "Esta primera lectura permite conocer rápidamente el tamaño de la instalación, el caudal que debe "
            "mover la bomba y la altura que debe vencer. Son los datos principales que conviene tener delante "
            "antes de comprar materiales.",
            estilos["BodyLarge"],
        )
    )
    elementos.append(
        _tabla(
            [
                ("Caudal necesario", f"{_entero(caudal_necesario)} L/h"),
                ("Caudal recomendado", f"{_entero(caudal_recomendado)} L/h"),
                ("Altura recomendada", f"{_numero(altura_recomendada, 1)} m.c.a."),
                ("Bomba orientativa", f"≥ {_entero(bomba_w)} W"),
                ("Panel solar orientativo", f"{_entero(panel_solar)} Wp"),
                ("Tubería principal", f"{_texto(distancia)} m · Ø {_texto(diametro)} mm"),
                ("Red de riego", f"{_texto(nramales)} ramales · {_texto(puntos)} puntos"),
            ],
            estilos,
        )
    )
    elementos += _seccion("2. Datos introducidos", estilos)
    elementos.append(
        _tabla(
            [
                ("Distancia principal", f"{_texto(distancia)} m"),
                ("Desnivel", f"{_texto(desnivel)} m"),
                ("Diámetro de tubería", f"{_texto(diametro)} mm"),
                ("Longitud total de ramales", f"{_texto(ramales)} m"),
                ("Número de ramales", _texto(nramales)),
                ("Puntos de riego", _texto(puntos)),
                ("Caudal por gotero", f"{_texto(gotero)} L/h"),
                ("Agua disponible", f"{_texto(agua)} L"),
                ("Horas de funcionamiento", f"{_texto(horas)} h/día"),
                ("Presión indicada", f"{_texto(presion)} bar"),
                ("Horas solares", f"{_texto(sol)} h"),
                ("Rendimiento considerado", f"{_texto(rendimiento)} %"),
                ("Uso de batería", _bool(usar_bateria)),
            ],
            estilos,
        )
    )
    elementos.append(Spacer(1, 5))
    elementos.append(
        _callout(
            "<b>Interpretación:</b> estos datos describen la situación de partida. Si cualquiera de ellos "
            "cambia —por ejemplo, más metros de tubería, más goteros o mayor desnivel— el dimensionamiento "
            "debería recalcularse antes de comprar la bomba.",
            estilos,
        )
    )
    elementos.append(PageBreak())

    # PÁGINA 3 — LECTURA DEL TERRENO
    elementos += _seccion("3. Lectura de la instalación y del terreno", estilos)
    elementos.append(
        Paragraph(
            f"El trazado parte de una distancia principal de <b>{_texto(distancia)} m</b> y un desnivel de "
            f"<b>{_texto(desnivel)} m</b>. El agua debe recorrer la conducción principal y después repartirse "
            f"por {_texto(nramales)} ramales hasta los puntos de riego.",
            estilos["BodyLarge"],
        )
    )
    elementos.append(_grafico_terreno(distancia, desnivel, estilos))
    elementos += _subtitulo("Qué significa el trazado", estilos)
    for texto_bullet in [
        "La conducción principal debe dimensionarse pensando en el caudal que circulará por ella y en la longitud total.",
        "El desnivel consume parte de la presión disponible antes de que el agua llegue a los emisores.",
        "La división en varios ramales permite repartir el agua, pero introduce pérdidas adicionales en conexiones y tuberías.",
        "La posición real del depósito, bomba y ramales debe comprobarse sobre el terreno antes de fijar el recorrido definitivo.",
    ]:
        elementos.append(Paragraph(f"• {texto_bullet}", estilos["Bullet"]))
    elementos.append(
        _callout(
            "<b>Punto crítico:</b> la geometría real manda. Una medición incorrecta de distancia o desnivel "
            "puede hacer que una bomba aparentemente adecuada trabaje fuera de su punto de funcionamiento.",
            estilos,
            "#FFF8E8",
        )
    )
    elementos.append(PageBreak())

    # PÁGINA 4 — CÁLCULO HIDRÁULICO
    elementos += _seccion("4. Cálculo hidráulico", estilos)
    elementos.append(
        Paragraph(
            "El objetivo del cálculo hidráulico es traducir el consumo de los emisores y las características "
            "del trazado en un punto de trabajo que sirva para buscar la bomba. La altura final combina el "
            "desnivel y las pérdidas estimadas en las conducciones.",
            estilos["BodyLarge"],
        )
    )
    elementos.append(
        _tabla(
            [
                ("Caudal necesario", f"{_entero(caudal_necesario)} L/h"),
                ("Caudal recomendado", f"{_entero(caudal_recomendado)} L/h"),
                ("Caudal recomendado", f"{_numero(caudal_m3, 2)} m³/h"),
                ("Pérdida en tubería principal", f"{_numero(perdida_principal, 2)} m"),
                ("Pérdida en ramales", f"{_numero(perdida_ramales, 2)} m"),
                ("Pérdida total estimada", f"{_numero(perdida_total, 2)} m"),
                ("Altura total calculada", f"{_numero(altura_total, 2)} m.c.a."),
                ("Altura recomendada", f"{_numero(altura_recomendada, 2)} m.c.a."),
            ],
            estilos,
        )
    )
    elementos.append(Spacer(1, 5))
    elementos.append(_grafico_hidraulico(caudal_recomendado, altura_recomendada, estilos))
    elementos += _subtitulo("Cómo utilizar estos valores al comprar", estilos)
    elementos.append(
        Paragraph(
            "No basta con buscar una bomba que anuncie muchos litros por hora. Hay que comprobar cuántos litros "
            "por hora entrega la bomba cuando trabaja a la altura requerida. La referencia útil es el punto "
            "caudal-altura, no solamente la potencia eléctrica indicada en la caja.",
            estilos["Body"],
        )
    )
    elementos.append(
        _callout(
            "<b>Regla práctica:</b> compara siempre la curva del fabricante con el caudal recomendado y la altura "
            "recomendada. Si el punto de trabajo queda muy lejos de la zona de rendimiento útil, la bomba elegida "
            "puede no proporcionar el servicio esperado.",
            estilos,
        )
    )
    elementos.append(PageBreak())

    # PÁGINA 5 — DISEÑO DE RED
    elementos += _seccion("5. Diseño de la red de riego", estilos)
    elementos.append(
        Paragraph(
            f"La configuración calculada contempla una tubería principal de {_texto(distancia)} m y "
            f"{_texto(nramales)} ramales, con {_texto(puntos)} puntos de riego en total. El esquema siguiente "
            "representa la lógica de distribución y sirve como guía para organizar el montaje.",
            estilos["BodyLarge"],
        )
    )
    elementos.append(
        _tabla(
            [
                ("Tubería principal", f"{_texto(distancia)} m · Ø {_texto(diametro)} mm"),
                ("Ramales", f"{_texto(nramales)} unidades"),
                ("Longitud total de ramales", f"{_texto(ramales)} m"),
                ("Puntos de riego", f"{_texto(puntos)} unidades"),
                ("Caudal de cada gotero", f"{_texto(gotero)} L/h"),
                ("Caudal total de emisores", f"{_entero(caudal_necesario)} L/h"),
            ],
            estilos,
        )
    )
    elementos.append(Spacer(1, 4))
    elementos.append(_grafico_terreno(distancia, desnivel, estilos))
    elementos += _subtitulo("Criterios de montaje", estilos)
    for texto_bullet in [
        "Colocar el filtrado antes de los emisores y mantener accesibles los elementos que requieran limpieza.",
        "Separar los ramales mediante derivaciones y válvulas que permitan aislar sectores durante el mantenimiento.",
        "Evitar estrangulamientos, curvas innecesarias y reducciones bruscas de diámetro en la conducción principal.",
        "Comprobar que todos los emisores reciben agua de forma razonablemente uniforme antes de dar por terminado el montaje.",
    ]:
        elementos.append(Paragraph(f"• {texto_bullet}", estilos["Bullet"]))
    elementos.append(PageBreak())

    # PÁGINA 6 — BOMBA Y SOLAR
    elementos += _seccion("6. Bomba, energía y apoyo solar", estilos)
    elementos.append(
        Paragraph(
            "La parte energética debe analizarse junto con la hidráulica. La potencia calculada es una referencia "
            "para dimensionar el conjunto, mientras que la elección de bomba se debe cerrar con su curva real, "
            "tensión de trabajo y condiciones de funcionamiento.",
            estilos["BodyLarge"],
        )
    )
    elementos.append(
        _tabla(
            [
                ("Potencia hidráulica calculada", f"{_numero(potencia_hidraulica, 1)} W"),
                ("Potencia eléctrica orientativa", f"{_numero(potencia_electrica, 1)} W"),
                ("Energía diaria estimada", f"{_numero(energia_diaria, 2)} Wh/día"),
                ("Bomba orientativa", f"≥ {_entero(bomba_w)} W"),
                ("Panel solar orientativo", f"{_entero(panel_solar)} Wp"),
                (
                    "Batería orientativa",
                    f"{_entero(bateria_wh)} Wh" if _bool(usar_bateria) == "Sí" else "No prevista",
                ),
            ],
            estilos,
        )
    )
    elementos.append(Spacer(1, 4))
    elementos.append(_grafico_solar(panel_solar, bomba_w, energia_diaria, estilos))
    elementos += _subtitulo("Qué debe verificarse antes de comprar", estilos)
    for texto_bullet in [
        "Tensión y tipo de alimentación de la bomba.",
        "Caudal real de la bomba a la altura de trabajo calculada.",
        "Potencia disponible del campo solar en las condiciones reales de uso.",
        "Necesidad o no de batería según el horario de funcionamiento y la estrategia de riego.",
        "Protecciones, cableado, conectores y control compatibles con la instalación concreta.",
    ]:
        elementos.append(Paragraph(f"• {texto_bullet}", estilos["Bullet"]))
    elementos.append(
        _callout(
            "<b>Importante:</b> el panel solar indicado es un dimensionamiento orientativo, no una garantía de "
            "funcionamiento continuo. La producción real depende de irradiación, orientación, temperatura, "
            "pérdidas y electrónica utilizada.",
            estilos,
            "#FFF8E8",
        )
    )
    elementos.append(PageBreak())

    # PÁGINA 7 — MATERIALES
    elementos += _seccion("7. Lista de materiales orientativa", estilos)
    elementos.append(
        Paragraph(
            "Esta lista sirve como base para preparar la compra. Las cantidades de conexiones, válvulas y accesorios "
            "deben ajustarse al trazado definitivo y a las medidas reales de la finca.",
            estilos["Body"],
        )
    )
    filas_materiales = [
        ["Elemento", "Cantidad / especificación", "Qué comprobar"],
        ["Tubería principal", f"{_texto(distancia)} m · Ø {_texto(diametro)} mm", "Presión de trabajo y trazado"],
        ["Tubería de ramales", f"{_texto(ramales)} m totales", "Longitud real de cada sector"],
        ["Emisores/goteros", f"{_texto(puntos)} uds · {_texto(gotero)} L/h", "Caudal y uniformidad"],
        ["Bomba", f"≥ {_entero(bomba_w)} W", "Curva caudal-altura"],
        ["Panel solar", f"≈ {_entero(panel_solar)} Wp", "Tensión y potencia útil"],
        ["Batería", f"{_entero(bateria_wh)} Wh" if _bool(usar_bateria) == "Sí" else "No prevista", "Solo si procede"],
        ["Filtrado", "1 conjunto adecuado", "Caudal y calidad del agua"],
        ["Válvulas", f"Según {_texto(nramales)} ramales", "Aislamiento por sectores"],
        ["Derivaciones", "Según trazado", "Diámetros compatibles"],
        ["Uniones y accesorios", "Según montaje", "Roscas, abrazaderas y sellado"],
        ["Elementos de fijación", "Según terreno", "Protección frente a movimiento"],
    ]
    elementos.append(_tabla_tres_columnas(filas_materiales, estilos))
    elementos.append(Spacer(1, 4))
    elementos.append(
        _callout(
            "<b>Compra inteligente:</b> no cierres cantidades definitivas de accesorios hasta medir el recorrido "
            "real. Es preferible reservar margen para pequeñas desviaciones que comprar una instalación completa "
            "basándose en un plano que todavía no se ha replanteado.",
            estilos,
        )
    )
    elementos.append(PageBreak())

    # PÁGINA 8 — PROCEDIMIENTO DE INSTALACIÓN
    elementos += _seccion("8. Procedimiento recomendado de instalación", estilos)
    elementos.append(
        Paragraph(
            "El siguiente orden reduce la posibilidad de desmontar elementos una vez instalados y permite comprobar "
            "la instalación por etapas.",
            estilos["BodyLarge"],
        )
    )
    pasos = [
        ("01", "Replanteo", "Marcar depósito, bomba, recorrido principal, ramales y puntos de riego sobre el terreno."),
        ("02", "Conducción principal", "Instalar la tubería principal evitando estrangulamientos y protegiendo las zonas expuestas."),
        ("03", "Filtrado", "Colocar el sistema de filtrado en una posición accesible para limpieza y mantenimiento."),
        ("04", "Derivaciones", "Crear las salidas hacia los ramales y, cuando sea necesario, instalar válvulas de aislamiento."),
        ("05", "Ramales y emisores", "Distribuir los ramales, colocar emisores y comprobar que no existan fugas."),
        ("06", "Bomba", "Conectar la bomba siguiendo las especificaciones del fabricante y verificar aspiración, impulsión y protecciones."),
        ("07", "Solar", "Instalar panel, controlador y batería si procede, respetando tensión, polaridad y protecciones."),
        ("08", "Prueba", "Purgar, limpiar filtros, presurizar y revisar uniformidad de riego antes del uso normal."),
    ]

    bloques = []
    for numero, titulo, descripcion in pasos:
        bloque = Table(
            [
                [
                    Paragraph(f"<b>{numero}</b>", estilos["Section"]),
                    Paragraph(f"<b>{titulo}</b><br/>{escape(descripcion)}", estilos["Body"]),
                ]
            ],
            colWidths=[20 * mm, 145 * mm],
        )
        bloque.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#EAF2EB")),
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#C9D4CC")),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                    ("TOPPADDING", (0, 0), (-1, -1), 6),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ]
            )
        )
        bloques.append(bloque)
        bloques.append(Spacer(1, 2.5 * mm))

    elementos.extend(bloques)
    elementos.append(
        _callout(
            "<b>Prueba final:</b> comprueba primero la instalación sin exigir el máximo caudal durante un periodo "
            "prolongado. Revisa fugas, presión, filtros y uniformidad de los emisores antes de dejarla funcionando "
            "de forma automática.",
            estilos,
            "#FFF8E8",
        )
    )
    elementos.append(PageBreak())

    # PÁGINA 9 — COMPROBACIONES Y PRESUPUESTO
    elementos += _seccion("9. Comprobaciones antes de comprar", estilos)
    elementos.append(
        Paragraph(
            "Antes de realizar la compra definitiva conviene convertir el cálculo en una lista de comprobación. "
            "Esta página está pensada para utilizarla desde el móvil o llevarla a la tienda junto con las medidas de la finca.",
            estilos["BodyLarge"],
        )
    )

    comprobaciones = [
        "¿La distancia principal medida coincide con el dato introducido?",
        "¿El desnivel se ha comprobado en el recorrido real?",
        "¿La bomba entrega el caudal recomendado a la altura recomendada?",
        "¿La tubería soporta la presión prevista y las condiciones del terreno?",
        "¿El filtro está dimensionado para el caudal y la calidad del agua?",
        "¿El diámetro de las conexiones coincide entre bomba, tuberías y accesorios?",
        "¿El sistema solar trabaja a la misma tensión que la bomba y su controlador?",
        "¿La batería es necesaria para el horario real de funcionamiento?",
        "¿Se han previsto válvulas y puntos de purga/limpieza donde sean necesarios?",
        "¿Se ha reservado margen para conexiones y pequeñas modificaciones de trazado?",
    ]
    for i, item in enumerate(comprobaciones, 1):
        elementos.append(Paragraph(f"<b>{i:02d}.</b> {escape(item)}", estilos["Bullet"]))

    elementos += _subtitulo("Presupuesto de compra", estilos)
    elementos.append(
        _tabla_tres_columnas(
            [
                ["Partida", "Cantidad", "Precio"],
                ["Tubería principal", f"{_texto(distancia)} m", "Completar con precio real"],
                ["Ramales", f"{_texto(ramales)} m", "Completar con precio real"],
                ["Emisores", f"{_texto(puntos)} uds", "Completar con precio real"],
                ["Bomba", f"≥ {_entero(bomba_w)} W", "Comparar 2–3 modelos"],
                ["Panel solar", f"{_entero(panel_solar)} Wp", "Comparar según disponibilidad"],
                ["Filtrado y accesorios", "Según trazado", "Medir antes de comprar"],
                ["Control/protecciones", "Según sistema", "Verificar compatibilidad"],
            ],
            estilos,
        )
    )
    elementos.append(Spacer(1, 4))
    elementos.append(
        _callout(
            "<b>Por qué no aparece un precio inventado:</b> los precios de materiales y equipos cambian según marca, "
            "tienda, potencia y disponibilidad. El proyecto deja las partidas preparadas para comparar ofertas reales "
            "en el momento de la compra.",
            estilos,
            "#FFF8E8",
        )
    )
    elementos.append(PageBreak())

    # PÁGINA 10 — CONCLUSIONES
    elementos += _seccion("10. Conclusiones y hoja de decisión", estilos)
    elementos.append(
        Paragraph(
            f"Con los datos introducidos, el sistema queda dimensionado alrededor de un caudal recomendado de "
            f"<b>{_entero(caudal_recomendado)} L/h</b> y una altura recomendada de <b>{_numero(altura_recomendada, 1)} m.c.a.</b>. "
            f"La referencia energética resultante es una bomba de al menos <b>{_entero(bomba_w)} W</b> y un apoyo solar "
            f"orientativo de <b>{_entero(panel_solar)} Wp</b>.",
            estilos["BodyLarge"],
        )
    )
    elementos.append(
        _callout(
            "<b>Decisión de compra:</b> utiliza como referencias principales el caudal recomendado, la altura recomendada "
            "y la curva real de la bomba. Después verifica tubería, filtrado, alimentación eléctrica y sistema solar. "
            "No compres por potencia nominal aislada.",
            estilos,
        )
    )
    elementos += _subtitulo("Resumen final", estilos)
    elementos.append(
        _tabla(
            [
                ("Distancia principal", f"{_texto(distancia)} m"),
                ("Desnivel", f"{_texto(desnivel)} m"),
                ("Caudal recomendado", f"{_entero(caudal_recomendado)} L/h · {_numero(caudal_m3,2)} m³/h"),
                ("Altura recomendada", f"{_numero(altura_recomendada,2)} m.c.a."),
                ("Bomba orientativa", f"≥ {_entero(bomba_w)} W"),
                ("Panel solar", f"{_entero(panel_solar)} Wp"),
                ("Ramales / puntos", f"{_texto(nramales)} / {_texto(puntos)}"),
            ],
            estilos,
        )
    )
    elementos.append(Spacer(1, 8))
    elementos.append(
        Paragraph(
            "Este informe es una herramienta de orientación y compra. No sustituye un proyecto técnico firmado, "
            "un estudio de seguridad, una comprobación hidráulica in situ ni la documentación exigible para una "
            "instalación concreta. La responsabilidad de seleccionar, instalar y proteger los equipos corresponde "
            "a la persona que ejecute la instalación y, cuando sea exigible, a un profesional competente.",
            estilos["Small"],
        )
    )
    elementos.append(Spacer(1, 12 * mm))
    elementos.append(
        Table(
            [[
                Paragraph(
                    "<b>FincaSinRed</b><br/>Proyecto técnico orientativo · Documento premium generado automáticamente",
                    estilos["Small"],
                )
            ]],
            colWidths=[165 * mm],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F1F5F2")),
                    ("BOX", (0, 0), (-1, -1), 0.7, colors.HexColor("#C9D4CC")),
                    ("LEFTPADDING", (0, 0), (-1, -1), 10),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                    ("TOPPADDING", (0, 0), (-1, -1), 9),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
                ]
            ),
        )
    )

    documento.build(elementos, onFirstPage=_pie, onLaterPages=_pie)
    buffer.seek(0)
    return buffer


@app.get("/descargar-pdf")
def descargar_pdf(session_id: str):
    try:
        session = stripe.checkout.Session.retrieve(session_id).to_dict()
        if session.get("payment_status") != "paid":
            raise HTTPException(status_code=403, detail="El pago todavía no está confirmado")

        datos_codificados = session.get("metadata", {}).get("proyecto")
        if not datos_codificados:
            raise HTTPException(status_code=400, detail="No se encontraron los datos del proyecto")

        datos = json.loads(
            zlib.decompress(base64.b64decode(datos_codificados)).decode("utf-8")
        )
        buffer = _construir_pdf(datos, session_id)

        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={
                "Content-Disposition": "attachment; filename=proyecto-tecnico-fincasinred.pdf"
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
