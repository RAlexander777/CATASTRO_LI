# -*- coding: utf-8 -*-
"""
Endpoint de Benchmark Masivo: R-Tree (GiST) vs Learned Index (PGM-Index).

Permite ejecutar N consultas aleatorias comparando ambos motores de búsqueda,
con un modo opcional de caché frío (cold cache) que reinicia el contenedor
PostgreSQL entre cada consulta para garantizar mediciones limpias y justas
(útil para papers académicos donde se requiere comparar el comportamiento
de cada motor en igualdad de condiciones).

Devuelve métricas por consulta (lat, lon, tiempos individuales, speedup, etc.)
más un resumen estadístico (media, mediana, p50, p90, p95, p99) por métrica.
"""
import logging
import math
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from src.config.database import SessionLocal, get_db
from src.core.pgm.evaluator import evaluator
from src.api.endpoints.cache import flush_postgres_cache

logger = logging.getLogger(__name__)

router = APIRouter()


class BenchmarkRequest(BaseModel):
    n_lots: int = Field(
        100,
        ge=1,
        le=2000,
        description="Número de lotes aleatorios a consultar (1-2000).",
    )
    cold_cache: bool = Field(
        False,
        description=(
            "Si True, reinicia el contenedor PostgreSQL antes de CADA consulta "
            "para garantizar un caché completamente frío en cada medición "
            "(comparación 100% justa, pero mucho más lento)."
        ),
    )
    include_segment_details: bool = Field(
        False,
        description="Si True, incluye detalles del segmento del PGM (índice, slope, intercept) en cada fila.",
    )


def _percentile(values: list[float], p: float) -> float:
    """Calcula el percentil p (0-100) de una lista de números."""
    if not values:
        return 0.0
    sorted_v = sorted(values)
    k = (len(sorted_v) - 1) * (p / 100.0)
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return float(sorted_v[int(k)])
    return float(sorted_v[f] * (c - k) + sorted_v[c] * (k - f))


def _summary_stats(values: list[float]) -> dict:
    """Calcula estadísticas descriptivas de una lista de tiempos (ms)."""
    if not values:
        return {
            "n": 0, "mean": 0.0, "median": 0.0,
            "std": 0.0, "min": 0.0, "max": 0.0,
            "p50": 0.0, "p90": 0.0, "p95": 0.0, "p99": 0.0,
        }
    n = len(values)
    mean = sum(values) / n
    variance = sum((v - mean) ** 2 for v in values) / n if n > 0 else 0.0
    std = math.sqrt(variance)
    return {
        "n": n,
        "mean": round(mean, 4),
        "median": round(_percentile(values, 50), 4),
        "std": round(std, 4),
        "min": round(min(values), 4),
        "max": round(max(values), 4),
        "p50": round(_percentile(values, 50), 4),
        "p90": round(_percentile(values, 90), 4),
        "p95": round(_percentile(values, 95), 4),
        "p99": round(_percentile(values, 99), 4),
    }


def _query_rtree(db: Session, lat: float, lon: float) -> float:
    """
    Ejecuta la consulta espacial R-Tree (GiST) y devuelve el tiempo en ms.
    Mide únicamente la consulta (no la transferencia de geometría completa)
    para que sea una comparación justa con el PGM-Index.
    """
    start = time.perf_counter()
    db.execute(
        text("""
            SELECT id_lote
            FROM tg_lote
            WHERE objcad_lote_gemo && ST_Transform(ST_SetSRID(ST_Point(:lon, :lat), 4326), 32719)
            LIMIT 1;
        """),
        {"lat": lat, "lon": lon},
    ).first()
    return (time.perf_counter() - start) * 1000.0


def _query_pgm(db: Session, lat: float, lon: float) -> Optional[dict]:
    """
    Ejecuta SOLO el pipeline del PGM-Index (proyección + Hilbert + predicción +
    búsqueda binaria) y devuelve el tiempo de búsqueda aprendido en ms.
    NO ejecuta GiST, ni SELECT final, ni lookup de ciudad.
    """
    result = evaluator.search_pgm_only(lat, lon, db)
    if not result:
        return None
    return result


