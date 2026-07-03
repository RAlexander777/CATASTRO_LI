import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Recuperar la URL desde las variables de entorno de Docker o usar el puerto local 5477 de respaldo
DATABASE_URL = os.getenv(
    "DATABASE_URL", 
    "postgresql://rodrigo:catastro2026@localhost:5477/catastro_li"
)

# 1. Crear el motor de conexión síncrono para operaciones y migraciones
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True  # Verifica la validez de la conexión antes de realizar transacciones
)

# 2. Configurar la fábrica de sesiones transaccionales (Aquí definimos SessionLocal)
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

# 3. Clase base para el mapeo declarativo de los modelos ORM
Base = declarative_base()

# Dependencia para inyectar la sesión en los endpoints de FastAPI
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()