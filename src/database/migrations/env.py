import os
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context

# 1. Importar la Base de datos y los Modelos unificados para registrar la Metadata
from src.database.base import Base

# Este es el objeto de configuración de Alembic, que proporciona
# acceso a los valores del archivo alembic.ini en uso.
config = context.config

# Configurar el manejo de logs si el archivo ini está presente
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# 2. Asignar la metadata de nuestros modelos (TG y TF) para las migraciones automáticas
target_metadata = Base.metadata

# 3. Recuperar dinámicamente la URL de conexión del entorno de Docker
def get_url():
    return os.getenv(
        "DATABASE_URL", 
        "postgresql://rodrigo:catastro2026@db:5432/catastro_li"
    )

def run_migrations_offline() -> None:
    """Ejecuta las migraciones en modo 'offline' (genera scripts SQL sin conectarse)."""
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online() -> None:
    """Ejecuta las migraciones en modo 'online' (conectándose directamente a PostGIS)."""
    # Sobrescribir la URL del archivo INI con la del entorno de Docker
    configuration = config.get_section(config.config_ini_section) or {}
    configuration["sqlalchemy.url"] = get_url()
    
    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, 
            target_metadata=target_metadata,
            # Indispensable para que Alembic no intente borrar la extensión postgis
            include_object=exclude_postgis_extensions
        )

        with context.begin_transaction():
            context.run_migrations()

def exclude_postgis_extensions(obj, name, type_, reflected, compare_to):
    """Evita que Alembic intente eliminar tablas internas del sistema PostGIS."""
    if type_ == "table" and name in ["spatial_ref_sys", "geography_columns", "geometry_columns"]:
        return False
    return True

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()