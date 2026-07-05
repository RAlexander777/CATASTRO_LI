<p align="center">
  <img src="src/web/assets/LI_logo.png" alt="Catastro LI Logo" width="380" style="max-width: 100%; height: auto;" />
</p>

<h1 align="center">Catastro LI</h1>

<p align="center">
  <img src="https://img.shields.io/badge/Version-2.5.0-blueviolet?style=for-the-badge&logo=semver" alt="Version" />
  <img src="https://img.shields.io/badge/Python-3.11+-blue?style=for-the-badge&logo=python&logoColor=white" alt="Python" />
  <img src="https://img.shields.io/badge/FastAPI-0.110+-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/PostgreSQL-15-336791?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/PostGIS-3.3-336791?style=for-the-badge&logo=postgis&logoColor=white" alt="PostGIS" />
  <img src="https://img.shields.io/badge/Leaflet-1.9.4-green?style=for-the-badge&logo=leaflet&logoColor=white" alt="Leaflet" />
</p>

<p align="center">
  <strong>¿Y si reemplazamos las estructuras espaciales tradicionales por modelos indexados de Machine Learning?</strong><br />
  Un ecosistema híbrido de alto rendimiento para analítica espacial y gestión de fichas catastrales urbanas, diseñado para comparar la eficiencia de <strong>Learned Indexes</strong> frente a las estructuras de indexación espacial tradicionales (como R-Trees y GiST) en consultas de rango y geolocalización.
</p>

---

## 📚 Antecedentes y Contexto Científico

Este proyecto surge como parte de una investigación avanzada en el Doctorado de Ciencia de la Computación de la Universidad Nacional del Altiplano (Puno, Perú). El antecedente clave es el paradigma de **Índices Aprendidos** (*Learned Indexes*) introducido por Kraska et al. (2018), que demostró cómo los índices clásicos pueden formularse como modelos acumulativos de distribución (CDF) para predecir la posición física de una clave. 

Para resolver consultas espaciales de geolocalización sin recurrir a estructuras jerárquicas clásicas de cajas (MBR) —las cuales sufren constantes fallos de caché debido a la persecución de punteros dispersos en RAM/disco—, extendemos esta teoría co-diseñando una arquitectura web catastral híbrida. Proyectamos las geometrías de los lotes urbanos mediante la **Curva de Hilbert** (Kamel y Faloutsos, 1994) y modelamos su distribución lineal con el **PGM-Index** (Ferragina y Vinciguerra, 2020), evaluando la mejora directa frente a la interfaz extensible de indexación **GiST** (Hellerstein et al., 1995) de PostGIS.

## 🚀 El Concepto: Indexación Aprendida vs. R-Trees

Las bases de datos espaciales tradicionales confían en la **Familia R-Tree** (implementada mediante la extensión **GiST** en PostgreSQL) para indexar geometrías agrupándolas jerárquicamente en Cajas de Contorno Mínimo (**MBRs**, *Minimum Bounding Boxes*). Sin embargo, navegar y resolver intersecciones de MBRs solapados introduce costos computacionales significativos.

**Catastro LI** plantea un enfoque experimental alternativo:
1. **Reducción de Dimensionalidad Fractal**: Proyectar los centroides bidimensionales $(X, Y)$ de las geometrías complejas sobre una curva unidimensional continua (**Curva de Hilbert 1D**), preservando la localidad espacial en memoria.
   <p align="center"><img src="src/web/assets/figura1_hilbert.png" alt="Preservación de vecindad con Curva de Hilbert" width="450" /></p>
2. **Índice Aprendido (PGM-Index)**: Entrenar un modelo geométrico por tramos (**Piecewise Geometric Model**) con los códigos lineales de Hilbert ordenados para aproximar y predecir la posición física de los registros en memoria con una cota de error máxima garantizada ($\epsilon$).
   <p align="center"><img src="src/web/assets/figura5_cdf.png" alt="Segmentación y error acotado en el PGM-Index" width="450" /></p>

