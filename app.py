from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.responses import FileResponse, StreamingResponse

import os
import json
import zlib
import base64
import io
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
import stripe

app = FastAPI(title="FincaSinRed", version="7.0")

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

        raise HTTPException(

            status_code=500,

            detail="Stripe no está configurado"

        )

    try:

        session = stripe.checkout.Session.create(

            mode="payment",

            line_items=[

                {

                    "price": "price_1U5rSq1xCi4MDD5SLwMswGrO",

                    "quantity": 1

                }

            ],

            success_url="https://fincasinred.onrender.com/?pago=ok",

            cancel_url="https://fincasinred.onrender.com/?pago=cancelado"

        )

        return {"url": session.url}

    except Exception as e:

        raise HTTPException(

            status_code=500,

            detail=str(e)

        )


class ProyectoDatos(BaseModel):

    datos: dict

@app.post("/guardar-proyecto")

def guardar_proyecto(proyecto: ProyectoDatos):

    if not proyecto.datos:

        raise HTTPException(

            status_code=400,

            detail="No se han recibido datos del proyecto"

        )

    return {

        "ok": True,

        "mensaje": "Datos del proyecto recibidos correctamente"

    }
@app.post("/crear-checkout")
def crear_checkout(proyecto: ProyectoDatos):

    if not stripe.api_key:
        raise HTTPException(
            status_code=500,
            detail="Stripe no está configurado"
        )

    if not proyecto.datos:
        raise HTTPException(
            status_code=400,
            detail="No se han recibido datos del proyecto"
        )

    try:
        session = stripe.checkout.Session.create(
            mode="payment",
            line_items=[
                {
                    "price": "price_1U5rSq1xCi4MDD5SLwMswGr0",
                    "quantity": 1
                }
            ],
  metadata={
    "proyecto": base64.b64encode(
        zlib.compress(
            json.dumps(proyecto.datos, separators=(",", ":")).encode()
        )
    ).decode()
},
            success_url="https://fincasinred.onrender.com/?pago=ok&session_id={CHECKOUT_SESSION_ID}",
            cancel_url="https://fincasinred.onrender.com/?pago=cancelado"
        )

        return {
            "ok": True,
            "url": session.url
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )
@app.get("/verificar-pago")
def verificar_pago(session_id: str):

    try:
        session = stripe.checkout.Session.retrieve(session_id)
        session = session.to_dict()

        if session.get("payment_status") != "paid":
            raise HTTPException(
                status_code=403,
                detail="El pago todavía no está confirmado"
            )

        datos_codificados = session.get("metadata", {}).get("proyecto")

        if not datos_codificados:
            raise HTTPException(
                status_code=400,
                detail="No se encontraron los datos del proyecto"
            )

        datos = json.loads(
            zlib.decompress(
                base64.b64decode(datos_codificados)
            ).decode()
        )

        return {
            "ok": True,
            "pago": "pagado",
            "proyecto": datos
        }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )
@app.get("/descargar-pdf")
def descargar_pdf(session_id: str):

    try:
        session = stripe.checkout.Session.retrieve(session_id)
        session = session.to_dict()

        if session.get("payment_status") != "paid":
            raise HTTPException(
                status_code=403,
                detail="El pago todavía no está confirmado"
            )

        datos_codificados = session.get("metadata", {}).get("proyecto")

        if not datos_codificados:
            raise HTTPException(
                status_code=400,
                detail="No se encontraron los datos del proyecto"
            )

        datos = json.loads(
            zlib.decompress(
                base64.b64decode(datos_codificados)
            ).decode()
        )

        buffer = io.BytesIO()

        documento = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=40,
            leftMargin=40,
            topMargin=40,
            bottomMargin=40
        )

        estilos = getSampleStyleSheet()
        elementos = []

        elementos.append(
            Paragraph(
                "FincaSinRed",
                estilos["Title"]
            )
        )

        elementos.append(
            Paragraph(
                "Proyecto de instalación solar",
                estilos["Heading2"]
            )
        )

        elementos.append(Spacer(1, 20))

        for clave, valor in datos.items():

            elementos.append(
                Paragraph(
                    f"<b>{clave}</b>: {valor}",
                    estilos["BodyText"]
                )
            )

            elementos.append(Spacer(1, 8))

        documento.build(elementos)

        buffer.seek(0)

        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={
                "Content-Disposition":
                "attachment; filename=proyecto-fincasinred.pdf"
            }
        )

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )