# Importar la clase base compartida y el motor de conexión
from src.config.database import Base

# Importar todas las clases para asegurar que queden registradas en la metadata de SQLAlchemy
from src.database.models_grafico import TgLote
from src.database.models_alfanumerico import TfLotes, TfFichas

# Variable útil para configuraciones de Alembic
metadata = Base.metadata