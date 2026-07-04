# Force reload after search timer addition
import os
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from fastapi.responses import FileResponse
from sqlalchemy import text
from src.config.database import get_db, DATABASE_URL, engine, Base
from src.api.router import api_router

from src.database.models_grafico import TgLote

# Calcular rutas absolutas para servir los archivos estáticos en cualquier entorno
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(BASE_DIR, "web")

app = FastAPI(
    title="Catastro LI - Learned Index & GIS Engine",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup_event():
    print("Sincronizando el esquema de la base de datos de forma nativa...")
    Base.metadata.create_all(bind=engine)
    print("Esquema de base de datos verificado y listo.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")

@app.get("/api/status")
def read_status(db: Session = Depends(get_db)):
    db_name = DATABASE_URL.split("/")[-1].split("?")[0]
    try:
        total_lotes = db.execute(text("SELECT COUNT(*) FROM tg_lote;")).scalar()
    except Exception:
        total_lotes = 0

    return {
        "status": "online",
        "database": db_name,
        "total_records": f"{total_lotes:,} parcelas urbanas"
    }

@app.get("/", response_class=FileResponse)
def serve_intro():
    return os.path.join(WEB_DIR, "index.html")

@app.get("/visor", response_class=FileResponse)
def serve_map():
    #Mapa Leaflet
    return os.path.join(WEB_DIR, "mapa.html")

app.mount("/css", StaticFiles(directory=os.path.join(WEB_DIR, "css")), name="css")
app.mount("/js", StaticFiles(directory=os.path.join(WEB_DIR, "js")), name="js")