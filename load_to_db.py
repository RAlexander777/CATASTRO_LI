import json
from shapely.geometry import Polygon
from sqlalchemy.orm import Session
from geoalchemy2.shape import from_shape
from datetime import date
from src.config.database import SessionLocal, engine
from src.database.models_grafico import TgLote

def procesar_e_inyectar_datos():
    # 1. Leer el archivo JSON crudo
    with open("puno_raw_data.json", "r", encoding="utf-8") as f:
        raw_data = json.load(f)
    
    elements = raw_data.get("elements", [])
    
    # Crear un mapa rápido de nodos para reconstrucir las geometrías de las vías
    nodos = {e["id"]: (e["lon"], e["lat"]) for e in elements if e["type"] == "node"}
    vias = [e for e in elements if e["type"] == "way"]
    
    db: Session = SessionLocal()
    print(f"Procesando {len(vias)} polígonos potenciales para PostGIS...")
    
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
            
            # Generar un ID de lote simulado respetando la longitud de la estructura oficial (14 caracteres)
            id_simulado = f"21010101{idx+1:06d}" 
            
            # Instanciar el modelo ORM. 
            # PostGIS se encargará de reproyectar internamente de 4326 a 32719 usando ST_Transform
            lote_gis = TgLote(
                id_lote=id_simulado,
                area_grafica=None,  # Se puede calcular post-inserción mediante base de datos
                peri_grafico=None,
                fech_actua=date.today(),
                # Inyectamos indicando explícitamente que los datos de entrada vienen en SRID 4326
                objcad_lote_gemo=from_shape(poligono_wgs84, srid=4326)
            )
            
            db.add(lote_gis)
            contador += 1
            
        db.commit()
        print(f"Inyección finalizada con éxito. Se insertaron {contador} lotes urbanos en 'tg_lote'.")
        
        # Ejecutar script SQL nativo para forzar la conversión formal a UTM 19S (SRID 32719) y calcular áreas
        print("Reproyectando geometrías al estándar métrico oficial UTM 19S (SRID 32719)...")
        with engine.begin() as connection:
            connection.execute("""
                ALTER TABLE tg_lote 
                ALTER COLUMN objcad_lote_gemo 
                TYPE geometry(Polygon, 32719) 
                USING ST_Transform(objcad_lote_gemo, 32719);
                
                UPDATE tg_lote 
                SET area_grafica = ST_Area(objcad_lote_gemo),
                    peri_grafico = ST_Perimeter(objcad_lote_gemo);
            """)
        print("Cálculo de áreas y perímetros vectoriales completado.")
        
    except Exception as e:
        db.rollback()
        print(f"Error crítico durante la migración de datos: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    procesar_e_inyectar_datos()