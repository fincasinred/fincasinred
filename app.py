from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.responses import FileResponse

import os

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

                    "price": "TU_PRICE_ID",

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
