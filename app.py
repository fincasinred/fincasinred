from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.responses import FileResponse

import os
import json
import zlib
import base64
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
                    "price": "price_1U5rSq1xCi4MDD5SLwMswGrO",
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
