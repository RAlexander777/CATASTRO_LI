import time
import sys
import os

# Asegurar que el path del proyecto está disponible
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

import ingest_data
import load_to_db
from sqlalchemy import text
from src.config.database import SessionLocal

CITIES = [
    ("Trujillo", (-8.125, -79.050, -8.095, -79.010)),
    ("Chiclayo", (-6.790, -79.860, -6.760, -79.820)),
    ("Piura", (-5.210, -80.650, -5.180, -80.610)),
    ("Huancayo", (-12.080, -75.230, -12.050, -75.190)),
    ("Iquitos", (-3.765, -73.270, -3.730, -73.235)),
    ("Chimbote", (-9.090, -78.600, -9.060, -78.560)),
    ("Tacna", (-18.030, -70.270, -18.000, -70.230)),
    ("Juliaca", (-15.510, -70.150, -15.480, -70.110)),
    ("Ica", (-14.080, -75.750, -14.050, -75.720)),
    ("Pucallpa", (-8.400, -74.570, -8.365, -74.530)),
    ("Cajamarca", (-7.175, -78.530, -7.145, -78.490)),
    ("Ayacucho", (-13.175, -74.240, -13.145, -74.210)),
    ("Tarapoto", (-6.500, -76.380, -6.470, -76.350)),
    ("Tumbes", (-3.585, -80.470, -3.555, -80.430)),
    ("Lima Centro Ampliado", (-12.065, -77.055, -12.025, -77.015))
]

def inyectar_todas_las_ciudades():
    print("=== INICIANDO PIPELINE DE IMPORTACIÓN ESPACIAL PERÚ ===")
    db = SessionLocal()
    conteo_inicial = db.execute(text("SELECT COUNT(*) FROM tg_lote;")).scalar() or 0
    db.close()
    print(f"Estado inicial de la base de datos: {conteo_inicial} parcelas registradas.")
    
    for idx, (name, bbox) in enumerate(CITIES):
        print(f"\n[{idx+1}/{len(CITIES)}] Procesando {name} (BBox: {bbox})...")
        try:
            # Descargar datos
            ingest_data.descargar_cartografia_puno(bbox)
            
            # Pausa para evitar rate limits en Overpass API
            print("Esperando 6 segundos antes de procesar y llamar al servidor de nuevo...")
            time.sleep(6)
            
            # Inyectar en base de datos
            load_to_db.procesar_e_inyectar_datos(accumulate=True)
            
            # Consultar cantidad actual
            db = SessionLocal()
            conteo_actual = db.execute(text("SELECT COUNT(*) FROM tg_lote;")).scalar() or 0
            db.close()
            print(f"-> {name} procesado correctamente. Total acumulado en DB: {conteo_actual} parcelas.")
            
        except Exception as e:
            print(f"Error procesando {name}: {e}")
            print("Continuando con la siguiente ciudad en la cola...")
            time.sleep(5)
            
    db = SessionLocal()
    conteo_final = db.execute(text("SELECT COUNT(*) FROM tg_lote;")).scalar() or 0
    db.close()
    print(f"\n=== MIGRACIÓN FINALIZADA ===")
    print(f"Total de parcelas agregadas: {conteo_final - conteo_inicial}")
    print(f"Total final en base de datos: {conteo_final} parcelas.")

if __name__ == "__main__":
    inyectar_todas_las_ciudades()
