from fastapi import APIRouter
from src.api.endpoints import lotes, search, cache, status, benchmark

api_router = APIRouter()

# Enlace de submódulos para el control cartográfico y analítica de índices aprendidos
api_router.include_router(lotes.router, prefix="/lotes", tags=["Componente Gráfico"])
api_router.include_router(search.router, prefix="/search", tags=["Motores de Búsqueda"])
api_router.include_router(cache.router, prefix="/cache", tags=["Control de Caché"])
api_router.include_router(status.router, tags=["Métricas del Ecosistema"])
api_router.include_router(benchmark.router, tags=["Benchmark Académico"])