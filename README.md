# Catastro_LI: Ecosistema Híbrido de Analítica Espacial y Learned Indexes

Estructura de indexación predictiva aplicada a la optimización de consultas vectoriales en sistemas catastrales web, integrando la reducción dimensional de curvas de llenado de espacio con el paradigma de modelos aprendidos dinámicos.

---

## 💡 Resumen del Proyecto

Este ecosistema web de demostración evalúa y confronta el rendimiento de las estructuras de datos jerárquicas tradicionales frente a los modelos de aprendizaje automático aplicados a la indexación física. El núcleo de la investigación reside en la transformación de geometrías vectoriales complejas (polígonos del estándar OGC Simple Features) en representaciones unidimensionales mediante la Curva de Hilbert, permitiendo que el índice aprendido **PGM (Piecewise Geometric Model)** aprenda la función de distribución acumulada (CDF) de los datos espaciales. 

A través de modelos de regresión lineal por tramos (PLR) con cotas de error máximo garantizadas ($\epsilon$), el sistema realiza aproximaciones directas a las posiciones en memoria con complejidad temporal acotada, desafiando el rendimiento y el consumo de almacenamiento de la familia R-Tree (GiST) tradicional.

---

## 📑 Sustento Teórico e Investigación

El desarrollo y fundamentación de este ecosistema se basa en la convergencia de las siguientes vertientes científicas:

### 1. Paradigma de Índices Aprendidos (Learned Indexes) & PGM
* **Kraska, T., Beutel, A., Chi, E. H., Dean, J., & Polyzotis, N. (2018).** *The case for learned index structures.* In Proceedings of the ACM SIGMOD, 489-504.
  * *Sustento:* Introducción fundacional al reemplazo de estructuras de datos jerárquicas tradicionales por funciones de distribución para predecir posiciones físicas de almacenamiento.
* **Ferragina, P., & Vinciguerra, G. (2020).** *The PGM-index: a fully-dynamic learned index with provable worst-case bounds.* Proceedings of the VLDB Endowment, 13(9), 1162-1175.
  * *Sustento:* Implementación de Regresión Lineal por Tramos (PLR) con cotas de error máximo garantizadas ($\epsilon$) mediante algoritmos óptimos de construcción en tiempo lineal.

### 2. Índices Aprendidos Espaciales (Spatial Learned Indexes)
* **Nathan, V., Ding, J., Alizadeh, M., & Kraska, T. (2020).** *Learning multi-dimensional indexes.* In Proceedings of the ACM SIGMOD, 985-1000.
  * *Sustento:* Demostración de la adaptabilidad de índices multidimensionales predictivos (*Flood*) frente a *Grid Files* o *R-Trees* en consultas de rango.
* **Kipf, A., Ryan, M., Varley, R., Marcus, R., & Kraska, T. (2019).** *SageDB: A learned database system.* In dblp computer science bibliography.
  * *Sustento:* Integración de curvas de llenado de espacio y modelos analíticos dentro del diseño de un motor de bases de datos relacionales multidimensionales.

### 3. Familia R-Tree y Estructuras Jerárquicas
* **Guttman, A. (1984).** *R-trees: A dynamic index structure for spatial searching.* In Proceedings of the ACM SIGMOD, 47-57.
  * *Sustento:* Origen de la indexación por Cajas de Contorno Mínimo (MBR) y algoritmos de partición espacial jerárquica.
* **Beckmann, N., Kriegel, H. P., Schneider, R., & Seeger, B. (1990).** *The R\*-tree: An efficient and robust access method for points and rectangles.* In Proceedings of the ACM SIGMOD, 322-331.
  * *Sustento:* Optimización de solapamientos (*overlap*) y utilización del espacio mediante el algoritmo de reinserción forzada.
* **Sellis, T., Roussopoulos, N., & Faloutsos, C. (1987).** *The R+-Tree: A dynamic index for multi-dimensional objects.* In Proceedings of the 13th VLDB, 507-518.
  * *Sustento:* Particionamiento con cero solapamiento entre nodos hermanos mediante fragmentación analítica de geometrías.

