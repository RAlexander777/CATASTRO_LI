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
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge" alt="MIT" />
</p>

<p align="center">
  <strong>¿Y si reemplazamos las estructuras espaciales tradicionales por modelos indexados de Machine Learning?</strong><br />
  Un ecosistema híbrido de alto rendimiento para analítica espacial y gestión de fichas catastrales urbanas, diseñado para comparar la eficiencia de <strong>Índices Aprendidos (Learned Indexes)</strong> frente al <strong>R-Tree de PostGIS (GiST)</strong> en consultas de geolocalización catastral.
</p>

---

## 📚 Antecedentes y Contexto Científico

Este proyecto surge como parte de una investigación avanzada en el Doctorado de Ciencia de la Computación de la Universidad Nacional del Altiplano (Puno, Perú). El antecedente clave es el paradigma de **Índices Aprendidos** (*Learned Indexes*) introducido por Kraska et al. (2018), que demostró cómo los índices clásicos pueden formularse como modelos acumulativos de distribución (CDF) para predecir la posición física de una clave. 

Para resolver consultas espaciales de geolocalización sin recurrir a estructuras jerárquicas clásicas de cajas (MBR) —las cuales sufren constantes fallos de caché debido a la persecución de punteros dispersos en RAM/disco—, extendemos esta teoría co-diseñando una arquitectura web catastral híbrida. Proyectamos las geometrías de los lotes urbanos mediante la **Curva de Hilbert** (Kamel y Faloutsos, 1994) y modelamos su distribución lineal con el **PGM-Index** (Ferragina y Vinciguerra, 2020), evaluando la mejora directa frente a la interfaz extensible de indexación **GiST** (Hellerstein et al., 1995) de PostGIS.

## 🚀 El Concepto: Indexación Aprendida vs. R-Tree de PostGIS (GiST)

Las bases de datos espaciales tradicionales confían en el **R-Tree** de PostGIS, implementado sobre la interfaz extensible **GiST** (Generalized Search Tree), para indexar geometrías agrupándolas jerárquicamente en Cajas de Contorno Mínimo (**MBRs**, *Minimum Bounding Boxes*). Sin embargo, navegar y resolver intersecciones de MBRs solapados introduce costos computacionales significativos debido a la persecución de punteros dispersos y fallos de caché.

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

## 🏁 Despliegue Rápido con Docker

### Requisitos Previos

- **Docker** y **Docker Compose** instalados
- **Git** para clonar el repositorio

### 1. Clonar el repositorio

```bash
git clone https://github.com/RAlexander777/CATASTRO_LI.git
cd CATASTRO_LI
```

### 2. Levantar los servicios

El proyecto incluye un **Makefile** que orquesta todos los comandos de Docker:

```bash
make up
```

Esto ejecuta `docker-compose up -d --build` y construye las imágenes:
- `catastro_db`: PostgreSQL 15 + PostGIS 3.3 (puerto `5477`)
- `catastro_api`: FastAPI con uvicorn en modo recarga automática (puerto `8010`)

La primera ejecución tarda unos minutos porque descarga las imágenes base e instala dependencias. El backend espera automáticamente a que PostgreSQL esté listo y sincroniza el esquema de la base de datos.

### 3. Verificar que todo esté corriendo

```bash
make ps
```

Debes ver dos contenedores en estado `Up`:

| Contenedor   | Puerto       | Descripción                    |
|--------------|--------------|--------------------------------|
| `catastro_db`  | `5477:5432`  | PostgreSQL 15 + PostGIS 3.3   |
| `catastro_api` | `8010:8000`  | FastAPI (uvicorn --reload)     |

