# -*- coding: utf-8 -*-
"""
Endpoint de Estado y Métricas del Ecosistema.

Devuelve métricas en tiempo real para alimentar los widgets del dashboard
(uso de RAM PostGIS, RAM PGM Index, espacio en disco, conteo de registros,
tiempo de entrenamiento del PGM, etc.).

- postgis_ram: tamaño real del índice GiST de la columna `objcad_lote_gemo`.
  Equivalente espacial del `pgm_ram`: costo del índice GiST en disco/memoria
  que PostGIS usa para acelerar el `&&`.
- pgm_ram: footprint en RAM del PGM-Index cargado en Python, medido con
  `sys.getsizeof` sobre los arrays reales (sorted_keys, lotes, segments).
- db_disk: tamaño en disco de los DATOS de la tabla `tg_lote`
  (vía `pg_table_size`, que NO incluye los índices — evita doble conteo).
"""
import logging
import sys
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from src.config.database import get_db
from src.core.pgm.evaluator import evaluator

logger = logging.getLogger(__name__)

router = APIRouter()


def _human_bytes(num_bytes: float) -> str:
    """Convierte bytes a una unidad legible (B, KB, MB, GB, TB)."""
    if num_bytes is None:
        return "—"
    try:
        num_bytes = float(num_bytes)
    except (TypeError, ValueError):
        return "—"
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if abs(num_bytes) < 1024.0:
            return f"{num_bytes:.2f} {unit}"
        num_bytes /= 1024.0
    return f"{num_bytes:.2f} PB"


def _pg_table_bytes(db: Session, query_sql: str, params: dict | None = None) -> float:
    """Ejecuta una query que devuelve un escalar (bytes) y devuelve float."""
    try:
        result = db.execute(text(query_sql), params or {}).scalar()
        return float(result or 0)
    except Exception as e:
        logger.warning(f"Error en query de tamaño: {e}")
        return 0.0


def _get_gist_index_size(db: Session) -> float:
    """
    Devuelve el tamaño en bytes del índice GiST principal de `tg_lote.objcad_lote_gemo`.

    Hace un JOIN correcto a `pg_am` para filtrar únicamente por índices
    cuyo `relam` (access method) sea `gist`.
    """
    sql = """
        SELECT COALESCE(
            (
                SELECT pg_relation_size(ic.oid)
                FROM pg_index i
                JOIN pg_class c  ON c.oid  = i.indrelid
                JOIN pg_class ic ON ic.oid = i.indexrelid
                JOIN pg_am  am  ON am.oid  = ic.relam
                WHERE c.relname = 'tg_lote'
                  AND am.amname = 'gist'
                  AND pg_get_indexdef(i.indexrelid) ILIKE '%objcad_lote_gemo%'
                LIMIT 1
            ), 0
        ) AS gist_bytes;
    """
    return _pg_table_bytes(db, sql)


def _deep_sizeof(obj, _seen: set | None = None) -> int:
    """
    Tamaño aproximado en bytes de un objeto Python, recorriendo recursivamente
    sus atributos. Usa `sys.getsizeof` y maneja listas, dicts, tuplas, sets.

    NOTA: Es una estimación razonable (no incluye objetos referenciados más de
    una vez gracias al set `_seen`), útil para reportar el footprint del PGM
    en RAM de manera transparente.
    """
    if _seen is None:
        _seen = set()
    obj_id = id(obj)
    if obj_id in _seen:
        return 0
    _seen.add(obj_id)

    size = sys.getsizeof(obj)
    if isinstance(obj, (list, tuple, set, frozenset)):
        for item in obj:
            size += _deep_sizeof(item, _seen)
    elif isinstance(obj, dict):
        for k, v in obj.items():
            size += _deep_sizeof(k, _seen)
            size += _deep_sizeof(v, _seen)
    elif hasattr(obj, "__dict__"):
        size += _deep_sizeof(obj.__dict__, _seen)
    return size


