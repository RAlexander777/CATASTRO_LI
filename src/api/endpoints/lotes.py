from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from src.config.database import get_db

router = APIRouter()

@router.get("/")
def obtener_capa_lotes(db: Session = Depends(get_db)):
    """
    Genera un FeatureCollection en formato GeoJSON directo desde PostGIS.
    Reproyecta en tiempo real de UTM 19S (32719) a WGS84 (4326) para Leaflet.
    """
    query = text("""
        SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', json_agg(ST_AsGeoJSON(t.*)::json)
        )
        FROM (
            SELECT 
                id_lote,
                area_grafica,
                peri_grafico,
                ST_Transform(objcad_lote_gemo, 4326) AS geom
            FROM tg_lote
            LIMIT 1000  -- Ajustamos a 1000 polígonos para una carga inicial fluida
        ) AS t;
    """)
    
    result = db.execute(query).scalar()
    
    if not result or result.get('features') is None:
        return {"type": "FeatureCollection", "features": []}
        
    return result