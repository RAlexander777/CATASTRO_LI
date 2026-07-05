# -*- coding: utf-8 -*-
"""
Endpoints de Búsqueda Analítica y Comparativa de Índices
Expone consultas espaciales basadas en el modelo Learned Index (PGM-Index) y reentrenamiento manual.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from src.config.database import get_db
from src.core.pgm.evaluator import evaluator

router = APIRouter()

@router.get("/rtree")
def consultar_rtree_nativo(lat: float, lon: float, db: Session = Depends(get_db)):
    """
    Ejecuta una consulta de geolocalización utilizando únicamente el R-Tree nativo (GiST) de PostGIS.
    """
    try:
        import time
        # Medir la búsqueda espacial COMPLETA: índice GiST + recuperación de datos
        start_time = time.perf_counter()
        query = text("""
            SELECT 
                id_lote,
                area_grafica,
                peri_grafico,
                ST_AsGeoJSON(ST_Transform(objcad_lote_gemo, 4326))::json AS geom,
                ST_X(ST_Centroid(ST_Transform(objcad_lote_gemo, 4326))) AS lon,
                ST_Y(ST_Centroid(ST_Transform(objcad_lote_gemo, 4326))) AS lat
            FROM tg_lote 
            WHERE objcad_lote_gemo && ST_Transform(ST_SetSRID(ST_Point(:lon, :lat), 4326), 32719)
            LIMIT 1;
        """)
        result = db.execute(query, {"lat": lat, "lon": lon}).first()
        elapsed_time_ms = (time.perf_counter() - start_time) * 1000
        
        if not result:
            raise HTTPException(status_code=404, detail="Coordenadas fuera del área urbana o sin lotes.")
        
        from src.api.endpoints.lotes import obtener_ciudad_lote
        ciudad = obtener_ciudad_lote(result.id_lote, result.lat, result.lon, db)
        
        return {
            "lote": {
                "id_lote": result.id_lote,
                "area_grafica": float(result.area_grafica) if result.area_grafica is not None else None,
                "peri_grafico": float(result.peri_grafico) if result.peri_grafico is not None else None,
                "geom": result.geom,
                "center": {"lat": result.lat, "lon": result.lon},
                "ciudad": ciudad
            },
            "stats": {
                "rtree_search_time_ms": round(elapsed_time_ms, 4)
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en R-Tree: {str(e)}")

@router.get("/learned")
def consultar_learned_index(lat: float, lon: float, db: Session = Depends(get_db)):
    """
    Ejecuta una consulta de geolocalización por Learned Index.
    Mapea la coordenada a Hilbert 1D, predice la dirección en PGM-Index y compara contra PostGIS GiST.
    Devuelve también los detalles del segmento del PGM que se usó (slope, intercept,
    puntos en el segmento, predicción vs posición real) para depuración.
    """
    try:
        res = evaluator.query(lat, lon, db)
        if not res:
            raise HTTPException(status_code=404, detail="Coordenadas fuera del área urbana indexada o sin lotes.")
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en el motor de consulta: {str(e)}")

@router.post("/retrain")
def reentrenar_pgm_index(db: Session = Depends(get_db)):
    """
    Fuerza la reconstrucción completa del PGM-Index a partir de los datos actuales de la DB.
    """
    try:
        evaluator.initialized = False
        evaluator.initialize(db)
        return {
            "status": "success",
            "message": "Modelo PGM-Index reentrenado con éxito.",
            "segments_count": len(evaluator.index.segments) if evaluator.index else 0,
            "elements_count": len(evaluator.lotes),
            "training_time_seconds": round(evaluator.training_time_s, 4)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Fallo al entrenar el Learned Index: {str(e)}")