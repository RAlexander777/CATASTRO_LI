import json
import random
from shapely.geometry import Polygon
from shapely.affinity import rotate, scale
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from geoalchemy2.shape import from_shape
from datetime import date
from src.config.database import SessionLocal
from src.database.models_grafico import TgLote

def run_pipeline():
    print("=== PIPELINE PROCEDURAL OFFLINE DE CATASTRO NACIONAL (18 CIUDADES) ===")
    
    # 1. Leer el archivo JSON crudo de Puno (nuestro set de datos semilla de 3.1 MB)
    with open("puno_raw_data.json", "r", encoding="utf-8") as f:
        raw_data = json.load(f)
    
    elements = raw_data.get("elements", [])
    nodos_base = {e["id"]: (e["lon"], e["lat"]) for e in elements if e["type"] == "node"}
    vias_base = [e for e in elements if e["type"] == "way"]
    
    print(f"Set semilla cargado: {len(vias_base)} polígonos base.")
    
    # Coordenadas geográficas centralizadas para cada una de las 18 ciudades
    ciudades_coords = {
        "puno": (-15.8402, -70.0219),
        "arequipa": (-16.400, -71.537),
        "cusco": (-13.518, -71.978),
        "lima": (-12.046, -77.035),
        "trujillo": (-8.110, -79.030),
        "chiclayo": (-6.775, -79.840),
        "piura": (-5.195, -80.630),
        "iquitos": (-3.748, -73.250),
        "pucallpa": (-8.382, -74.550),
        "ayacucho": (-13.160, -74.225),
        "huancayo": (-12.060, -75.210),
        "chimbote": (-9.075, -78.580),
        "tacna": (-18.015, -70.250),
        "juliaca": (-15.495, -70.130),
        "ica": (-14.065, -75.735),
        "cajamarca": (-7.160, -78.510),
        "tarapoto": (-6.485, -76.365),
        "tumbes": (-3.570, -80.450)
    }
    
    # El centroide aproximado de la cartografía base (Puno)
    puno_base_lat = -15.835
    puno_base_lon = -70.015
    
    db = SessionLocal()
    contador_total = 0
    
    print("Iniciando generación procedural offline por ciudad...")
    
    city_idx = 0
    for ciudad_nombre, (target_lat, target_lon) in ciudades_coords.items():
        # Desplazamiento delta para trasladar a esta ciudad
        d_lat = target_lat - puno_base_lat
        d_lon = target_lon - puno_base_lon
        
        contador_ciudad = 0
        
        for idx, via in enumerate(vias_base):
            node_ids = via.get("nodes", [])
            if len(node_ids) < 3:
                continue
                
            # Reconstruir las coordenadas desplazadas y cerradas
            coords = []
            for n_id in node_ids:
                if n_id in nodos_base:
                    lon_base, lat_base = nodos_base[n_id]
                    # Traslación geográfica
                    coords.append((lon_base + d_lon, lat_base + d_lat))
            
            if len(coords) < 3:
                continue
            if coords[0] != coords[-1]:
                coords.append(coords[0])
                
            # --- PROCEDIMIENTO DE VARIACIÓN CARTOGRÁFICA ---
            # Queremos que cada ciudad tenga un trazado y orientación urbana único
            # Usamos hashes deterministas basados en el índice del lote y de la ciudad para evitar aleatoriedad volátil
            poligono = Polygon(coords)
            
            # 1. Rotación alrededor del centroide
            rot_angle = ((idx * 29 + city_idx * 17) % 120) - 60  # Rotación entre -60° y +60°
            poligono = rotate(poligono, rot_angle, origin='centroid')
            
            # 2. Escalamiento (variar tamaños de lotes por ciudad)
            scale_fact = 0.82 + ((idx * 13 + city_idx * 31) % 35) / 100.0  # Escala entre 0.82 y 1.17
            poligono = scale(poligono, scale_fact, scale_fact, origin='centroid')
            
            # 3. Filtrar de forma determinista para que la densidad urbana varíe
            # Por ejemplo, Cusco es más denso, Lima es gigante, Tacna tiene menos parcelas
            density_threshold = 85 if ciudad_nombre in ["lima", "arequipa", "cusco", "puno"] else 60
            if (idx * 23 + city_idx * 47) % 100 > density_threshold:
                continue
                
            # Generar ID de lote catastral incremental de 14 caracteres único
            lote_id_num = city_idx * 5000 + contador_ciudad + 1
            id_simulado = f"21010101{lote_id_num:06d}"
            
            # Reproyectar a SRID oficial UTM 19S (32719)
            geom_utm = func.ST_Transform(from_shape(poligono, srid=4326), 32719)
            
            lote_gis = TgLote(
                id_lote=id_simulado,
                area_grafica=func.ST_Area(geom_utm),
                peri_grafico=func.ST_Perimeter(geom_utm),
                fech_actua=date.today(),
                objcad_lote_gemo=geom_utm
            )
            db.add(lote_gis)
            contador_ciudad += 1
            contador_total += 1
            
            # Flush periódico para evitar sobrecarga en memoria
            if contador_ciudad % 800 == 0:
                db.flush()
                
        db.commit()
        print(f"-> {ciudad_nombre.upper()} poblado con {contador_ciudad} lotes ÚNICOS procedurales.")
        city_idx += 1
        
    db.close()
    print(f"\n=== MIGRACIÓN PROCEDURAL OFFLINE FINALIZADA ===")
    print(f"Se inyectaron {contador_total} lotes originales de alta diversidad en 18 ciudades.")

if __name__ == "__main__":
    run_pipeline()
