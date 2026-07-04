import json
from shapely.geometry import Polygon
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from geoalchemy2.shape import from_shape
from datetime import date
from src.config.database import SessionLocal, engine
from src.database.models_grafico import TgLote

def procesar_e_inyectar_datos(accumulate=False):
    # 1. Leer el archivo JSON crudo
    with open("puno_raw_data.json", "r", encoding="utf-8") as f:
        raw_data = json.load(f)
    
    elements = raw_data.get("elements", [])
    
    # Crear un mapa rápido de nodos para reconstruir las geometrías de las vías
    nodos = {e["id"]: (e["lon"], e["lat"]) for e in elements if e["type"] == "node"}
    vias = [e for e in elements if e["type"] == "way"]
    
    db: Session = SessionLocal()
    
    # Truncar la tabla solo si no queremos acumular datos
    if not accumulate:
        try:
            print("Limpiando registros previos en la tabla 'tg_lote'...")
            db.execute(text("TRUNCATE TABLE tg_lote CASCADE;"))
            db.commit()
        except Exception as e:
            db.rollback()
            print(f"Advertencia al limpiar la tabla: {e}")
            
    # Obtener el conteo actual de lotes en la base de datos para compensar IDs únicos
    conteo_actual = 0
    try:
        conteo_actual = db.execute(text("SELECT COUNT(*) FROM tg_lote;")).scalar() or 0
    except Exception as e:
        print(f"Advertencia al leer conteo de registros: {e}")
        
    print(f"Procesando {len(vias)} polígonos potenciales para PostGIS (conteo actual: {conteo_actual})...")
    
    contador = 0
    try:
        for idx, via in enumerate(vias):
            node_ids = via.get("nodes", [])
            if len(node_ids) < 3:
                continue  # Un polígono requiere mínimo 3 puntos
                
            # Reconstruir las coordenadas del anillo externo
            coords = [nodos[n_id] for n_id in node_ids if n_id in nodos]
            
            # Asegurar que el polígono esté cerrado (primer y último punto idénticos)
            if len(coords) < 3:
                continue
            if coords[0] != coords[-1]:
                coords.append(coords[0])
                
            # Crear figura usando Shapely (Coordenadas nativas: WGS84 - SRID 4326)
            poligono_wgs84 = Polygon(coords)
            
            # Generar un ID de lote simulado único e incremental
            id_simulado = f"21010101{conteo_actual + idx + 1:06d}" 
            
            # Definir la geometría reproyectada a UTM 19S (SRID 32719) usando ST_Transform de PostGIS
            geom_utm = func.ST_Transform(from_shape(poligono_wgs84, srid=4326), 32719)
            
            # Instanciar el modelo ORM.
            # Calculamos área y perímetro directamente en PostGIS durante la inserción.
            lote_gis = TgLote(
                id_lote=id_simulado,
                area_grafica=func.ST_Area(geom_utm),
                peri_grafico=func.ST_Perimeter(geom_utm),
                fech_actua=date.today(),
                objcad_lote_gemo=geom_utm
            )
            
            db.add(lote_gis)
            contador += 1
            
        db.commit()
        print(f"Inyección finalizada con éxito. Se insertaron {contador} lotes urbanos en 'tg_lote'.")
        
    except Exception as e:
        db.rollback()
        print(f"Error crítico durante la migración de datos: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    procesar_e_inyectar_datos()