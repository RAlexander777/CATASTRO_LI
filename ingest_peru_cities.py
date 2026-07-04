import time
import sys
import os

sys.path.append(os.path.abspath(os.path.dirname(__file__)))

import ingest_data
import load_to_db
from sqlalchemy import text
from src.config.database import SessionLocal

# BBoxes ampliados (~5km x 5km cada uno) para maximizar datos reales descargados.
# Múltiples zonas por ciudad grande para cubrir distintos barrios.
CITIES = [
    # --- LIMA: 4 zonas distintas (centro, norte, sur, este) ---
    ("Lima Centro",          (-12.075, -77.065, -12.020, -77.010)),
    ("Lima Norte - SMP",     (-11.990, -77.075, -11.940, -77.030)),
    ("Lima Sur - VMT",       (-12.180, -76.960, -12.130, -76.920)),
    ("Lima Este - ATE",      (-12.070, -76.990, -12.020, -76.940)),

    # --- AREQUIPA: 2 zonas ---
    ("Arequipa Centro",      (-16.430, -71.570, -16.370, -71.510)),
    ("Arequipa Norte",       (-16.370, -71.560, -16.320, -71.510)),

    # --- CUSCO: 2 zonas ---
    ("Cusco Centro",         (-13.540, -72.005, -13.490, -71.955)),
    ("Cusco San Sebastián",  (-13.550, -71.960, -13.500, -71.910)),

    # --- TRUJILLO: 2 zonas ---
    ("Trujillo Centro",      (-8.130,  -79.060,  -8.080, -79.010)),
    ("Trujillo El Porvenir", (-8.090,  -79.015,  -8.050, -78.975)),

    # --- CHICLAYO ---
    ("Chiclayo",             (-6.805,  -79.870,  -6.750, -79.820)),

    # --- PIURA ---
    ("Piura",                (-5.225,  -80.660,  -5.160, -80.600)),

    # --- IQUITOS ---
    ("Iquitos",              (-3.780,  -73.290,  -3.720, -73.230)),

    # --- AREQUIPA ALTIPLANO ---
    ("Puno",                 (-15.870, -70.055, -15.800, -69.985)),
    ("Juliaca",              (-15.530, -70.170, -15.460, -70.100)),

    # --- SIERRA CENTRAL ---
    ("Huancayo",             (-12.090, -75.245, -12.040, -75.195)),
    ("Ayacucho",             (-13.185, -74.260, -13.130, -74.205)),
    ("Cusco Wanchaq",        (-13.530, -71.940, -13.490, -71.910)),

    # --- SUR ---
    ("Tacna",                (-18.040, -70.290, -17.990, -70.240)),
    ("Ica",                  (-14.095, -75.770, -14.040, -75.710)),

    # --- NORTE ---
    ("Chimbote",             (-9.100,  -78.610,  -9.050, -78.560)),
    ("Cajamarca",            (-7.185,  -78.540,  -7.130, -78.490)),
    ("Tumbes",               (-3.600,  -80.480,  -3.550, -80.430)),

    # --- SELVA ---
    ("Tarapoto",             (-6.510,  -76.390,  -6.460, -76.345)),
    ("Pucallpa",             (-8.410,  -74.580,  -8.355, -74.525)),

    # --- LATINOAMÉRICA ---
    ("Bogotá Centro",        (4.580,   -74.120,   4.630, -74.070)),
    ("Bogotá Norte",         (4.650,   -74.080,   4.700, -74.040)),
    ("Santiago Centro",      (-33.460, -70.680,  -33.410, -70.630)),
    ("Santiago Providencia", (-33.440, -70.640,  -33.410, -70.600)),
    ("Buenos Aires Centro",  (-34.625, -58.430,  -34.575, -58.370)),
    ("Buenos Aires Palermo", (-34.585, -58.440,  -34.555, -58.400)),
    ("Quito Centro",         (-0.235,  -78.530,  -0.180, -78.480)),
    ("La Paz Centro",        (-16.520, -68.160,  -16.470, -68.110)),
    ("Montevideo Centro",    (-34.920, -56.210,  -34.880, -56.160)),
    ("Medellín (Colombia)",  (6.210,   -75.600,   6.260, -75.550)),
    ("Guadalajara (México)", (20.650,  -103.400,  20.700, -103.340)),
    ("Ciudad de México",     (19.415,  -99.165,  19.460,  -99.110)),
]

def inyectar_todas_las_ciudades():
    print(f"=== INGESTA REAL AMPLIADA: {len(CITIES)} ZONAS URBANAS DE LATINOAMÉRICA ===")
    print("Solo datos reales de OpenStreetMap. Sin clones ni duplicados.\n")

    for idx, (name, bbox) in enumerate(CITIES):
        print(f"\n[{idx+1}/{len(CITIES)}] {name}  BBox={bbox}")
        try:
            ingest_data.descargar_cartografia_puno(bbox)
            time.sleep(2.5)
            load_to_db.procesar_e_inyectar_datos(accumulate=True)

            db = SessionLocal()
            total = db.execute(text("SELECT COUNT(*) FROM tg_lote;")).scalar() or 0
            db.close()
            print(f"   -> Acumulado total en DB: {total:,} parcelas reales.")

        except Exception as e:
            print(f"   -> Error en {name}: {e}. Continuando...")
            time.sleep(3.0)

    db = SessionLocal()
    total_final = db.execute(text("SELECT COUNT(*) FROM tg_lote;")).scalar() or 0
    db.close()
    print(f"\n=== INGESTA REAL FINALIZADA ===")
    print(f"Total de parcelas 100% reales en PostGIS: {total_final:,}")

if __name__ == "__main__":
    inyectar_todas_las_ciudades()
