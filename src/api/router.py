from fastapi import APIRouter
from src.api.endpoints import lotes, search, cache

api_router = APIRouter()

# Enlace de submódulos para el control cartográfico y analítica de índices aprendidos
api_router.include_router(lotes.router, prefix="/lotes", tags=["Componente Gráfico"])
api_router.include_router(search.router, prefix="/search", tags=["Motores de Búsqueda"])
api_router.include_router(cache.router, prefix="/cache", tags=["Control de Caché"])