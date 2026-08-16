from fastapi import FastAPI
from fastapi.responses import FileResponse

app = FastAPI(title="FincaSinRed", version="6.7")

@app.get("/")
def home():
    return FileResponse("index.html")

@app.get("/health")
def health():
    return {"status": "ok", "version": app.version}