### 4. Reducción Dimensional y Curvas de Llenado de Espacio (SFC)
* **Kamel, I., & Faloutsos, C. (1994).** *Hilbert R-tree: An improved R-tree using fractals.* In Proceedings of the 20th VLDB, 500-509.
  * *Sustento:* Unificación del ordenamiento fractal de la curva de Hilbert previo a la estructuración de objetos geométricos bidimensionales para optimizar la agrupación espacial.
* **Moon, B., Jagadish, H. V., Faloutsos, C., & Saltz, J. H. (2001).** *Analysis of the clustering properties of the Hilbert space-filling curve.* IEEE Transactions on Knowledge and Data Engineering, 13(1), 124-141.
  * *Sustento:* Demostración matemática de la superioridad de la curva de Hilbert en la preservación de la localidad de vecindad bidimensional frente a alternativas como *Z-Order*.

### 5. Estándares GIS Aplicados
* **Herring, J. R. (2011).** *OpenGIS implementation standard for geographic information - Simple feature access - Part 1: Common architecture.* Open Geospatial Consortium (OGC).
  * *Sustento:* Estándar internacional para el almacenamiento, manipulación y operadores topológicos de geometrías vectoriales bajo formato binario *Well-Known Binary* (WKB).

---

## 🛠️ Arquitectura Tecnológica

El ecosistema está construido bajo un enfoque modular de alto rendimiento y bajo consumo de recursos:

* **Backend core:** Python, FastAPI, SQLAlchemy.
* **Motor Espacial Tradicional:** PostgreSQL / PostGIS (Infraestructura GiST implementando R-Tree jerárquico).
* **Capa Predictiva:** Algoritmo PGM-Index personalizado acoplado a un codificador nativo de la Curva de Hilbert para reducción dimensional en el plano continuo.
* **Frontend interactivo:** Componentes reactivos minimalistas con visualización cartográfica vectorial en tiempo real mediante canvas interactivos y animaciones SVG de trazo de nodos.

---

## 🖥️ Módulos de la Aplicación de Demostración

### 🎮 Interfaz de Consulta e Indexación en Vivo
* **Visualización Vectorial:** Renderizado inmediato de parcelas catastrales a partir de su formato geométrico, permitiendo inspeccionar metadatos de georreferenciación y cadenas de datos espaciales crudos (WKT/WKB).
* **Simulador de Depuración (Modo Debug):** Módulo de simulación animada paso a paso que contrasta la ejecución interna de ambas estructuras en tiempo real:
  * *R-Tree (GiST):* Ilustra de forma gráfica la evaluación jerárquica de MBRs y la poda de ramas no coincidentes en el árbol.
  * *Hilbert + PGM:* Grafica la reducción dimensional en la traza de la curva fractal y simula gráficamente el "salto" predictivo del modelo de regresión por tramos dentro del rango acotado por $\epsilon$.

### 📊 Tablero de Confrontación (Benchmark)
* Mapeo simultáneo y contraste directo entre el ecosistema predictivo y el almacenamiento relacional clásico bajo métricas explícitas de:
  * Tiempo de respuesta del índice en microsegundos ($ms$).
  * Complejidad de espacio y tamaño estructural en disco/memoria ($MB$).
  * Cantidad de operaciones de accesos a páginas y nodos evaluados por consulta.

### 📖 Entorno de Referencia Teórica (Wiki Contextual)
* Espacio interactivo integrado en la UI que documenta el comportamiento matemático de los algoritmos de división (*splits*), el rol de la interfaz GiST como plantilla en motores relacionales, las propiedades fractales de agrupación de vecindad y la optimización de las funciones de distribución acumulada en bases de datos.

---

## 🚀 Instalación y Despliegue

```bash
# Clonar el repositorio institucional
git clone [https://github.com/usuario/catastro_li.git](https://github.com/usuario/catastro_li.git)
cd catastro_li

# Configurar el entorno virtual del backend
python -m venv venv
source venv/bin/activate  # En Linux
pip install -r requirements.txt

# Inicializar las variables de entorno para la base de datos catastral
cp .env.example .env

# Levantar el entorno de desarrollo backend
uvicorn app.main:app --reload