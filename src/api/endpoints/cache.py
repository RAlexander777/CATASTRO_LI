# -*- coding: utf-8 -*-
import subprocess
import time
import socket
import os
import logging
from fastapi import APIRouter, HTTPException

logger = logging.getLogger(__name__)

router = APIRouter()

CONTAINER_NAME = "catastro_db"
# Dentro del contenedor API, el host de PostgreSQL es el nombre del servicio
# "db" en el puerto estándar 5432. Si lo ejecutamos fuera (host), el puerto mapeado es 5477.
DB_HOST = "db" if os.path.exists("/.dockerenv") else "localhost"
DB_PORT = 5432 if os.path.exists("/.dockerenv") else 5477
DB_USER = "rodrigo"
DB_PASS = "catastro2026"
DB_NAME = "catastro_li"


def _puerto_abierto(host, port, timeout=2):
    try:
        s = socket.create_connection((host, port), timeout=timeout)
        s.close()
        return True
    except (OSError, socket.error):
        return False


def _pg_listo(timeout_total_s=60):
    """
    Espera hasta que PostgreSQL esté listo para recibir queries reales
    (no solo hasta que el puerto TCP esté abierto). Para ello ejecuta
    `SELECT 1` reintentando hasta que responda 200 o se agote el tiempo.
    """
    try:
        import psycopg2
    except ImportError:
        return _puerto_abierto(DB_HOST, DB_PORT)

    t0 = time.time()
    intento = 0
    while time.time() - t0 < timeout_total_s:
        intento += 1
        try:
            conn = psycopg2.connect(
                host=DB_HOST, port=DB_PORT, user=DB_USER,
                password=DB_PASS, dbname=DB_NAME, connect_timeout=2,
            )
            cur = conn.cursor()
            cur.execute("SELECT 1;")
            cur.fetchone()
            cur.close()
            conn.close()
            logger.info(f"PostgreSQL listo tras {intento} intento(s) ({int(time.time()-t0)+1}s).")
            return True
        except Exception:
            time.sleep(1)
    return False


@router.post("/flush")
def flush_postgres_cache():
    """
    Reinicia el contenedor PostgreSQL para limpiar completamente shared_buffers
    y el caché del sistema operativo. Garantiza consultas en frío (cold cache).
    """
    try:
        logger.info(f"Flush cache: reiniciando contenedor {CONTAINER_NAME}...")

        result = subprocess.run(
            ["docker", "restart", CONTAINER_NAME],
            capture_output=True, text=True, timeout=30
        )

        if result.returncode != 0:
            raise RuntimeError(f"docker restart falló: {result.stderr.strip()}")

        if _pg_listo(timeout_total_s=60):
            return {
                "status": "ok",
                "message": "Caché PostgreSQL limpiado. Contenedor reiniciado."
            }

        raise TimeoutError(
            f"PostgreSQL no respondió a SELECT 1 en 60s tras reinicio "
            f"(probando {DB_HOST}:{DB_PORT})."
        )
    except Exception as e:
        logger.error(f"Error al limpiar caché: {e}")
        raise HTTPException(status_code=500, detail=f"Error al limpiar caché: {str(e)}")
