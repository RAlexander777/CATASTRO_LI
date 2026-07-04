# -*- coding: utf-8 -*-
import subprocess
import time
import socket
import logging
from fastapi import APIRouter, HTTPException

logger = logging.getLogger(__name__)

router = APIRouter()

CONTAINER_NAME = "catastro_db"
DB_HOST = "localhost"
DB_PORT = 5477

def _puerto_abierto(host, port, timeout=2):
    try:
        s = socket.create_connection((host, port), timeout=timeout)
        s.close()
        return True
    except (OSError, socket.error):
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

        for intento in range(30):
            if _puerto_abierto(DB_HOST, DB_PORT):
                logger.info(f"PostgreSQL listo tras reinicio (intento {intento+1}).")
                return {
                    "status": "ok",
                    "message": "Caché PostgreSQL limpiado. Contenedor reiniciado."
                }
            time.sleep(1)

        raise TimeoutError("PostgreSQL no respondió tras 30s del reinicio.")
    except Exception as e:
        logger.error(f"Error al limpiar caché: {e}")
        raise HTTPException(status_code=500, detail=f"Error al limpiar caché: {str(e)}")
