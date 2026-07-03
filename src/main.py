from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.api.router import api_router

# Inicialización de la aplicación principal de FastAPI
app = FastAPI(
    title="Catastro LI - Learned Index & GIS Engine",
    description="Ecosistema híbrido de analítica espacial y control de fichas catastrales",
    version="1.0.0"
)

# Configuración de CORS para permitir peticiones desde el visor web de Leaflet
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # En producción, especificar los dominios permitidos
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")

@app.get("/")
def read_root():
    """
    Endpoint base de verificación de estado (Health Check).
    """
    return {
        "status": "online",
        "project": "Catastro LI",
        "message": "Servidor ASGI inicializado correctamente"
    }