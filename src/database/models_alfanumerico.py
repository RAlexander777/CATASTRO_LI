from sqlalchemy import Column, String, Numeric, DateTime, Integer
from src.config.database import Base

class TfLotes(Base):
    """
    Componente Alfanumérico (TF): Control e índices administrativos del lote.
    """
    __tablename__ = 'tf_lotes'

    id_lote = Column(String(14), primary_key=True, nullable=False)
    id_mzna = Column(String(11))
    codi_lote = Column(String(3))
    id_hab_urba = Column(String(10))
    cuc = Column(String(8))
    zonificacion = Column(String(30))


class TfFichas(Base):
    """
    Componente Alfanumérico (TF): Control del estado de las fichas en campo/gabinete.
    """
    __tablename__ = 'tf_fichas'

    id_ficha = Column(String(19), primary_key=True, nullable=False)
    tipo_ficha = Column(String(2))  # '01': Individual, '04': Bienes Comunes, etc.
    nume_ficha = Column(String(7))
    id_lote = Column(String(14))
    fecha_creacion = Column(DateTime)
    activo = Column(Numeric(1, 0))