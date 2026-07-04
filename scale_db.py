import sys
import os
from sqlalchemy import text
from src.config.database import SessionLocal

def duplicar_datos_local():
    print("=== PIPELINE DE ESCALAMIENTO GEOGRÁFICO LOCAL DE CATASTRO ===")
    db = SessionLocal()
    
    # Limpiar clones previos para arrancar limpio
    print("Limpiando clones previos...")
    db.execute(text("DELETE FROM tg_lote WHERE SUBSTR(id_lote, 1, 1) != '2';"))
    db.commit()
    
    # Obtener conteo inicial
    conteo_inicial = db.execute(text("SELECT COUNT(*) FROM tg_lote;")).scalar() or 0
    print(f"Registros originales en la base de datos: {conteo_inicial}")
    
    if conteo_inicial == 0:
        print("La base de datos está vacía. Ingeste datos primero.")
        db.close()
        return

    # Usar caracteres alfanuméricos únicos como prefijo para evitar colisiones
    chars = "013456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
    
    # Generar 6 clones locales (multiplicará por 7 el tamaño de la base de datos)
    # Total de lotes esperado: ~73,355 * 7 = ~513,485 lotes distribuidos LOCALMENTE en sus ciudades reales.
    clones_count = 6
    
    print(f"Iniciando inyección de {clones_count} clones locales por ciudad...")
    
    for idx in range(clones_count):
        prefix = chars[idx]
        
        # Calcular desplazamientos locales en grados (WGS84)
        # Esto crea una grilla de expansión local (distritos/sectores colindantes en cada ciudad)
        row = idx // 8
        col = idx % 8
        
        # Separación aproximada de 1.5km a 2.5km por sector
        offset_lon = (col - 3.5) * 0.022
        offset_lat = (row - 2.5) * 0.018
        
        try:
            # Query SQL de traducción local: mantiene cada lote en su respectiva ciudad de origen (Puno, Lima, Cusco, etc.)
            query = text(f"""
                INSERT INTO tg_lote (id_lote, area_grafica, peri_grafico, fech_actua, objcad_lote_gemo)
                SELECT 
                    '{prefix}' || SUBSTR(id_lote, 2) AS new_id,
                    area_grafica,
                    peri_grafico,
                    fech_actua,
                    ST_Transform(
                        ST_Translate(
                            ST_Transform(objcad_lote_gemo, 4326),
                            {offset_lon},
                            {offset_lat}
                        ),
                        32719
                    ) AS new_geom
                FROM tg_lote
                WHERE SUBSTR(id_lote, 1, 1) = '2';
            """)
            
            db.execute(query)
            db.commit()
            
            if idx % 5 == 0 or idx == clones_count - 1:
                print(f"Clon #{idx} inyectado (Sectores '{prefix}') - Desplazamiento local: Lon={offset_lon:.3f}°, Lat={offset_lat:.3f}°")
                
        except Exception as e:
            db.rollback()
            print(f"Fallo en clon #{idx} ('{prefix}'): {e}")
            
    conteo_final = db.execute(text("SELECT COUNT(*) FROM tg_lote;")).scalar() or 0
    db.close()
    print(f"\n=== ESCALAMIENTO LOCAL MASIVO FINALIZADO ===")
    print(f"Total original: {conteo_inicial}")
    print(f"Total final en base de datos: {conteo_final} parcelas localizadas correctamente.")

if __name__ == "__main__":
    duplicar_datos_local()