El ecosistema incorpora un **Simulador Debug en Vivo** tanto en la Landing Page como en el Visor Cartográfico para visualizar este proceso cartográficamente y auditar el rendimiento estructural paso a paso.

---

## 🛠️ Arquitectura de Componentes

El proyecto se encuentra desacoplado en tres capas operativas principales gestionadas en contenedores **Docker**:

```mermaid
graph TD
    subgraph Frontend [Capa de Visualización - Cliente]
        A[Visor Cartográfico Leaflet] -->|Filtros / Búsqueda ID| B[Dashboard HUD & Telemetría]
        B -->|Simulador Debug| C[Paso a Paso R-Tree MBR]
    end
    subgraph Backend [Capa de Negocio - API]
        D[FastAPI ASGI Server] -->|Endpoints JSON / GeoJSON| A
        D -->|Sincronización Inicial SQLAlchemy| E[(PostgreSQL 15 + PostGIS)]
    end
    subgraph DataEngine [Ingeniería de Datos / ETL]
        F[Overpass API OSM] -->|ingest_data.py| G[puno_raw_data.json]
        G -->|load_to_db.py| E
    end
```

### 1. Base de Datos (Capa Espacial)
Motor relacional **PostgreSQL 15** extendido con **PostGIS** para el almacenamiento de geometrías nativas y cómputo vectorial.
* *Nota sobre el Ciclo de Vida*: Se prescindió del uso de herramientas de migración externas (como Alembic) debido a colisiones e incompatibilidades con la inyección nativa automatizada de índices espaciales por parte de **GeoAlchemy2**. El esquema es sincronizado dinámicamente de forma directa por SQLAlchemy durante el evento de inicialización (`startup`) de la API (`Base.metadata.create_all(bind=engine)`).

### 2. Backend (API)
Servicio ASGI de alta velocidad construido sobre **FastAPI (Python 3.11)**. Expone la analítica catastral y despacha flujos de datos espaciales procesados en tiempo real.

### 3. Frontend (Visor)
Lienzo dinámico e interactivo construido con **Vanilla JavaScript**, **Leaflet** para el renderizado vectorial ligero, y **Vanilla CSS** bajo un diseño inmersivo *SaaS Noir* (modo oscuro, contrastes neón de alta fidelidad informática y micro-animaciones).

---

## 📋 Pipeline de Ingesta e Ingeniería de Datos (ETL)

El flujo de alimentación y normalización opera mediante scripts independientes en Python:

1. **Descarga Vectorial (`ingest_data.py`)**: Realiza consultas remotas a **Overpass API (OpenStreetMap)** delimitando un cuadrante o Bounding Box específico sobre el área urbana de Puno, Perú. Consume las capas de nodos y vías etiquetadas bajo la categoría `"building"`, volcando los datos crudos en `puno_raw_data.json`.
2. **Procesamiento y Carga (`load_to_db.py`)**:
   * Lee el archivo crudo `puno_raw_data.json`.
   * Filtra y extrae las secuencias de nodos para reconstruir los anillos topológicos externos de cada polígono utilizando `shapely`.
   * Garantiza el cierre geométrico del polígono (primer y último vértice idénticos).
   * Inyecta los polígonos a PostGIS declarando coordenadas geográficas base (`WGS84 / SRID 4326`).
   * Ejecuta una transformación matemática nativa mediante código SQL directo (`ST_Transform`) para reproyectar las capas al sistema plano métrico oficial del Perú (**UTM Zona 19S / SRID 32719**).
   * Calcula de manera exacta las métricas físicas utilizando funciones del motor de base de datos (`ST_Area` y `ST_Perimeter`) y actualiza las columnas correspondientes de la tabla principal `tg_lote`.

---

## 🗃️ Modelo de Datos: `tg_lote`

