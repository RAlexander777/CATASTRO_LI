import datetime
from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import text
from src.config.database import get_db
import ingest_data
import load_to_db

router = APIRouter()

# Estado global de la sincronización en memoria
sync_status = {
    "status": "idle",  # "idle", "running", "success", "failed"
    "message": "Listo para iniciar ingesta.",
    "count": 0,
    "last_run": None
}

class ReloadRequest(BaseModel):
    min_lat: float = Field(-15.850, description="Latitud mínima")
    min_lon: float = Field(-70.040, description="Longitud mínima")
    max_lat: float = Field(-15.820, description="Latitud máxima")
    max_lon: float = Field(-69.995, description="Longitud máxima")
    accumulate: bool = Field(False, description="Acumular datos sin limpiar la base de datos")

def ejecutar_sincronizacion_background(bbox: tuple, accumulate: bool = False):
    global sync_status
    sync_status["status"] = "running"
    sync_status["message"] = "Descargando datos vectoriales de OpenStreetMap..."
    sync_status["count"] = 0
    try:
        # 1. Ingesta de datos
        ingest_data.descargar_cartografia_puno(bbox)
        
        # 2. Carga y procesamiento en DB
        sync_status["message"] = "Procesando, transformando e inyectando polígonos en PostGIS..."
        load_to_db.procesar_e_inyectar_datos(accumulate=accumulate)
        
        # Obtener recuento de la base de datos
        from src.config.database import SessionLocal
        db = SessionLocal()
        try:
            total = db.execute(text("SELECT COUNT(*) FROM tg_lote;")).scalar() or 0
        finally:
            db.close()
            
        sync_status["status"] = "success"
        sync_status["message"] = f"Sincronización completada. Se inyectaron {total} parcelas en el catastro gráfico."
        sync_status["count"] = total
        sync_status["last_run"] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
    except Exception as e:
        sync_status["status"] = "failed"
        sync_status["message"] = f"Fallo en la sincronización: {str(e)}"

@router.get("/")
def obtener_capa_lotes(
    min_lat: float = None,
    min_lon: float = None,
    max_lat: float = None,
    max_lon: float = None,
    zoom: int = None,
    db: Session = Depends(get_db)
):
    """
    Genera un FeatureCollection en formato GeoJSON directo desde PostGIS.
    Aplica filtro por Viewport (BBox) y simplificación dinámica basada en el Zoom.
    """
    bbox_filter = ""
    params = {}
    
    if all(v is not None for v in [min_lat, min_lon, max_lat, max_lon]):
        bbox_filter = """
            AND objcad_lote_gemo && ST_Transform(
                ST_MakeEnvelope(:min_lon, :min_lat, :max_lon, :max_lat, 4326), 
                32719
            )
        """
        params.update({
            "min_lat": min_lat,
            "min_lon": min_lon,
            "max_lat": max_lat,
            "max_lon": max_lon
        })
        
    # Calcular tolerancia de simplificación en metros (SRID 32719 usa metros)
    # A menor zoom (vista alejada), simplificamos más para reducir peso de red y renderizado
    tolerance = 0.0
    if zoom is not None:
        if zoom <= 14:
            tolerance = 4.0
        elif zoom == 15:
            tolerance = 1.8
        elif zoom == 16:
            tolerance = 0.7
        elif zoom == 17:
            tolerance = 0.2
        else:
            tolerance = 0.0
            
    geom_select = "ST_Transform(objcad_lote_gemo, 4326) AS geom"
    if tolerance > 0.0:
        geom_select = f"ST_Transform(ST_SimplifyPreserveTopology(objcad_lote_gemo, {tolerance}), 4326) AS geom"
        
    query = text(f"""
        SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', coalesce(json_agg(ST_AsGeoJSON(t, 'geom')::json), '[]'::json)
        )
        FROM (
            SELECT 
                id_lote,
                area_grafica,
                peri_grafico,
                {geom_select}
            FROM tg_lote
            WHERE objcad_lote_gemo IS NOT NULL
            {bbox_filter}
            LIMIT 2500  -- Límite de seguridad para evitar sobrecarga en el navegador
        ) AS t;
    """)
    
    result = db.execute(query, params).scalar()
    
    if not result or result.get('features') is None:
        return {"type": "FeatureCollection", "features": []}
        
    return result

@router.post("/reload")
def reload_lotes(request: ReloadRequest, background_tasks: BackgroundTasks):
    """
    Inicia un hilo en segundo plano para descargar y procesar datos espaciales.
    """
    global sync_status
    if sync_status["status"] == "running":
        raise HTTPException(status_code=400, detail="Ya hay una sincronización de datos en curso.")
        
    bbox = (request.min_lat, request.min_lon, request.max_lat, request.max_lon)
    background_tasks.add_task(ejecutar_sincronizacion_background, bbox, request.accumulate)
    return {"message": "Sincronización iniciada en segundo plano.", "status": "running"}

@router.get("/sync-status")
def obtener_estado_sincronizacion():
    """
    Retorna el estado actual de la ingesta en segundo plano.
    """
    global sync_status
    return sync_status