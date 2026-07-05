# -*- coding: utf-8 -*-
"""
Evaluador de Desempeño: R-Tree (GiST) vs Learned Index (Hilbert + PGM-Index)
Gestiona la carga de datos, transformación, ordenamiento espacial y estadísticas de velocidad.
"""

import time
from sqlalchemy import text
from sqlalchemy.orm import Session
from src.core.hilbert import HilbertSorter
from src.core.pgm.pgm_index import PGMIndex

class PGMEvaluator:
    _instance = None

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super(PGMEvaluator, cls).__new__(cls, *args, **kwargs)
            cls._instance.initialized = False
            cls._instance.lotes = []
            cls._instance.sorted_keys = []
            cls._instance.sorter = None
            cls._instance.index = None
            cls._instance.training_time_s = 0.0
        return cls._instance

    def initialize(self, db: Session):
        if self.initialized:
            return
            
        print("Iniciando entrenamiento del PGM-Index sobre Catastro Gráfico...")
        start_time = time.perf_counter()
        
        # 1. Recuperar todos los lotes urbanos con sus centroides proyectados (UTM 19S / SRID 32719)
        query = text("""
            SELECT 
                id_lote,
                ST_X(ST_Centroid(objcad_lote_gemo)) AS utm_x,
                ST_Y(ST_Centroid(objcad_lote_gemo)) AS utm_y,
                area_grafica,
                peri_grafico
            FROM tg_lote
            WHERE objcad_lote_gemo IS NOT NULL;
        """)
        results = db.execute(query).all()
        
        if not results:
            print("Base de datos sin registros. PGM-Index no entrenado.")
            return
            
        coords = [(r.utm_x, r.utm_y) for r in results]
        
        # 2. Inicializar Sorter de Hilbert y mapear centroides 2D a claves 1D
        self.sorter = HilbertSorter(coords, order=24)
        
        lotes_with_keys = []
        for r in results:
            h_key = self.sorter.to_hilbert(r.utm_x, r.utm_y)
            lotes_with_keys.append((h_key, {
                "id_lote": r.id_lote,
                "utm_x": r.utm_x,
                "utm_y": r.utm_y,
                "area_grafica": r.area_grafica,
                "peri_grafico": r.peri_grafico
            }))
            
        # 3. Ordenar físicamente por la clave continua de Hilbert (vecindad espacial preservada)
        lotes_with_keys.sort(key=lambda x: x[0])
        
        self.sorted_keys = [item[0] for item in lotes_with_keys]
        self.lotes = [item[1] for item in lotes_with_keys]
        
        # 4. Construir modelo predictivo PGM-Index
        self.epsilon = 4
        self.index = PGMIndex(self.sorted_keys, epsilon=self.epsilon)
        
        self.training_time_s = time.perf_counter() - start_time
        self.initialized = True
        print(f"¡PGM-Index entrenado exitosamente! "
              f"Segmentos: {len(self.index.segments)}, Elementos: {len(self.lotes)}, "
              f"Tiempo de entrenamiento: {self.training_time_s:.4f}s.")

    def search_pgm_only(self, lat: float, lon: float, db: Session) -> dict:
        """
        Pipeline puro del PGM-Index: solo proyección → Hilbert → predicción → búsqueda binaria.
        NO ejecuta ninguna consulta GiST/R-Tree, ni el SELECT final de geometría,
        ni el lookup de ciudad. Sirve para benchmarks justos donde se quiere aislar
        el coste del PGM frente al coste del R-Tree.
        """
        if not self.initialized:
            self.initialize(db)

        if not self.lotes or not self.index:
            return None

        proj_query = text("""
            SELECT
                ST_X(ST_Transform(ST_SetSRID(ST_Point(:lon, :lat), 4326), 32719)) AS utm_x,
                ST_Y(ST_Transform(ST_SetSRID(ST_Point(:lon, :lat), 4326), 32719)) AS utm_y;
        """)
        proj_res = db.execute(proj_query, {"lat": lat, "lon": lon}).first()
        if not proj_res or proj_res.utm_x is None:
            return None

        utm_x = proj_res.utm_x
        utm_y = proj_res.utm_y

        h_key = self.sorter.to_hilbert(utm_x, utm_y)

        start_search = time.perf_counter()

        low, high = self.index.search_range(h_key)

        found_idx = -1
        binary_steps = 0
        l = low
        r = high
        while l <= r:
            binary_steps += 1
            mid = (l + r) // 2
            mid_key = self.sorted_keys[mid]
            if mid_key == h_key:
                found_idx = mid
                break
            elif mid_key < h_key:
                l = mid + 1
            else:
                r = mid - 1

        if found_idx == -1:
            closest_idx = low
            min_diff = abs(self.sorted_keys[low] - h_key)
            for idx in range(low + 1, high + 1):
                diff = abs(self.sorted_keys[idx] - h_key)
                if diff < min_diff:
                    min_diff = diff
                    closest_idx = idx
            found_idx = closest_idx

        search_time_ms = (time.perf_counter() - start_search) * 1000

        seg_info = self.index.get_segment(h_key) or {}

        return {
            "hilbert_key": h_key,
            "found_idx": int(found_idx),
            "search_time_ms": round(search_time_ms, 4),
            "binary_steps": binary_steps,
            "segment": {
                "segment_index": seg_info.get("segment_index"),
                "segment_key": seg_info.get("segment_key"),
                "segment_next_key": seg_info.get("segment_next_key"),
                "slope": seg_info.get("slope"),
                "intercept": seg_info.get("intercept"),
                "points_count": seg_info.get("points_count"),
                "predicted_position": seg_info.get("predicted_position"),
            },
        }

    def query(self, lat: float, lon: float, db: Session):
        """
        Consulta espacial de geolocalización.
        Compara R-Tree nativo (GiST) con la predicción de Learned Index.
        """
        if not self.initialized:
            self.initialize(db)
            
        if not self.lotes or not self.index:
            return None
            
        # 1. Proyectar (lat, lon) geográficas a UTM 19S (m) usando PostGIS
        proj_query = text("""
            SELECT 
                ST_X(ST_Transform(ST_SetSRID(ST_Point(:lon, :lat), 4326), 32719)) AS utm_x,
                ST_Y(ST_Transform(ST_SetSRID(ST_Point(:lon, :lat), 4326), 32719)) AS utm_y;
        """)
        proj_res = db.execute(proj_query, {"lat": lat, "lon": lon}).first()
        if not proj_res or proj_res.utm_x is None:
            return None
            
        utm_x = proj_res.utm_x
        utm_y = proj_res.utm_y
        
        # 2. Traducir coordenadas UTM a clave Hilbert 1D
        h_key = self.sorter.to_hilbert(utm_x, utm_y)
        
        # Medición temporal: Learned Index
        start_search = time.perf_counter()
        
        # 3. Predicción PGM-Index
        low, high = self.index.search_range(h_key)
        
        # 4. Búsqueda local binaria en el rango acotado por epsilon
        found_idx = -1
        binary_steps = 0
        l = low
        r = high
        while l <= r:
            binary_steps += 1
            mid = (l + r) // 2
            mid_key = self.sorted_keys[mid]
            
            if mid_key == h_key:
                found_idx = mid
                break
            elif mid_key < h_key:
                l = mid + 1
            else:
                r = mid - 1
                
        # En caso de no caer exactamente sobre un nodo (aproximación espacial),
        # seleccionamos la clave Hilbert más próxima dentro del vecindario indexado.
        if found_idx == -1:
            closest_idx = low
            min_diff = abs(self.sorted_keys[low] - h_key)
            for idx in range(low + 1, high + 1):
                diff = abs(self.sorted_keys[idx] - h_key)
                if diff < min_diff:
                    min_diff = diff
                    closest_idx = idx
            found_idx = closest_idx
            
        search_time_ms = (time.perf_counter() - start_search) * 1000
        
        # Recuperar el lote aproximado
        lote_candidate = self.lotes[found_idx]
        
        # 5. Medición temporal: R-Tree Nativo (PostgreSQL GiST)
        start_rtree = time.perf_counter()
        rtree_query = text("""
            SELECT id_lote
            FROM tg_lote
            WHERE objcad_lote_gemo && ST_Transform(ST_SetSRID(ST_Point(:lon, :lat), 4326), 32719)
            LIMIT 1;
        """)
        db.execute(rtree_query, {"lat": lat, "lon": lon}).first()
        rtree_time_ms = (time.perf_counter() - start_rtree) * 1000
        
        # Obtener los datos vectoriales completos para el front-end
        final_query = text("""
            SELECT 
                id_lote,
                area_grafica,
                peri_grafico,
                ST_AsGeoJSON(ST_Transform(objcad_lote_gemo, 4326))::json AS geom,
                ST_X(ST_Centroid(ST_Transform(objcad_lote_gemo, 4326))) AS lon,
                ST_Y(ST_Centroid(ST_Transform(objcad_lote_gemo, 4326))) AS lat
            FROM tg_lote
            WHERE id_lote = :id_lote;
        """)
        lote_db = db.execute(final_query, {"id_lote": lote_candidate["id_lote"]}).first()
        
        if not lote_db:
            return None
            
        # Obtener ciudad
        from src.api.endpoints.lotes import obtener_ciudad_lote
        ciudad = obtener_ciudad_lote(lote_db.id_lote, lote_db.lat, lote_db.lon, db)
        
        # Relación de velocidad
        speedup = rtree_time_ms / (search_time_ms or 0.0001)

        # Detalles del segmento del PGM en el que se inspeccionó la clave
        # (útil para depuración / visualizador — qué regresión se aplicó)
        seg_info = self.index.get_segment(h_key) or {}

        return {
            "lote": {
                "id_lote": lote_db.id_lote,
                "area_grafica": float(lote_db.area_grafica) if lote_db.area_grafica is not None else None,
                "peri_grafico": float(lote_db.peri_grafico) if lote_db.peri_grafico is not None else None,
                "geom": lote_db.geom,
                "center": {"lat": lote_db.lat, "lon": lote_db.lon},
                "ciudad": ciudad
            },
            "stats": {
                "hilbert_key": h_key,
                "pgm_predicted_index": self.index.search(h_key),
                "pgm_search_range": [int(low), int(high)],
                "binary_steps": binary_steps,
                "segments_count": len(self.index.segments),
                "epsilon": self.epsilon,
                "learned_search_time_ms": round(search_time_ms, 4),
                "rtree_search_time_ms": round(rtree_time_ms, 4),
                "speedup_ratio": round(speedup, 2),
                # Detalles del segmento donde cayó la consulta
                "segment": {
                    "segment_index": seg_info.get("segment_index"),
                    "segment_key": seg_info.get("segment_key"),
                    "segment_next_key": seg_info.get("segment_next_key"),
                    "slope": seg_info.get("slope"),
                    "intercept": seg_info.get("intercept"),
                    "points_count": seg_info.get("points_count"),
                    "predicted_position": seg_info.get("predicted_position"),
                    "actual_position": int(found_idx),
                }
            }
        }

# Instancia Singleton compartida
evaluator = PGMEvaluator()