Abre tu navegador en:
- **Landing Page**: [http://localhost:8010](http://localhost:8010)
- **Visor Cartográfico**: [http://localhost:8010/visor](http://localhost:8010/visor)
- **API Status**: [http://localhost:8010/api/status](http://localhost:8010/api/status)

### 4. Poblar la base de datos con datos reales

Una vez que los contenedores están corriendo, debes cargar los datos catastrales. Hay dos opciones:

#### Opción A — Ingesta Real desde OpenStreetMap (24 ciudades de Perú y Latinoamérica)

Este script consulta la Overpass API de OpenStreetMap y descarga los polígonos de edificios para 24 zonas metropolitanas. **Requiere conexión a internet** y puede tomar entre 5 y 15 minutos dependiendo de la velocidad de la API.

```bash
docker exec -it catastro_api python ingest_peru_cities.py
```

Este comando:
1. Consulta Overpass API con retry automático y cooldown para evitar bloqueos
2. Descarga los datos vectoriales crudos de cada ciudad
3. Procesa los polígonos, los transforma a UTM 19S y los inyecta en `tg_lote`
4. Reconstruye el PGM-Index automáticamente al finalizar

Las ciudades incluidas son: Lima, Arequipa, Cusco, Puno, Juliaca, Trujillo, Chiclayo, Piura, Huancayo, Iquitos, Chimbote, Tacna, Ica, Pucallpa, Cajamarca, Ayacucho, Tarapoto, Tumbes, Bogotá, Santiago, Buenos Aires, Quito, La Paz, Medellín, Guadalajara y Ciudad de México.

#### Opción B — Poblado Procedural Offline (instantáneo, sin conexión)

Si no tienes acceso a internet o necesitas datos de prueba rápidos:

```bash
docker exec -it catastro_api python populate_all_cities.py
```

Este script toma los datos semilla de Puno y genera polígonos sintéticos para 18 ciudades peruanas aplicando traslaciones, rotaciones y deformaciones aleatorias. Se ejecuta en menos de un minuto.

#### Opción C — Ingesta Local (solo Puno)

Para pruebas rápidas solo con la ciudad de Puno:

```bash
docker exec -it catastro_api python ingest_data.py
docker exec -it catastro_api python load_to_db.py
```

### 5. Escalar la base de datos (opcional)

Para pruebas de estrés del PGM-Index con más de 500,000 registros:

```bash
docker exec -it catastro_api python scale_db.py
```

Este script multiplica por 7 los registros existentes, creando clones desplazados en cuadrantes vecinos para simular crecimiento urbano.

---

## 🧰 Comandos del Makefile

| Comando          | Acción                                                  |
|------------------|---------------------------------------------------------|
| `make up`        | Construye y levanta los contenedores en segundo plano   |
| `make down`      | Detiene y elimina los contenedores y redes              |
| `make restart`   | `down` + `up` (reinicio completo)                       |
| `make ps`        | Muestra el estado de los contenedores                   |
| `make logs`      | Sigue los logs del backend FastAPI en tiempo real       |
| `make shell`     | Abre una terminal Bash dentro del contenedor `catastro_api` |

---

## 🗄️ Pipeline de Ingesta (ETL) — Detalle Técnico

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

## 📡 Endpoints de la API

FastAPI gestiona rutas limpias sin extensiones multimedia redundantes:

| Método   | Ruta                         | Descripción                                                                 |
|----------|------------------------------|-----------------------------------------------------------------------------|
| `GET`    | `/`                          | Landing Page principal con simulador de depuración                         |
| `GET`    | `/visor`                     | Visor Cartográfico interactivo Leaflet                                     |
| `GET`    | `/api/status`                | Métricas de RAM, disco, lotes, tiempo de entrenamiento y EPS               |
| `GET`    | `/api/lotes/`                | GeoJSON filtrable por BBox con simplificación dinámica por zoom            |
| `GET`    | `/api/lotes/random`          | Lote aleatorio con geometría completa, centroide y ciudad                  |
| `GET`    | `/api/lotes/{id_lote}`       | Lote por código catastral de 14 dígitos                                    |
| `GET`    | `/api/search/rtree`          | Búsqueda espacial con R-Tree de PostGIS (GiST)                    |
| `GET`    | `/api/search/learned`        | Búsqueda con PGM-Index + Hilbert (índice aprendido)                        |
| `POST`   | `/api/cache/flush`           | Reinicia el contenedor PostgreSQL (cold cache para benchmarks)             |
| `POST`   | `/api/benchmark`             | Benchmark masivo R-Tree vs PGM-Index con resumen estadístico               |
| `POST`   | `/api/search/retrain`        | Reconstruye el PGM-Index desde cero                                        |

---

## 🗃️ Modelo de Datos: `tg_lote`

| Columna              | Tipo                    | Descripción                                                   |
|----------------------|-------------------------|---------------------------------------------------------------|
| `id_lote`            | `VARCHAR(14)` PK        | Identificador alfanumérico único del lote urbano              |
| `area_grafica`       | `FLOAT`                 | Área del polígono en m² (`ST_Area`)                           |
| `peri_grafico`       | `FLOAT`                 | Perímetro del polígono en m lineales (`ST_Perimeter`)         |
| `fech_actua`         | `DATE`                  | Fecha del último registro o actualización                     |
| `objcad_lote_gemo`   | `GEOMETRY(Polygon, 32719)` | Columna geométrica PostGIS en el sistema UTM Zona 19S   |

---

## ⚡ Simulación de Depuración Visual ("Modo Debug")

El ecosistema incorpora simuladores ralentizados paso a paso para auditar el funcionamiento interno de las búsquedas del R-Tree de PostGIS (GiST) y del PGM-Index:

* **En la Landing Page (Index)**: Genera y despliega horizontalmente tres tarjetas cuadradas dinámicas que abarcan todo el Hero. Muestran los SVGs de las cajas MBR y métricas reales del lote consultado (MBR Área, Candidatos, Operador espacial `ST_Overlap` / `ST_Contains` y Tiempos de búsqueda).
* **En el Visor Cartográfico (Mapa)**: Si se activa el switch `[ ] debug`, Leaflet ralentiza el vuelo y ejecuta un escaneo espacial visual:
  1. Vuela a escala macro (`zoom: 15`) y dibuja el MBR del nodo raíz **N0** en morado.
  2. Atenúa el cuadro anterior, vuela a nivel de manzana (`zoom: 17`) y dibuja el MBR **N1** en cian.
  3. Hace zoom al predio (`zoom: 19`), atenúa el MBR y resalta el polígono real del lote **N2** en verde neón, abriendo automáticamente sus detalles catastrales.

---

## 📊 Resultados y Benchmarks Reales (N = 392,513 lotes)

Los resultados de las pruebas experimentales ejecutadas sobre el dataset catastral consolidado arrojan las siguientes métricas de rendimiento comparativo:

### 💻 Entorno de Pruebas (Hardware & Software)

Todas las simulaciones y benchmarks comparativos se llevaron a cabo utilizando la siguiente configuración física de hardware y software relevante:
*   **Procesador (CPU):** Intel Core Ultra 5 245KF (frecuencia base de 4.20 GHz, frecuencia turbo máxima de 5.20 GHz)
*   **Memoria RAM:** 32 GB (2 $\times$ 16 GB) Kingston Fury Beast DDR5 a 5600 MHz (CL40) en arquitectura Dual Channel
*   **Almacenamiento (SSD):** SSD Kingston NV3 de 1 TB M.2 PCIe 4.0 NVMe
*   **Sistema Operativo:** Windows 11 Pro (64 bits)
*   **Base de Datos:** PostgreSQL 15 espacialmente extendido con PostGIS 3.3

---

### 💾 Consumo de Memoria Estructural
* **Índice Espacial PostGIS (GiST)**: `16.25 MB`
* **Índice Aprendido (PGM-Index en RAM)**: `6.33 MB` (¡Un **ahorro del 61.05%** en memoria RAM física!).
  * *Nota de Ingeniería*: Esta huella en Python (`6.33 MB`) incluye la sobrecarga (overhead) de tipos e intérprete; una representación binaria pura en bajo nivel (C/C++) ocuparía teóricamente solo **585 KB** ($14,977 \text{ segmentos} \times 40 \text{ bytes}$), logrando una reducción del **96.4%**.
* **Tamaño en Disco de la Tabla (`tg_lote`)**: `79.70 MB`
* **Tiempo de Entrenamiento del PGM-Index**: `5.64 segundos`

<p align="center"><img src="src/web/assets/figura2_memoria.png" alt="Comparación de consumo de memoria RAM" width="520" /></p>

### ⚡ Tiempos de Búsqueda y Latencias

#### Warm Cache (GiST en RAM, 1,000 consultas)
* **Latencia Promedio R-Tree (PostGIS GiST)**: `0.6737 ms` (673.73 µs)
* **Latencia Promedio Learned (PGM + Hilbert)**: `0.0196 ms` (**19.57 µs**)
* **Factor de Aceleración Promedio (Speedup)**: **36.93$\times$ más rápido**
* **Pasos Promedio en la Búsqueda Binaria Local**: `2.27` accesos de clave en memoria RAM

#### Cold Cache (PostgreSQL reiniciado entre cada consulta, 10 consultas)
* **Latencia Promedio R-Tree (PostGIS GiST)**: `8.24 ms` (disco + shared_buffers vacíos)
* **Latencia Promedio Learned (PGM + Hilbert)**: `0.033 ms` (**33 µs**)
* **Factor de Aceleración Promedio (Speedup)**: **315$\times$ más rápido**
* El speedup es mayor en cold cache porque el PGM-Index nunca toca disco (solo hace proyección UTM en PostgreSQL, que es una operación CPU-bound sin I/O espacial).

<p align="center">
  <img src="src/web/assets/figura4_latencia.png" alt="Comparativa de Latencia de Consultas" width="370" style="margin-right: 15px;" />
  <img src="src/web/assets/figura3_sensibilidad.png" alt="Análisis de Sensibilidad (Epsilon)" width="370" />
</p>

### 📊 Validación Estadística Rigurosa (N = 1,000)

Para corroborar científicamente la ventaja del Learned Index frente a PostGIS, se realizó una validación estadística formal sobre una muestra aleatoria pareada de 1,000 búsquedas:

| Estructura | Media (ms) | Mediana (ms) | Desv. Est. (ms) | Mínimo (ms) | Máximo (ms) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **R-Tree (PostGIS GiST)** | 0.6737 | 0.6395 | 0.2385 | 0.2452 | 3.1884 |
| **PGM-Index (Learned)** | 0.0196 | 0.0180 | 0.0096 | 0.0094 | 0.2252 |

*   **Aceleración Media (Speedup):** **36.93x** (Mediana: **34.48x**, Máxima: **128.29x**).
*   **Prueba de Hipótesis (Wilcoxon Signed-Rank):** Los tiempos de consulta no siguen una distribución normal (Shapiro-Wilk $p < 0.05$, $p_R = 7.62 \times 10^{-36}$, $p_P = 8.30 \times 10^{-49}$). Se aplicó la prueba no paramétrica de Wilcoxon pareada, obteniendo un valor estadístico de **0.00** y un **p-valor de $3.33 \times 10^{-165}$**, lo que confirma de forma categórica que la aceleración del PGM-Index es estadísticamente significativa ($p < 0.001$).

<p align="center">
  <img src="src/web/assets/figura_boxplot.png" alt="Boxplot Comparativo de Latencias (Escala Logarítmica)" width="480" />
</p>

---

## 🔬 Benchmark Masivo Secreto

La Landing Page incluye un **benchmark masivo oculto** accesible haciendo **3 clics sobre el logo de Catastro LI** en menos de 2 segundos. Este modal permite:

- Ejecutar hasta 2,000 consultas aleatorias contra ambos motores (R-Tree y PGM-Index)
- Modo **caché frío (cold cache)**: reinicia PostgreSQL antes de cada consulta para mediciones académicas limpias
- Resumen estadístico (media, mediana, p50, p90, p95, p99, desviación estándar)
- Descarga de resultados en CSV y JSON

---

## 🛠️ Instalación Local (Desarrollo Manual)

Si prefieres ejecutar el entorno fuera de Docker:

### Requisitos Previos

- Python 3.11+
- PostgreSQL 15 con PostGIS 3.3
- GEOS, PROJ y GDAL instalados en el sistema

### Pasos

1. **Clonar y crear el entorno virtual**:
   ```bash
   git clone https://github.com/RAlexander777/CATASTRO_LI.git
   cd CATASTRO_LI
   python -m venv venv
   source venv/bin/activate  # En Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

2. **Configurar la base de datos**:
   Crea una base de datos PostgreSQL con PostGIS habilitado:
   ```bash
   createdb catastro_li
   psql -d catastro_li -c "CREATE EXTENSION postgis;"
   ```

3. **Archivo `.env`**:
   ```env
   DATABASE_URL=postgresql://usuario:contraseña@localhost:5432/catastro_li
   ```

4. **Cargar datos**:
   ```bash
   python ingest_peru_cities.py    # Opción A: 24 ciudades reales
   # o
   python populate_all_cities.py    # Opción B: 18 ciudades procedurales
   # o
   python ingest_data.py && python load_to_db.py  # Opción C: solo Puno
   ```

5. **Iniciar el servidor**:
   ```bash
   uvicorn src.main:app --reload
   ```

   Abre [http://localhost:8000](http://localhost:8000) en tu navegador.

---

## 📄 Licencia

Este proyecto está bajo la **Licencia MIT**. Consulta el archivo [LICENSE](LICENSE) para más detalles.

---

## 🤝 Créditos y Contacto

**Catastro LI** fue desarrollado íntegramente por:

<p align="center">
  <strong>Rodrigo Alexander Becerra Lucano</strong><br />
  <em>Doctorando en Ciencia de la Computación</em><br />
  Universidad Nacional del Altiplano — Puno, Perú
</p>

<p align="center">
  <a href="https://www.linkedin.com/in/rodrigo-alexander-becerra-lucano-268a8121a/" target="_blank" rel="noopener">
    <img src="https://img.shields.io/badge/LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white" alt="LinkedIn" />
  </a>
  &nbsp;
  <a href="https://github.com/RAlexander777/CATASTRO_LI" target="_blank" rel="noopener">
    <img src="https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white" alt="GitHub" />
  </a>
</p>

---

## 📝 Citación / Cómo Citar

Si utilizas este software o los resultados de esta investigación en tu trabajo académico, por favor cítalo utilizando el siguiente formato BibTeX:

```bibtex
@software{becerra_lucano_catastro_li_2026,
  author       = {Becerra Lucano, Rodrigo Alexander},
  title        = {Catastro LI: Ecosistema Híbrido de Analítica Espacial y Gestión Catastral con Learned Indexes},
  year         = {2026},
  publisher    = {GitHub},
  journal      = {GitHub Repository},
  howpublished = {\url{https://github.com/RAlexander777/CATASTRO_LI}}
}
```
