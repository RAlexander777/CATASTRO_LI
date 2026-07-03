from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import text
from src.config.database import get_db, DATABASE_URL
from src.api.router import api_router

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

app.include_router(api_router, prefix="/api")

@app.get("/api/status")
def read_status(db: Session = Depends(get_db)):
    """
    Devuelve las métricas operativas del motor y la base de datos para la Landing Page.
    """
    # Extraer de forma segura el nombre de la BD desde la cadena de conexión URL
    db_name = DATABASE_URL.split("/")[-1].split("?")[0]
    
    # Contar registros inyectados en la tabla gráfica catastral
    try:
        total_lotes = db.execute(text("SELECT COUNT(*) FROM tg_lote;")).scalar()
    except Exception:
        total_lotes = 0

    return {
        "status": "online",
        "database": db_name,
        "total_records": f"{total_lotes:,} parcelas urbanas"
    }

app.mount("/mapa", StaticFiles(directory="/app/src/web", html=True), name="web")