@router.post("/benchmark")
async def ejecutar_benchmark(req: BenchmarkRequest, request: Request, db: Session = Depends(get_db)):
    """
    Ejecuta `n_lots` consultas aleatorias comparando R-Tree (PostGIS GiST)
    y PGM-Index sobre los centroides de la tabla `tg_lote`.

    Con `cold_cache=True`, reinicia el contenedor PostgreSQL antes de cada
    consulta para garantizar mediciones limpias (cada consulta parte de un
    caché 100% frío).

    Devuelve por cada consulta:
        - id_lote, lat, lon (consulta exacta)
        - rtree_ms (tiempo del R-Tree en ms)
        - pgm_ms (tiempo del PGM-Index en ms: proyección + Hilbert + predicción + lookup)
        - speedup (rtree_ms / pgm_ms)
        - hilbert_key, segment_index, points_count (si include_segment_details)

    Y al final un resumen estadístico (media, mediana, p50, p90, p95, p99, std, min, max)
    para cada métrica, listo para graficar en el paper.
    """
    if req.cold_cache:
        logger.info(
            f"Benchmark con cold_cache=True y n_lots={req.n_lots}. "
            f"Reinicio de PostgreSQL entre cada consulta: ~7s × {req.n_lots} = "
            f"~{int(req.n_lots * 7)}s estimados."
        )

    # 1) Asegurar que el PGM-Index está entrenado (sobrevive a docker restart
    # porque está en RAM del proceso Python, no en PostgreSQL).
    if not evaluator.initialized:
        try:
            evaluator.initialize(db)
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"No se pudo inicializar el PGM-Index: {str(e)}",
            )

    # 2) Selección de N lotes aleatorios con sus centroides en WGS84
    sample_query = text("""
        SELECT
            id_lote,
            ST_X(ST_Centroid(ST_Transform(objcad_lote_gemo, 4326))) AS lon,
            ST_Y(ST_Centroid(ST_Transform(objcad_lote_gemo, 4326))) AS lat
        FROM tg_lote
        WHERE objcad_lote_gemo IS NOT NULL
        ORDER BY random()
        LIMIT :n;
    """)
    sample = db.execute(sample_query, {"n": req.n_lots}).all()
    if not sample:
        raise HTTPException(
            status_code=404,
            detail="No hay lotes en la base de datos para ejecutar el benchmark.",
        )

    # 3) Cerramos la sesión de la dependencia porque vamos a gestionar sesiones
    # manualmente (necesitamos nuevas sesiones tras cada docker restart).
    db.close()

    # 4) Iteración sobre cada lote, midiendo ambos motores de forma justa.
    rows: list[dict] = []
    rtree_times: list[float] = []
    pgm_times: list[float] = []
    speedups: list[float] = []
    failed = 0
    cache_flushes = 0
    total_cache_flush_time_s = 0.0

    for idx, s in enumerate(sample):
        # Detener la ejecución si el cliente se desconectó (cancelación, F5 o cierre de ventana)
        if await request.is_disconnected():
            logger.info(f"Cliente desconectado. Cancelando benchmark en la iteración {idx}/{req.n_lots}.")
            break

        lat = float(s.lat)
        lon = float(s.lon)

        # ── A) Cold cache: reinicio de PostgreSQL antes de cada consulta ──
        # Esto garantiza que AMBOS motores parten de un caché 100% limpio.
        if req.cold_cache:
            try:
                t_flush_start = time.perf_counter()
                flush_postgres_cache()
                total_cache_flush_time_s += time.perf_counter() - t_flush_start
                cache_flushes += 1
            except Exception as e:
                logger.warning(f"Falló cache flush en iteración {idx}: {e}")
                failed += 1
                continue

        # ── B) Nueva sesión (necesaria tras docker restart) ──
        local_db = SessionLocal()
        try:
            # ── C) PGM primero (no toca GiST, así que no calienta el R-Tree) ──
            try:
                pgm_res = _query_pgm(local_db, lat, lon)
                pgm_ms = pgm_res["search_time_ms"] if pgm_res else None
            except Exception as e:
                logger.warning(f"Benchmark: fallo PGM en ({lat}, {lon}): {e}")
                pgm_res = None
                pgm_ms = None

            # ── D) R-Tree después (GiST parte de estado frío en cold_cache=True,
            #       y no se ve afectado por la projection query del PGM) ──
            try:
                rtree_ms = _query_rtree(local_db, lat, lon)
            except Exception as e:
                logger.warning(f"Benchmark: fallo R-Tree en ({lat}, {lon}): {e}")
                rtree_ms = None
        finally:
            local_db.close()

        if rtree_ms is None or pgm_ms is None:
            failed += 1
            continue

        speedup = rtree_ms / pgm_ms if pgm_ms > 0 else 0.0
        rtree_times.append(rtree_ms)
        pgm_times.append(pgm_ms)
        speedups.append(speedup)

        row = {
            "id_lote": s.id_lote,
            "lat": round(lat, 7),
            "lon": round(lon, 7),
            "rtree_ms": round(rtree_ms, 4),
            "pgm_ms": round(pgm_ms, 4),
            "speedup": round(speedup, 4),
        }
        if req.include_segment_details and pgm_res:
            seg = pgm_res.get("segment") or {}
            row["hilbert_key"] = pgm_res.get("hilbert_key")
            row["segment_index"] = seg.get("segment_index")
            row["segment_points"] = seg.get("points_count")
            row["pgm_binary_steps"] = pgm_res.get("binary_steps")
        rows.append(row)

    # 5) Resumen estadístico
    summary = {
        "requested_n": req.n_lots,
        "successful_n": len(rows),
        "failed_n": failed,
        "rtree_ms": _summary_stats(rtree_times),
        "pgm_ms": _summary_stats(pgm_times),
        "speedup_ratio": _summary_stats(speedups),
    }

    return {
        "config": {
            "n_lots": req.n_lots,
            "cold_cache": req.cold_cache,
            "include_segment_details": req.include_segment_details,
            "db_total": int(
                SessionLocal()
                .execute(text("SELECT COUNT(*) FROM tg_lote;"))
                .scalar()
                or 0
            ),
            "cache_flushes_performed": cache_flushes,
            "total_cache_flush_time_s": round(total_cache_flush_time_s, 2),
            "measurement_order": "pgm_first_then_rtree (PGM no toca GiST)",
        },
        "summary": summary,
        "rows": rows,
    }


@router.post("/benchmark/cold-flush")
def benchmark_cold_flush(db: Session = Depends(get_db)):
    """
    Reinicia el contenedor PostgreSQL para limpiar completamente
    `shared_buffers` y la caché del sistema operativo.
    Útil para preparar un benchmark cold-cache o para uso académico.
    """
    try:
        result = flush_postgres_cache()
        return result
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"No se pudo limpiar el caché: {str(e)}",
        )