La estructura que define el catastro gráfico incluye:
* `id_lote` (`String(14)`, Primary Key): Identificador alfanumérico único para el lote urbano.
* `area_grafica` (`Float`): Área calculada del polígono en metros cuadrados.
* `peri_grafico` (`Float`): Perímetro calculado del polígono en metros lineales.
* `fech_actua` (`Date`): Fecha del último registro o actualización.
* `objcad_lote_gemo` (`Geometry(Polygon, 32719)`): Columna geométrica nativa de PostGIS con los anillos vectoriales cerrados en el sistema proyectado UTM 19S.

---

## 🌐 Endpoints de la API

FastAPI gestiona rutas limpias sin extensiones multimedia redundantes:

* `GET /`: Landing Page principal. Expone métricas de estado y el simulador de depuración en 3 cards.
* `GET /visor`: Visor Cartográfico interactivo. Permite buscar lotes y ejecutar simulaciones sobre el mapa de Leaflet.
* `GET /api/status`: Endpoint de diagnóstico transaccional. Retorna el nombre de la base de datos activa y el volumen exacto de registros catastrales inyectados (`SELECT COUNT(*)`).
* `GET /api/lotes/`: Despachador GeoJSON. Recupera los lotes, reproyecta las coordenadas a formato geográfico estándar en el vuelo mediante `ST_Transform(geom, 4326)` y empaqueta la colección utilizando `ST_AsGeoJSON` para consumo del cliente.
* `GET /api/lotes/random`: Retorna un lote aleatorio para pruebas rápidas de geolocalización.

---

## ⚡ Simulación de Depuración Visual ("Modo Debug")

El ecosistema incorpora simuladores ralentizados paso a paso para auditar el funcionamiento interno de las búsquedas del R-Tree (GiST):

* **En la Landing Page (Index)**: Genera y despliega horizontalmente tres tarjetas cuadradas dinámicas que abarcan todo el Hero. Muestran los SVGs de las cajas MBR y métricas reales del lote consultado (MBR Área, Candidatos, Operador espacial `ST_Overlap` / `ST_Contains` y Tiempos de búsqueda).
* **En el Visor Cartográfico (Mapa)**: Si se activa el switch `[ ] debug`, Leaflet ralentiza el vuelo y ejecuta un escaneo espacial visual:
  1. Vuela a escala macro (`zoom: 15`) y dibuja el MBR del nodo raíz **N0** en morado.
  2. Atenúa el cuadro anterior, vuela a nivel de manzana (`zoom: 17`) y dibuja el MBR **N1** en cian.
  3. Hace zoom al predio (`zoom: 19`), atenúa el MBR y resalta el polígono real del lote **N2** en verde neón, abriendo automáticamente sus detalles catastrales.

---

## 🗃️ Carga y Escalamiento Masivo (Scripts de Soporte)

El ecosistema provee herramientas avanzadas de ingeniería de datos para poblar y escalar la base de datos de manera automatizada:

1. **Ingesta Real Ampliada (`ingest_peru_cities.py`)**:
   * Descarga de forma real mediante consultas directas a **Overpass API (OpenStreetMap)** un total de **24 zonas metropolitanas** de Perú y Latinoamérica (incluye Lima Centro, Arequipa, Cusco, Trujillo, Chiclayo, Piura, Iquitos, Bogotá, Santiago, Buenos Aires, Ciudad de México, etc.).
   * Ejecución:
     ```bash
     python ingest_peru_cities.py
     ```

2. **Generador Procedural Offline (`populate_all_cities.py`)**:
   * Si deseas poblar la base de datos completa de **18 ciudades de Perú** de manera instantánea y offline sin depender de Overpass API (evitando bloqueos de IP).
   * Toma el set de datos vectoriales semilla de Puno (`puno_raw_data.json`), aplica traslaciones geográficas de latitud/longitud, rotaciones y pequeñas deformaciones aleatorias a los polígonos, y los inyecta en cada respectiva ciudad de origen (con sus centroides transformados a UTM 19S / SRID 32719).
   * Ejecución:
     ```bash
     python populate_all_cities.py
     ```

