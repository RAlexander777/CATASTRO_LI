from sqlalchemy import Column, String, Numeric, Date, ForeignKey
from geoalchemy2 import Geometry
from src.config.database import Base

class TgLote(Base):
    """
    Componente Gráfico (TG): Representación de la parcela catastral.
    Mapeado bajo el estándar oficial con proyección UTM 19S (SRID 32719).
    """
    __tablename__ = 'tg_lote'

    id_lote = Column(String(14), primary_key=True, nullable=False)
    area_grafica = Column(Numeric(10, 2))
    peri_grafico = Column(Numeric(10, 2))
    fech_actua = Column(Date)
    
    # Campo espacial para almacenar el polígono del predio urbano
    objcad_lote_gemo = Column(
        Geometry(geometry_type='POLYGON', srid=32719), 
        nullable=True
    )