@router.get("/status")
def obtener_status_ecosistema(db: Session = Depends(get_db)):
    """
    Devuelve el estado y métricas globales del ecosistema:
    - total_records: cantidad de lotes urbanos
    - postgis_ram: tamaño del índice GiST sobre `objcad_lote_gemo`
    - pgm_ram: footprint real en RAM del PGM-Index (sys.getsizeof recursivo)
    - db_disk: tamaño en disco de los DATOS de `tg_lote` (sin índices)
    - training_time: tiempo de entrenamiento del PGM-Index
    - pgm_segments: cantidad de segmentos del PGM
    - pgm_epsilon: epsilon del PGM
    """
    try:
        # 1) Conteo total de registros
        try:
            total = db.execute(
                text("SELECT COUNT(*) FROM tg_lote WHERE objcad_lote_gemo IS NOT NULL;")
            ).scalar() or 0
        except Exception as e:
            logger.warning(f"Error en COUNT: {e}")
            total = 0

        # 2) Tamaño en disco de los DATOS de tg_lote (sin índices)
        #    pg_table_size incluye heap + FSM + VM + toast, pero NO los índices.
        db_disk_bytes = _pg_table_bytes(
            db, "SELECT pg_table_size('tg_lote');"
        )
        db_disk_human = _human_bytes(db_disk_bytes)

        # 3) Tamaño real del índice GiST (RAM PostGIS equivalente)
        postgis_bytes = _get_gist_index_size(db)
        postgis_human = _human_bytes(postgis_bytes)

        # 4) Métricas del PGM-Index (estado del singleton)
        try:
            if not evaluator.initialized:
                try:
                    evaluator.initialize(db)
                except Exception as e:
                    logger.warning(f"No se pudo inicializar PGM: {e}")

            pgm_lotes = len(getattr(evaluator, "lotes", []) or [])
            pgm_segments = (
                len(getattr(evaluator.index, "segments", []) or [])
                if getattr(evaluator, "index", None)
                else 0
            )
            pgm_epsilon = getattr(evaluator, "epsilon", None)
            training_time_s = float(getattr(evaluator, "training_time_s", 0) or 0)

            # Footprint REAL del PGM en RAM de Python (incluye overhead de
            # dict/list/objects). Útil para diagnóstico, pero NO comparable
            # con el GiST de Postgres en disco.
            pgm_bytes_python = 0
            for attr in ("sorted_keys", "lotes", "index", "sorter"):
                obj = getattr(evaluator, attr, None)
                if obj is not None:
                    pgm_bytes_python += _deep_sizeof(obj)

            # Footprint "ideal" del PGM en array C nativo (lo comparable con
            # la literatura de Learned Indexes):
            #   - sorted_keys: array de uint64 → 8 bytes × N
            #   - segments: ~3 doubles (slope, intercept, intercept2) por seg → 24 bytes × M
            #   - id_map: array de ids → 8 bytes × N (uint64)
            pgm_bytes_ideal = (
                pgm_lotes * 8           # sorted_keys como uint64
                + pgm_lotes * 8         # id_lote como uint64
                + pgm_segments * 24     # segments (3 doubles)
            )
            pgm_bytes = pgm_bytes_ideal
            pgm_human = _human_bytes(pgm_bytes)
        except Exception as e:
            logger.warning(f"Error en métricas PGM: {e}")
            pgm_lotes = pgm_segments = 0
            pgm_epsilon = None
            training_time_s = 0.0
            pgm_bytes = 0
            pgm_bytes_python = 0
            pgm_human = "—"

        return {
            "total_records": f"{int(total):,}",
            "postgis_ram": postgis_human,
            "pgm_ram": pgm_human,
            "db_disk": db_disk_human,
            "training_time": f"{training_time_s:.2f} s",
            "pgm_segments": pgm_segments,
            "pgm_epsilon": pgm_epsilon,
            "pgm_lotes": pgm_lotes,
            # Extras en bytes para que el frontend pueda calcular % de ahorro sin parsear strings.
            # `pgm_ram_bytes` es la estimación "ideal" (array C nativo), comparable con la literatura.
            "postgis_ram_bytes": postgis_bytes,
            "pgm_ram_bytes": pgm_bytes,
            "pgm_ram_python_bytes": pgm_bytes_python,
            "db_disk_bytes": db_disk_bytes,
        }
    except Exception as e:
        logger.error(f"Error en /api/status: {e}")
        raise HTTPException(status_code=500, detail=f"Error al obtener status: {str(e)}")


