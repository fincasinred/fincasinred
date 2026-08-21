from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.responses import FileResponse, StreamingResponse

import os
import json
import zlib
import base64
import io
from datetime import datetime
from html import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
import stripe

app = FastAPI(title="FincaSinRed", version="7.1")
stripe.api_key = os.environ.get("STRIPE_SECRET_KEY")

@app.get("/")
def home():
    return FileResponse("index.html")

@app.get("/health")
def health():
    return {"status": "ok", "version": app.version}

@app.post("/crear-pago")
def crear_pago():
    if not stripe.api_key:
        raise HTTPException(status_code=500, detail="Stripe no está configurado")
    try:
        session = stripe.checkout.Session.create(
            mode="payment",
            line_items=[{"price": "price_1U5rSq1xCi4MDD5SLwMswGrO", "quantity": 1}],
            success_url="https://fincasinred.onrender.com/?pago=ok&session_id={CHECKOUT_SESSION_ID}",
            cancel_url="https://fincasinred.onrender.com/?pago=cancelado"
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
        raise HTTPException(status_code=400, detail="No se han recibido datos del proyecto")
    try:
        session = stripe.checkout.Session.create(
            mode="payment",
            line_items=[{"price": "price_1U5rSq1xCi4MDD5SLwMswGr0", "quantity": 1}],
            metadata={"proyecto": base64.b64encode(zlib.compress(json.dumps(proyecto.datos, separators=(",", ":")).encode())).decode()},
            success_url="https://fincasinred.onrender.com/?pago=ok&session_id={CHECKOUT_SESSION_ID}",
            cancel_url="https://fincasinred.onrender.com/?pago=cancelado"
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
        datos = json.loads(zlib.decompress(base64.b64decode(datos_codificados)).decode())
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
        return f"{float(valor):,.{decimales}f}".replace(",", "X").replace(".", ",").replace("X", ".")
    except (TypeError, ValueError):
        return "—"

def _entero(valor):
    try:
        return f"{float(valor):,.0f}".replace(",", "X").replace(".", ",").replace("X", ".")
    except (TypeError, ValueError):
        return "—"

def _texto(valor):
    return "—" if valor is None or valor == "" else str(valor)

def _bool(valor):
    if isinstance(valor, bool):
        return "Sí" if valor else "No"
    return "Sí" if str(valor).lower() in {"true", "1", "si", "sí", "yes"} else "No"

def _tabla(filas, estilos, anchos=None):
    datos = [[Paragraph(f"<b>{escape(str(a))}</b>", estilos["TableLabel"]), Paragraph(escape(str(b)), estilos["TableValue"])] for a, b in filas]
    tabla = Table(datos, colWidths=anchos or [70 * mm, 95 * mm])
    tabla.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F1F5F2")),
        ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#C9D4CC")),
        ("INNERGRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#DDE5DF")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 9), ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    return tabla

def _seccion(titulo, estilos):
    return [Spacer(1, 7), Paragraph(escape(titulo), estilos["Section"]), Spacer(1, 5)]

def _pie(canvas, documento):
    canvas.saveState()
    ancho, _ = A4
    canvas.setStrokeColor(colors.HexColor("#D5DDD7"))
    canvas.line(18 * mm, 14 * mm, ancho - 18 * mm, 14 * mm)
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(colors.HexColor("#66736A"))
    canvas.drawString(18 * mm, 9 * mm, "FincaSinRed · Proyecto orientativo de instalación")
    canvas.drawRightString(ancho - 18 * mm, 9 * mm, f"Página {documento.page}")
    canvas.restoreState()

def _construir_pdf(datos, session_id):
    buffer = io.BytesIO()
    documento = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=18 * mm, leftMargin=18 * mm, topMargin=18 * mm, bottomMargin=20 * mm, title="Proyecto Técnico Premium - FincaSinRed", author="FincaSinRed", subject="Proyecto orientativo de instalación hidráulica y solar")
    base = getSampleStyleSheet()
    estilos = {
        "CoverTitle": ParagraphStyle("CoverTitle", parent=base["Title"], fontName="Helvetica-Bold", fontSize=28, leading=32, alignment=TA_CENTER, textColor=colors.HexColor("#236B35"), spaceAfter=12),
        "CoverSub": ParagraphStyle("CoverSub", parent=base["Heading2"], fontName="Helvetica", fontSize=15, leading=20, alignment=TA_CENTER, textColor=colors.HexColor("#39443D"), spaceAfter=10),
        "CoverNote": ParagraphStyle("CoverNote", parent=base["BodyText"], fontSize=9.5, leading=14, alignment=TA_CENTER, textColor=colors.HexColor("#66736A")),
        "Section": ParagraphStyle("Section", parent=base["Heading2"], fontName="Helvetica-Bold", fontSize=14, leading=18, textColor=colors.HexColor("#236B35"), spaceBefore=8, spaceAfter=6),
        "Body": ParagraphStyle("Body", parent=base["BodyText"], fontSize=9, leading=13.5, textColor=colors.HexColor("#333A35"), spaceAfter=6),
        "Small": ParagraphStyle("Small", parent=base["BodyText"], fontSize=7.8, leading=11, textColor=colors.HexColor("#66736A")),
        "TableLabel": ParagraphStyle("TableLabel", parent=base["BodyText"], fontSize=8.4, leading=11, textColor=colors.HexColor("#39443D")),
        "TableValue": ParagraphStyle("TableValue", parent=base["BodyText"], fontSize=8.4, leading=11, textColor=colors.HexColor("#222822")),
        "Callout": ParagraphStyle("Callout", parent=base["BodyText"], fontSize=9, leading=13, textColor=colors.HexColor("#39443D"), leftIndent=8, rightIndent=8),
    }

    d = lambda *keys, default=None: _dato(datos, *keys, defecto=default)
    distancia, desnivel, diametro = d("distancia"), d("desnivel"), d("diametro")
    ramales, nramales, puntos, gotero = d("ramales"), d("nramales"), d("puntos"), d("gotero")
    agua, horas, presion, sol, rendimiento = d("agua"), d("horas"), d("presion"), d("sol"), d("rendimiento")
    usar_bateria = d("usarBateria", "usar_bateria", default=False)
    caudal_necesario, caudal_recomendado = d("caudalNecesario"), d("caudalRecomendado")
    perdida_principal, perdida_ramales, perdida_total = d("perdidaPrincipal"), d("perdidaRamales"), d("perdidaTotal")
    altura_total, altura_recomendada = d("alturaTotal"), d("alturaRecomendada")
    potencia_hidraulica, potencia_electrica = d("potenciaHidraulica"), d("potenciaElectrica")
    energia_diaria, panel_solar, bomba_w = d("energiaDiaria"), d("panelSolar"), d("bombaW")
    bateria_wh, caudal_m3 = d("bateriaWh"), d("caudalRecM3")
    fecha = datetime.now().strftime("%d/%m/%Y")
    referencia = session_id[-10:] if session_id else "—"
    elementos = [Spacer(1, 32 * mm), Paragraph("FincaSinRed", estilos["CoverTitle"]), Paragraph("PROYECTO TÉCNICO PREMIUM", estilos["CoverSub"]), Paragraph("Dimensionamiento orientativo de instalación hidráulica y energía solar", estilos["CoverSub"]), Spacer(1, 12 * mm)]
    portada = Table([[Paragraph("Fecha de emisión", estilos["TableLabel"]), Paragraph(fecha, estilos["TableValue"])], [Paragraph("Referencia", estilos["TableLabel"]), Paragraph(escape(referencia), estilos["TableValue"])], [Paragraph("Estado", estilos["TableLabel"]), Paragraph("Proyecto generado tras confirmar el pago", estilos["TableValue"])]], colWidths=[65 * mm, 100 * mm])
    portada.setStyle(TableStyle([("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F1F5F2")), ("BOX", (0, 0), (-1, -1), 0.7, colors.HexColor("#BFCBC2")), ("INNERGRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#DDE5DF")), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10), ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
    elementos += [portada, Spacer(1, 18 * mm), Paragraph("Este documento reúne los datos introducidos y los resultados calculados por FincaSinRed. Su finalidad es servir como guía de dimensionamiento y compra. No sustituye un proyecto firmado por un técnico competente ni una comprobación de la instalación en campo.", estilos["CoverNote"]), PageBreak()]

    elementos += _seccion("1. Resumen ejecutivo", estilos)
    elementos.append(_tabla([
        ("Caudal recomendado", f"{_entero(caudal_recomendado)} L/h"),
        ("Altura recomendada", f"{_numero(altura_recomendada, 1)} m.c.a."),
        ("Bomba orientativa", f"≥ {_entero(bomba_w)} W"),
        ("Panel solar orientativo", f"{_entero(panel_solar)} Wp"),
        ("Tubería principal", f"{_texto(distancia)} m · Ø {_texto(diametro)} mm"),
        ("Red de riego", f"{_texto(nramales)} ramales · {_texto(puntos)} puntos"),
    ], estilos))
    elementos.append(Spacer(1, 8))
    elementos.append(Table([[Paragraph("<b>Lectura rápida:</b> estos valores son el resultado del cálculo realizado con los datos facilitados. Antes de comprar la bomba, comprueba su curva de funcionamiento para el caudal y la altura indicados.", estilos["Callout"])]], colWidths=[165 * mm], style=TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#EEF6EF")), ("BOX", (0, 0), (-1, -1), 0.7, colors.HexColor("#B8CFBA")), ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)])))

    elementos += _seccion("2. Datos introducidos", estilos)
    elementos.append(_tabla([
        ("Distancia principal", f"{_texto(distancia)} m"), ("Desnivel", f"{_texto(desnivel)} m"), ("Diámetro de tubería", f"{_texto(diametro)} mm"),
        ("Longitud total de ramales", f"{_texto(ramales)} m"), ("Número de ramales", _texto(nramales)), ("Puntos de riego", _texto(puntos)),
        ("Caudal por gotero", f"{_texto(gotero)} L/h"), ("Agua", f"{_texto(agua)} L"), ("Horas de funcionamiento", f"{_texto(horas)} h/día"),
        ("Presión indicada", f"{_texto(presion)} bar"), ("Horas solares", f"{_texto(sol)} h"), ("Rendimiento", f"{_texto(rendimiento)} %"), ("Uso de batería", _bool(usar_bateria))
    ], estilos))

    elementos.append(PageBreak())
    elementos += _seccion("3. Cálculo hidráulico", estilos)
    elementos.append(Paragraph("El cálculo hidráulico resume el caudal que debe proporcionar la instalación y las pérdidas consideradas para estimar la altura que debe vencer la bomba. Los valores son orientativos y dependen de la geometría real, accesorios, estado de las tuberías y curva de la bomba.", estilos["Body"]))
    elementos.append(_tabla([
        ("Caudal necesario", f"{_entero(caudal_necesario)} L/h"), ("Caudal recomendado", f"{_entero(caudal_recomendado)} L/h"), ("Caudal recomendado", f"{_numero(caudal_m3, 2)} m³/h"),
        ("Pérdida en tubería principal", f"{_numero(perdida_principal, 2)} m"), ("Pérdida en ramales", f"{_numero(perdida_ramales, 2)} m"), ("Pérdida total estimada", f"{_numero(perdida_total, 2)} m"),
        ("Altura total calculada", f"{_numero(altura_total, 2)} m.c.a."), ("Altura recomendada", f"{_numero(altura_recomendada, 2)} m.c.a.")
    ], estilos))

    elementos += _seccion("4. Bomba y energía", estilos)
    elementos.append(_tabla([
        ("Potencia hidráulica calculada", f"{_numero(potencia_hidraulica, 1)} W"), ("Potencia eléctrica orientativa", f"{_numero(potencia_electrica, 1)} W"),
        ("Energía diaria estimada", f"{_numero(energia_diaria, 2)} Wh/día"), ("Bomba orientativa", f"≥ {_entero(bomba_w)} W"),
        ("Panel solar orientativo", f"{_entero(panel_solar)} Wp"), ("Batería orientativa", f"{_entero(bateria_wh)} Wh" if _bool(usar_bateria) == "Sí" else "No prevista")
    ], estilos))
    elementos.append(Paragraph("La potencia indicada no identifica un modelo concreto. La selección final debe hacerse comparando la curva de la bomba con el punto de trabajo de caudal y altura y comprobando la tensión disponible y el sistema solar elegido.", estilos["Body"]))

    elementos.append(PageBreak())
    elementos += _seccion("5. Diseño de la red de riego", estilos)
    elementos.append(_tabla([
        ("Tubería principal", f"{_texto(distancia)} m · Ø {_texto(diametro)} mm"), ("Ramales", f"{_texto(nramales)} unidades"),
        ("Longitud total de ramales", f"{_texto(ramales)} m"), ("Puntos de riego", f"{_texto(puntos)} unidades"),
        ("Caudal de cada gotero", f"{_texto(gotero)} L/h"), ("Caudal total de emisores", f"{_entero(caudal_necesario)} L/h")
    ], estilos))

    elementos += _seccion("6. Lista de materiales orientativa", estilos)
    filas = [
        [Paragraph("<b>Elemento</b>", estilos["TableLabel"]), Paragraph("<b>Cantidad / especificación</b>", estilos["TableLabel"]), Paragraph("<b>Observación</b>", estilos["TableLabel"])],
        [Paragraph("Tubería principal", estilos["TableValue"]), Paragraph(f"{_texto(distancia)} m · Ø {_texto(diametro)} mm", estilos["TableValue"]), Paragraph("Verificar diámetro y presión de trabajo", estilos["TableValue"])],
        [Paragraph("Tubería de ramales", estilos["TableValue"]), Paragraph(f"{_texto(ramales)} m totales", estilos["TableValue"]), Paragraph("Distribuir según el trazado real", estilos["TableValue"])],
        [Paragraph("Emisores/goteros", estilos["TableValue"]), Paragraph(f"{_texto(puntos)} unidades · {_texto(gotero)} L/h", estilos["TableValue"]), Paragraph("Comprobar presión y uniformidad", estilos["TableValue"])],
        [Paragraph("Bomba", estilos["TableValue"]), Paragraph(f"≥ {_entero(bomba_w)} W", estilos["TableValue"]), Paragraph("Seleccionar por curva caudal-altura", estilos["TableValue"])],
        [Paragraph("Panel solar", estilos["TableValue"]), Paragraph(f"≈ {_entero(panel_solar)} Wp", estilos["TableValue"]), Paragraph("Dimensionamiento orientativo", estilos["TableValue"])],
        [Paragraph("Batería", estilos["TableValue"]), Paragraph(f"≈ {_entero(bateria_wh)} Wh" if _bool(usar_bateria) == "Sí" else "No prevista", estilos["TableValue"]), Paragraph("Solo si el diseño utiliza almacenamiento", estilos["TableValue"])],
        [Paragraph("Filtrado", estilos["TableValue"]), Paragraph("1 conjunto adecuado", estilos["TableValue"]), Paragraph("Dimensionar según caudal y calidad del agua", estilos["TableValue"])],
        [Paragraph("Válvulas y conexiones", estilos["TableValue"]), Paragraph("Según número de ramales", estilos["TableValue"]), Paragraph("Confirmar trazado antes de comprar", estilos["TableValue"])],
    ]
    mt = Table(filas, colWidths=[43 * mm, 58 * mm, 64 * mm], repeatRows=1)
    mt.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#236B35")), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#BFCBC2")), ("INNERGRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#DDE5DF")), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F7F9F7")]), ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6), ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    elementos.append(mt)

    elementos += _seccion("7. Recomendaciones antes de comprar", estilos)
    for i, texto in enumerate([
        "Comprobar la distancia y el desnivel reales sobre el terreno.",
        "Comprobar que la tubería principal tenga el diámetro y presión de trabajo adecuados.",
        "Elegir la bomba por su curva de rendimiento y no únicamente por la potencia nominal.",
        "Comprobar que el panel solar y, cuando proceda, la batería sean compatibles con la tensión de la bomba.",
        "Instalar filtrado adecuado para evitar obstrucciones en los emisores.",
        "Revisar conexiones, válvulas y distribución de ramales antes de realizar la compra definitiva.",
    ], 1):
        elementos.append(Paragraph(f"<b>{i}.</b> {escape(texto)}", estilos["Body"]))

    elementos += _seccion("8. Conclusiones", estilos)
    elementos.append(Paragraph(f"Para los datos introducidos, FincaSinRed obtiene un caudal recomendado de <b>{_entero(caudal_recomendado)} L/h</b> y una altura recomendada de <b>{_numero(altura_recomendada, 1)} m.c.a.</b>. La bomba orientativa queda en <b>≥ {_entero(bomba_w)} W</b> y el apoyo solar estimado en <b>{_entero(panel_solar)} Wp</b>. Estos valores deben contrastarse con las condiciones reales de la instalación y con las especificaciones de los equipos antes de la compra.", estilos["Body"]))
    elementos.append(Spacer(1, 8))
    elementos.append(Table([[Paragraph("DOCUMENTO ORIENTATIVO · FincaSinRed no garantiza el rendimiento de una instalación que no haya sido verificada físicamente. La elección definitiva de equipos, protecciones, cableado y elementos de seguridad corresponde a la instalación concreta y, cuando sea exigible, a un profesional competente.", estilos["Small"])]], colWidths=[165 * mm], style=TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F5F6F5")), ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#D1D6D2")), ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7)])))

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
        datos = json.loads(zlib.decompress(base64.b64decode(datos_codificados)).decode())
        buffer = _construir_pdf(datos, session_id)
        return StreamingResponse(buffer, media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=proyecto-tecnico-fincasinred.pdf"})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))