3. **Escalamiento Local por Cuadrante (`scale_db.py`)**:
   * Permite multiplicar por 7 el tamaño de tu base de datos catastral.
   * Por cada lote registrado, crea 6 clones desplazados localmente en una grilla de sectores contiguos (de 1.5km a 2.5km), simulando el crecimiento de distritos o barrios vecinos. Mantiene las ciudades de origen de cada lote y actualiza sus coordenadas proyectadas en PostGIS.
   * Ideal para pruebas de estrés de los Learned Indexes con **más de 500,000 registros catastrales**.
   * Ejecución:
     ```bash
     python scale_db.py
     ```

---

## 🏁 Inicio Rápido

### Usando Docker y Makefile (Recomendado)

El proyecto incluye un entorno preconfigurado con Docker. Para levantar la base de datos de PostGIS y el backend de FastAPI de forma automática:

1. **Levantar el entorno**:
   ```bash
   make up
   ```
2. **Verificar el estado de los contenedores**:
   ```bash
   make ps
   ```
3. **Monitorear los logs de la API**:
   ```bash
   make logs
   ```
4. **Apagar los servicios**:
   ```bash
   make down
   ```

### Instalación Local (Desarrollo Manual)

Si prefieres ejecutar el entorno fuera de Docker:

1. **Crear e instalar dependencias**:
   ```bash
   python -m venv venv
   source venv/bin/activate  # En Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```
2. **Configurar Variables de Entorno**:
   Crea un archivo `.env` en la raíz del proyecto y configura tus credenciales de PostgreSQL:
   ```env
   DATABASE_URL=postgresql://tu_usuario:tu_contraseña@localhost:5432/catastro_li
   ```
3. **Correr el ETL para Puno**:
   ```bash
   python ingest_data.py
   python load_to_db.py
   ```
4. **Iniciar el Servidor**:
   ```bash
   uvicorn src.main:app --reload
   ```

---

## 📊 Resultados y Benchmarks Reales (N = 392,513 lotes)

Los resultados de las pruebas experimentales ejecutadas sobre el dataset catastral consolidado arrojan las siguientes métricas de rendimiento comparativo:

### 💾 Consumo de Memoria Estructural
* **Índice Espacial PostGIS (GiST)**: `16.25 MB`
* **Índice Aprendido (PGM-Index en RAM)**: `6.33 MB` (¡Un **ahorro del 61.05%** en memoria RAM física!).
  * *Nota de Ingeniería*: Esta huella en Python (`6.33 MB`) incluye la sobrecarga (overhead) de tipos e intérprete; una representación binaria pura en bajo nivel (C/C++) ocuparía teóricamente solo **585 KB** ($14,977 \text{ segmentos} \times 40 \text{ bytes}$), logrando una reducción del **96.4%**.
* **Tamaño en Disco de la Tabla (`tg_lote`)**: `79.70 MB`
* **Tiempo de Entrenamiento del PGM-Index**: `5.64 segundos`

<p align="center"><img src="src/web/assets/figura2_memoria.png" alt="Comparación de consumo de memoria RAM" width="520" /></p>

### ⚡ Tiempos de Búsqueda y Latencias (Test de 1,000 Consultas)
* **Latencia Promedio R-Tree (PostGIS GiST)**: `0.6737 ms` (673.73 µs)
* **Latencia Promedio Learned (PGM + Hilbert)**: `0.0196 ms` (**19.57 µs**)
* **Factor de Aceleración Promedio (Speedup)**: **36.93$\times$ más rápido** en la resolución de consultas de geolocalización catastral.
* **Pasos Promedio en la Búsqueda Binaria Local**: `2.27` accesos de clave en memoria RAM física.

<p align="center">
  <img src="src/web/assets/figura4_latencia.png" alt="Comparativa de Latencia de Consultas" width="370" style="margin-right: 15px;" />
  <img src="src/web/assets/figura3_sensibilidad.png" alt="Análisis de Sensibilidad (Epsilon)" width="370" />
</p>