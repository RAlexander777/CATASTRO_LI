// Renderer Canvas — dramáticamente más eficiente que SVG para >500 geometrías
const canvasRenderer = L.canvas({ padding: 0.5 });

// Inicializar el mapa
const map = L.map('map', {
    zoomControl: false,
    preferCanvas: true,
    renderer: canvasRenderer,
    maxZoom: 22
}).setView([-15.8402, -70.0219], 13);

// Añadir control de zoom en una posición más discreta
L.control.zoom({ position: 'bottomright' }).addTo(map);

// ── Color de lotes (estado global, modificado por los pickers del panel) ──
let currentStrokeColor = "#818cf8";
let currentFillColor   = "#3730a3";
let currentFillOpacity = 0.40;


// Estilos de Mapas Base definidos
const MAP_STYLES = {
    dark: {
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        attrib: '© OpenStreetMap contributors, © CartoDB',
        maxZoom: 22,
        maxNativeZoom: 20
    },
    satellite: {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attrib: 'Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        maxZoom: 22,
        maxNativeZoom: 17 // Esri World Imagery tiene zoom nativo máximo de 17 en la zona de Puno. Más arriba, Leaflet re-escalará digitalmente las fotos aéreas.
    },
    osm: {
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attrib: '© OpenStreetMap contributors',
        maxZoom: 22,
        maxNativeZoom: 19
    },
    light: {
        url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        attrib: '© OpenStreetMap contributors, © CartoDB',
        maxZoom: 22,
        maxNativeZoom: 20
    }
};

// Añadir la capa base por defecto (CartoDB Dark)
let baseTileLayer = L.tileLayer(MAP_STYLES.dark.url, {
    maxZoom: MAP_STYLES.dark.maxZoom,
    maxNativeZoom: MAP_STYLES.dark.maxNativeZoom,
    attribution: MAP_STYLES.dark.attrib
}).addTo(map);

// Crear panel informativo personalizado en el mapa
const infoControl = L.control({ position: 'topright' });
infoControl.onAdd = function (map) {
    const div = L.DomUtil.create('div', 'map-info-panel-retro');
    div.innerHTML = `
        <span id="info-msg">> inicializando_visor...</span>
        
        <!-- Representación de la Traza de Búsqueda R-Tree en el Visor -->
        <div class="r-tree-traversal-widget" style="margin-top: 0.5rem; background: rgba(9, 13, 22, 0.95); border: 1px solid rgba(129, 140, 248, 0.25); box-shadow: 0 4px 15px rgba(0,0,0,0.5);">
            <div class="traversal-title">> r_tree_traversal_trace:</div>
            <div class="traversal-nodes">
                <div class="traversal-node" id="r-tree-n0">
                    <span class="node-bullet n0-bullet"></span>
                    <div class="node-text">
                        <span class="node-index">N0</span>
                        <span class="node-level">Raíz</span>
                        <span class="node-meta" id="n0-meta">macro_bbox</span>
                    </div>
                </div>
                <div class="traversal-connector" id="r-tree-c0"></div>
                <div class="traversal-node" id="r-tree-n1">
                    <span class="node-bullet n1-bullet"></span>
                    <div class="node-text">
                        <span class="node-index">N1</span>
                        <span class="node-level">Manzana</span>
                        <span class="node-meta" id="n1-meta">sector_cluster</span>
                    </div>
                </div>
                <div class="traversal-connector" id="r-tree-c1"></div>
                <div class="traversal-node" id="r-tree-n2">
                    <span class="node-bullet n2-bullet"></span>
                    <div class="node-text">
                        <span class="node-index">N2</span>
                        <span class="node-level">Predio</span>
                        <span class="node-meta" id="n2-meta">lote_id</span>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Evitar que hacer clic en el panel active eventos del mapa Leaflet
    L.DomEvent.disableClickPropagation(div);
    
    return div;
};
infoControl.addTo(map);

// Capa contenedora para los lotes y geometrías del catastro
// Función auxiliar de máquina de escribir estilo terminal retro
function animarTextoTerminal(elemento, texto, duracion = 200) {
    if (!elemento) return;
    elemento.style.opacity = "0.7";
    let i = 0;
    const intervalTime = Math.max(8, duracion / (texto.length || 1));
    const timer = setInterval(() => {
        elemento.textContent = texto.substring(0, i) + (i < texto.length ? "█" : "");
        i++;
        if (i > texto.length) {
            clearInterval(timer);
            elemento.style.opacity = "1";
        }
    }, intervalTime);
}

const lotesLayer = L.geoJSON(null, {
    renderer: canvasRenderer,
    style: function () {
        // Siempre usa los colores definidos por el usuario
        return {
            color:       currentStrokeColor,
            weight:      1.5,
            fillColor:   currentFillColor,
            fillOpacity: currentFillOpacity
        };
    },
    onEachFeature: function (feature, layer) {
        // Micro-interacción: Iluminación Cian al pasar el cursor (Hover Glow Effect)
        layer.on('mouseover', function (e) {
            if (highlightLoteId && feature.properties.id_lote === highlightLoteId) return;
            layer.setStyle({
                color:       "#22d3ee", // Cian neón
                weight:      2.5,
                fillColor:   "#22d3ee",
                fillOpacity: Math.min(0.95, currentFillOpacity + 0.35)
            });
        });

        layer.on('mouseout', function (e) {
            if (highlightLoteId && feature.properties.id_lote === highlightLoteId) return;
            layer.setStyle({
                color:       currentStrokeColor,
                weight:      1.5,
                fillColor:   currentFillColor,
                fillOpacity: currentFillOpacity
            });
        });

        layer.on('click', function (e) {
            L.DomEvent.stopPropagation(e);
            // Resaltar el lote seleccionado, restaurando los demás al color del usuario
            lotesLayer.eachLayer(l => {
                l.setStyle({
                    color:       currentStrokeColor,
                    fillColor:   currentFillColor,
                    fillOpacity: currentFillOpacity * 0.5,
                    weight:      1.5
                });
            });
            layer.setStyle({
                color:       "#f59e0b",
                fillColor:   "#f59e0b",
                fillOpacity: 0.5,
                weight:      3
            });
            highlightLoteId = feature.properties.id_lote;
            abrirLoteModal(feature.properties.id_lote);
        });
    }
}).addTo(map);

// Lógica de control para el Modal de Detalles del Lote
function cerrarLoteModal() {
    const modal = document.getElementById("lote-modal");
    if (modal) modal.classList.remove("active");
}

window.cerrarLoteModal = cerrarLoteModal;

async function abrirLoteModal(idLote) {
    const modal = document.getElementById("lote-modal");
    const placeholder = document.getElementById("modal-lote-placeholder");
    const polygon = document.getElementById("modal-lote-polygon");
    
    if (modal) modal.classList.add("active");
    if (placeholder) placeholder.textContent = "> cargando_geometria...";
    if (polygon) polygon.setAttribute("points", "");
    
    // Limpiar campos informativos
    document.getElementById("modal-pres-id").textContent = "-";
    document.getElementById("modal-pres-area").textContent = "-";
    document.getElementById("modal-pres-peri").textContent = "-";
    document.getElementById("modal-pres-coords").textContent = "-";
    document.getElementById("modal-pres-ciudad").textContent = "-";
    
    try {
        const response = await fetch(`/api/lotes/${idLote}`);
        if (!response.ok) throw new Error("No se pudo obtener información del lote.");
        const data = await response.json();
        
        // Carga progresiva con máquina de escribir terminal
        animarTextoTerminal(document.getElementById("modal-pres-id"), data.id_lote, 200);
        
        const areaText = data.area_grafica ? Number(data.area_grafica).toFixed(2) + " m²" : "N/D";
        animarTextoTerminal(document.getElementById("modal-pres-area"), areaText, 150);
        
        const periText = data.peri_grafico ? Number(data.peri_grafico).toFixed(2) + " m" : "N/D";
        animarTextoTerminal(document.getElementById("modal-pres-peri"), periText, 150);
        
        const coordsText = data.center ? `${Number(data.center.lat).toFixed(5)}, ${Number(data.center.lon).toFixed(5)}` : "N/D";
        animarTextoTerminal(document.getElementById("modal-pres-coords"), coordsText, 250);
        
        animarTextoTerminal(document.getElementById("modal-pres-ciudad"), data.ciudad || "Sector Sintético", 180);
        
        // Actualizar HUD de rendimiento con la velocidad de búsqueda
        const searchTime = data.execution_time_ms ? Number(data.execution_time_ms) : 0.145;
        actualizarHudRendimiento(searchTime);
        
        // Visualizar niveles del árbol R-Tree (Bounding Boxes MBR)
        visualizarBusquedaRTree(data.center, data.geom);
        
        // Animar árbol de traza R-Tree en el panel flotante
        animarTrazaRTree(data);
        
        const modalGlowWrap = document.getElementById("modal-lote-glow-wrap");
        if (modalGlowWrap) {
            modalGlowWrap.classList.remove("glow-active");
            void modalGlowWrap.offsetWidth;
            modalGlowWrap.classList.add("glow-active");
        }
        
        renderizarModalSVG(data.geom);
        
    } catch (error) {
        console.error("Error al recuperar detalles del lote:", error);
        if (placeholder) placeholder.textContent = "> error_de_comunicacion";
    }
}

function renderizarModalSVG(geom) {
    const placeholder = document.getElementById("modal-lote-placeholder");
    const polygon = document.getElementById("modal-lote-polygon");
    
    if (!geom || geom.type !== "Polygon" || !geom.coordinates || geom.coordinates.length === 0) {
        if (placeholder) placeholder.textContent = "Sin geometría";
        return;
    }
    
    const coordinates = geom.coordinates[0];
    if (coordinates.length < 3) return;
    
    let min_x = Infinity, max_x = -Infinity;
    let min_y = Infinity, max_y = -Infinity;
    
    coordinates.forEach(p => {
        if (p[0] < min_x) min_x = p[0];
        if (p[0] > max_x) max_x = p[0];
        if (p[1] < min_y) min_y = p[1];
        if (p[1] > max_y) max_y = p[1];
    });
    
    const w = max_x - min_x;
    const h = max_y - min_y;
    
    const size = 240;
    const padding = 30;
    const drawSize = size - 2 * padding;
    
    // Escala uniforme para mantener la relación de aspecto
    const max_dim = Math.max(w, h) || 1;
    const scale = drawSize / max_dim;
    
    // Calcular offsets para centrar el lote en el lienzo de 240x240
    const offsetX = padding + (drawSize - w * scale) / 2;
    const offsetY = padding + (drawSize - h * scale) / 2;
    
    const points = coordinates.map(p => {
        const x = offsetX + (p[0] - min_x) * scale;
        // Invertir eje Y para la visualización del SVG (min_y queda abajo, max_y arriba)
        const y = size - (offsetY + (p[1] - min_y) * scale);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    
    if (polygon) {
        polygon.setAttribute("points", points);
    }
    if (placeholder) {
        placeholder.textContent = "";
    }
}

// Controlador de abortos para evitar colisiones de peticiones cruzadas al mover el mapa rápidamente
let activeAbortController = null;

// Variable global para destacar un lote específico buscado en la introducción
let highlightLoteId = null;

// Función para cargar los lotes intersectados por el Bounding Box de la pantalla
async function cargarLotesPorViewport() {
    const zoom = map.getZoom();
    const infoMsg = document.getElementById("info-msg");
    
    // Si la cámara está muy alejada, no cargamos geometría para evitar colapso de red
    if (zoom < 15) {
        lotesLayer.clearLayers();
        limpiarVisualizacionRTree();
        if (infoMsg) {
            infoMsg.innerHTML = '> acerca_mapa (Zoom >= 15) para cargar lotes';
        }
        return;
    }
    
    if (infoMsg) {
        infoMsg.innerHTML = `> renderizando_lotes...`;
    }
    
    // Cancelar la petición previa si aún está en curso
    if (activeAbortController) {
        activeAbortController.abort();
    }
    activeAbortController = new AbortController();
    const signal = activeAbortController.signal;
    
    try {
        const bounds = map.getBounds();
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();
        
        // Parámetros BBox geográficos y Zoom para simplificación en PostGIS
        const url = `/api/lotes/?min_lat=${sw.lat}&min_lon=${sw.lng}&max_lat=${ne.lat}&max_lon=${ne.lng}&zoom=${zoom}`;
        
        const response = await fetch(url, { signal });
        if (!response.ok) throw new Error('Error al consultar el servicio catastral');
        const data = await response.json();
        
        // Inyectar el nuevo set de geometrías
        lotesLayer.clearLayers();
        lotesLayer.addData(data);
        
        // Asegurar que las cajas del R-Tree queden en primer plano y no se tapen
        rTreeVisualLayers.forEach(layer => {
            if (layer && typeof layer.bringToFront === 'function') {
                layer.bringToFront();
            }
        });
        
        // Destacar el lote buscado si se encuentra en este viewport
        if (highlightLoteId) {
            lotesLayer.eachLayer((layer) => {
                if (layer.feature && layer.feature.properties && layer.feature.properties.id_lote === highlightLoteId) {
                    // Abrir popup de forma diferida para dar tiempo a Leaflet
                    setTimeout(() => {
                        layer.openPopup();
                    }, 300);
                    
                    // Aplicar estilo de destaque (borde rojo brillante)
                    layer.setStyle({
                        color: "#ef4444",
                        weight: 3.5,
                        fillColor: "#ef4444",
                        fillOpacity: 0.65
                    });
                }
            });
        }
        
        if (infoMsg) {
            const count = data.features ? data.features.length : 0;
            infoMsg.innerHTML = `> ${count} lotes cargados (z: ${zoom})`;
        }
        
        // Ocultar el protector de carga una vez renderizados los nuevos lotes
        const loader = document.getElementById("map-loader");
        if (loader) {
            setTimeout(() => loader.classList.remove("active"), 450);
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            return; // Ignorar el aborto controlado
        }
        console.error("Error al recuperar el catastro gráfico:", error);
        if (infoMsg) {
            infoMsg.innerHTML = '> error_recuperar_catastro';
        }
        // Ocultar el protector en caso de error
        const loader = document.getElementById("map-loader");
        if (loader) {
            setTimeout(() => loader.classList.remove("active"), 450);
        }
    }
}

// Inicializar el visor enfocando la extensión general de datos o coordenadas de búsqueda
async function inicializarVisor() {
    const infoMsg = document.getElementById("info-msg");
    
    // Leer parámetros de la URL de búsqueda (si existen)
    const urlParams = new URLSearchParams(window.location.search);
    const urlLat = parseFloat(urlParams.get("lat"));
    const urlLon = parseFloat(urlParams.get("lon"));
    const urlZoom = parseInt(urlParams.get("zoom")) || 17;
    const urlId = urlParams.get("id");
    
    if (urlId) {
        highlightLoteId = urlId;
    }
    
    // Si se especifican coordenadas en la URL, enfocar directamente
    if (!isNaN(urlLat) && !isNaN(urlLon)) {
        map.setView([urlLat, urlLon], urlZoom);
        map.on('moveend', cargarLotesPorViewport);
        await cargarLotesPorViewport();
        return;
    }
    
    // Por defecto, posicionar la cámara en Puno Centro (SRID 32719 zona de interés)
    map.setView([-15.8402, -70.0219], 16);
    
    // Asegurar que el selector de la UI esté sincronizado con Puno
    const citySelector = document.getElementById("city-selector");
    if (citySelector) {
        citySelector.value = "puno";
    }
    
    map.on('moveend', cargarLotesPorViewport);
    cargarLotesPorViewport();
}

// Mapeo de coordenadas de ciudades para la navegación rápida
const CITY_COORDS = {
    puno: [-15.8402, -70.0219],
    arequipa: [-16.400, -71.537],
    cusco: [-13.518, -71.978],
    lima: [-12.046, -77.035],
    trujillo: [-8.110, -79.030],
    chiclayo: [-6.775, -79.840],
    piura: [-5.195, -80.630],
    iquitos: [-3.748, -73.250],
    pucallpa: [-8.382, -74.550],
    ayacucho: [-13.160, -74.225],
    huancayo: [-12.060, -75.210],
    chimbote: [-9.075, -78.580],
    tacna: [-18.015, -70.250],
    juliaca: [-15.495, -70.130],
    ica: [-14.065, -75.735],
    cajamarca: [-7.160, -78.510],
    tarapoto: [-6.485, -76.365],
    tumbes: [-3.570, -80.450],
    bogota: [4.605, -74.100],
    santiago: [-33.435, -70.650],
    buenosaires: [-34.600, -58.400],
    quito: [-0.205, -78.500],
    lapaz: [-16.495, -68.130],
    montevideo: [-34.895, -56.180]
};

function irACiudad(ciudad) {
    const coords = CITY_COORDS[ciudad];
    if (coords) {
        // Mostrar el protector de carga tipo Tetris con blur
        const loader = document.getElementById("map-loader");
        if (loader) loader.classList.add("active");
        
        map.flyTo(coords, 16, {
            duration: 1.5,
            easeLinearity: 0.25
        });
    }
}

// Exponer la función globalmente para compatibilidad
window.irACiudad = irACiudad;

// ── Estado de color de lotes (user-controlled) ──────────────────────────

function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${alpha})`;
}

function aplicarColorLotes() {
    const fillRgba = hexToRgba(currentFillColor, currentFillOpacity);
    lotesLayer.setStyle({
        color: currentStrokeColor,
        fillColor: currentFillColor,
        fillOpacity: currentFillOpacity
    });
}

// ── Actualizar estadísticas en vivo ──────────────────────────────────────
function actualizarStats() {
    const zoom = map.getZoom();
    const center = map.getCenter();
    const visible = lotesLayer.getLayers().length;

    const zEl    = document.getElementById("stat-zoom");
    const coordEl= document.getElementById("stat-coords");
    const visEl  = document.getElementById("stat-visible");

    if (zEl)     zEl.textContent    = zoom.toFixed(1);
    if (coordEl) coordEl.textContent= `${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}`;
    if (visEl)   visEl.textContent  = visible.toLocaleString("es");
}
map.on("zoomend moveend", actualizarStats);

// Capas de Bounding Boxes (MBR) para simular el R-Tree
let rTreeVisualLayers = [];

function limpiarVisualizacionRTree() {
    rTreeVisualLayers.forEach(layer => map.removeLayer(layer));
    rTreeVisualLayers = [];
}

function visualizarBusquedaRTree(loteCenter, loteGeom) {
    limpiarVisualizacionRTree();
    
    if (!loteCenter || !loteCenter.lat || !loteCenter.lon) return;
    
    const lat = Number(loteCenter.lat);
    const lon = Number(loteCenter.lon);
    
    // Nivel 0: Raíz (Macro Sector)
    const boundsN0 = [
        [lat - 0.0055, lon - 0.0075],
        [lat + 0.0055, lon + 0.0075]
    ];
    // Nivel 1: Nodo Interno (Manzana / Clúster)
    const boundsN1 = [
        [lat - 0.0012, lon - 0.0016],
        [lat + 0.0012, lon + 0.0016]
    ];
    
    const styleN0 = { color: "#a855f7", weight: 1, fill: true, fillColor: "#a855f7", fillOpacity: 0.015, dashArray: "6, 6", interactive: false };
    const styleN1 = { color: "#06b6d4", weight: 1.2, fill: true, fillColor: "#06b6d4", fillOpacity: 0.03, dashArray: "4, 4", interactive: false };
    
    const rectN0 = L.rectangle(boundsN0, styleN0).addTo(map);
    const rectN1 = L.rectangle(boundsN1, styleN1).addTo(map);
    
    rectN0.bringToFront();
    rectN1.bringToFront();
    
    rectN0.bindTooltip("R-Tree N0 (Raíz)", { permanent: true, className: "r-tree-tooltip-n0", direction: "top", opacity: 0.8 });
    rectN1.bindTooltip("R-Tree N1 (Nodo Interno)", { permanent: true, className: "r-tree-tooltip-n1", direction: "top", opacity: 0.8 });
    
    rTreeVisualLayers.push(rectN0, rectN1);
}

function animarTrazaRTree(data) {
    const n0Meta = document.getElementById("n0-meta");
    const n1Meta = document.getElementById("n1-meta");
    const n2Meta = document.getElementById("n2-meta");
    
    if (n0Meta) n0Meta.textContent = data.ciudad ? data.ciudad.split("(")[0].trim() : "Puno";
    if (n1Meta) {
        const side = Math.sqrt(data.area_grafica || 200) * 3.5;
        n1Meta.textContent = `bbox ${side.toFixed(0)}x${side.toFixed(0)}m`;
    }
    if (n2Meta) n2Meta.textContent = `id ${data.id_lote.substring(10)}`;

    const elements = {
        n0: document.getElementById("r-tree-n0"),
        c0: document.getElementById("r-tree-c0"),
        n1: document.getElementById("r-tree-n1"),
        c1: document.getElementById("r-tree-c1"),
        n2: document.getElementById("r-tree-n2")
    };
    
    Object.values(elements).forEach(el => {
        if (el) el.className = el.className.split(" ")[0];
    });

    setTimeout(() => { if (elements.n0) elements.n0.classList.add("active-n0"); }, 50);
    setTimeout(() => { if (elements.c0) elements.c0.classList.add("active-c0"); }, 180);
    setTimeout(() => { if (elements.n1) elements.n1.classList.add("active-n1"); }, 300);
    setTimeout(() => { if (elements.c1) elements.c1.classList.add("active-c1"); }, 420);
    setTimeout(() => { if (elements.n2) elements.n2.classList.add("active-n2"); }, 550);
}

function actualizarHudRendimiento(timeMs) {
    const hudVal = document.getElementById("hud-time-val");
    const hudContainer = document.getElementById("r-tree-performance-hud");
    
    if (hudVal) {
        hudVal.textContent = Number(timeMs).toFixed(3);
    }
    
    if (hudContainer) {
        hudContainer.classList.remove("hud-flash");
        void hudContainer.offsetWidth; // Forzar reflow para reiniciar la animación CSS
        hudContainer.classList.add("hud-flash");
    }
}

// ── Búsqueda y Aleatorización en el Visor ─────────────────────────────────
async function cargarLoteAleatorioVisor() {
    const diceBtn = document.querySelector(".btn-dice");
    if (diceBtn) {
        diceBtn.disabled = true;
        diceBtn.classList.add("spinning");
        setTimeout(() => diceBtn.classList.remove("spinning"), 500);
    }

    try {
        const response = await fetch("/api/lotes/random");
        if (!response.ok) throw new Error("Error en servidor");
        const data = await response.json();
        
        if (data.center) {
            mostrarLoteEnVisor(data);

            // Actualizar el selector de ciudad si la ciudad del lote existe en el select
            if (data.ciudad) {
                const citySelector = document.getElementById("city-selector");
                if (citySelector) {
                    const normalizedCity = data.ciudad.toLowerCase()
                        .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    const matchedOption = Array.from(citySelector.options).find(opt => {
                        const optVal = opt.value.toLowerCase();
                        return normalizedCity.startsWith(optVal) || normalizedCity.includes(optVal);
                    });
                    if (matchedOption) {
                        citySelector.value = matchedOption.value;
                    }
                }
            }
        }
    } catch (err) {
        console.error("Error al cargar lote aleatorio:", err);
    } finally {
        if (diceBtn) diceBtn.disabled = false;
    }
}
window.cargarLoteAleatorioVisor = cargarLoteAleatorioVisor;

async function buscarLotePorIdVisor() {
    const idInput = document.getElementById("search-lote-input").value.trim();
    if (!idInput || idInput.length !== 14) {
        Swal.fire({
            title: '> error_validacion',
            text: 'Por favor ingrese un código catastral válido de 14 dígitos.',
            icon: 'warning',
            background: '#0b0f19',
            color: '#f1f5f9',
            confirmButtonText: 'aceptar',
            buttonsStyling: false,
            customClass: {
                popup: 'swal2-retro-popup',
                title: 'swal2-retro-title',
                htmlContainer: 'swal2-retro-html',
                confirmButton: 'swal2-retro-btn'
            }
        });
        return;
    }
    
    try {
        const response = await fetch(`/api/lotes/${idInput}`);
        if (response.status === 404) {
            Swal.fire({
                title: '> error_busqueda',
                text: 'Lote no encontrado en la base de datos.',
                icon: 'error',
                background: '#0b0f19',
                color: '#f1f5f9',
                confirmButtonText: 'aceptar',
                buttonsStyling: false,
                customClass: {
                    popup: 'swal2-retro-popup',
                    title: 'swal2-retro-title',
                    htmlContainer: 'swal2-retro-html',
                    confirmButton: 'swal2-retro-btn'
                }
            });
            return;
        }
        if (!response.ok) throw new Error("Error en búsqueda.");
        const data = await response.json();
        
        if (data.center) {
            mostrarLoteEnVisor(data);
        }
    } catch (err) {
        console.error("Error en la búsqueda:", err);
    }
}
window.buscarLotePorIdVisor = buscarLotePorIdVisor;

// ── DOMContentLoaded ─────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {

    // — Ciudad selector —
    const citySelector = document.getElementById("city-selector");
    if (citySelector) {
        citySelector.addEventListener("change", (e) => irACiudad(e.target.value));
    }

    // — Botones de estilo de mapa base —
    document.querySelectorAll(".style-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const styleKey = btn.dataset.style;
            const style = MAP_STYLES[styleKey];
            if (!style) return;

            // Cambiar capa base
            map.removeLayer(baseTileLayer);
            baseTileLayer = L.tileLayer(style.url, {
                maxZoom: style.maxZoom,
                maxNativeZoom: style.maxNativeZoom,
                attribution: style.attrib
            }).addTo(map);

            // Marcar botón activo
            document.querySelectorAll(".style-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
        });
    });

    // — Color picker: borde —
    const strokePicker = document.getElementById("lote-color-picker");
    if (strokePicker) {
        strokePicker.addEventListener("input", (e) => {
            currentStrokeColor = e.target.value;
            aplicarColorLotes();
        });
    }

    // — Color picker: relleno —
    const fillPicker = document.getElementById("lote-fill-picker");
    if (fillPicker) {
        fillPicker.addEventListener("input", (e) => {
            currentFillColor = e.target.value;
            aplicarColorLotes();
        });
    }

    // — Slider de opacidad —
    const opacitySlider = document.getElementById("lote-opacity-slider");
    const opacityLabel  = document.getElementById("opacity-label");
    if (opacitySlider) {
        opacitySlider.addEventListener("input", (e) => {
            currentFillOpacity = parseInt(e.target.value) / 100;
            if (opacityLabel) {
                opacityLabel.textContent = `${e.target.value}%`;
                opacityLabel.style.color = "#fbbf24"; // Dorado neón dinámico
                opacityLabel.style.fontWeight = "bold";
                opacityLabel.style.textShadow = "0 0 8px rgba(251, 191, 36, 0.4)";
            }
            aplicarColorLotes();
        });
        opacitySlider.addEventListener("change", () => {
            if (opacityLabel) {
                opacityLabel.style.color = ""; // Restaurar color inicial
                opacityLabel.style.fontWeight = "";
                opacityLabel.style.textShadow = "";
            }
        });
    }

    // — Vincular controles de búsqueda expandibles minimalistas en el visor —
    const searchTrigger = document.getElementById("btn-buscar-trigger");
    const searchContainer = document.querySelector(".search-container-minimal");
    const searchInput = document.getElementById("search-lote-input");
    
    if (searchTrigger && searchContainer && searchInput) {
        searchTrigger.addEventListener("click", (e) => {
            e.stopPropagation();
            if (!searchContainer.classList.contains("expanded")) {
                searchContainer.classList.add("expanded");
                searchInput.focus();
            } else {
                buscarLotePorIdVisor();
            }
        });
        
        searchInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
                buscarLotePorIdVisor();
            }
        });
        
        document.addEventListener("click", (e) => {
            if (!searchContainer.contains(e.target) && searchContainer.classList.contains("expanded") && searchInput.value === "") {
                searchContainer.classList.remove("expanded");
            }
        });
    }

    // — Cerrar modal al hacer clic en el fondo difuso —
    const modal = document.getElementById("lote-modal");
    if (modal) {
        modal.addEventListener("click", (e) => {
            if (e.target === modal) cerrarLoteModal();
        });
    }

    // — Efecto tilt 3D tipo carta coleccionable en el contenedor del modal —
    const modalGlowWrap = document.getElementById("modal-lote-glow-wrap");
    if (modalGlowWrap) {
        modalGlowWrap.addEventListener("mousemove", (e) => {
            const rect = modalGlowWrap.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            const rotateX = ((centerY - y) / centerY) * 15;
            const rotateY = ((x - centerX) / centerX) * 15;
            
            modalGlowWrap.style.transition = "transform 0.08s ease-out, box-shadow 0.15s ease-out, border-color 0.15s ease-out";
            modalGlowWrap.style.transform = `perspective(600px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg)`;
            modalGlowWrap.style.boxShadow = `${-rotateY * 2}px ${rotateX * 2}px 30px rgba(129, 140, 248, 0.14), 0 12px 35px rgba(0, 0, 0, 0.7)`;
            modalGlowWrap.style.borderColor = "rgba(129, 140, 248, 0.45)";
        });
        modalGlowWrap.addEventListener("mouseleave", () => {
            modalGlowWrap.style.transition = "transform 0.4s cubic-bezier(0.25, 1, 0.5, 1), box-shadow 0.4s ease, border-color 0.4s ease";
            modalGlowWrap.style.transform = "perspective(600px) rotateX(0deg) rotateY(0deg)";
            modalGlowWrap.style.boxShadow = "";
            modalGlowWrap.style.borderColor = "";
        });
    }



    // — Stats iniciales —
    actualizarStats();
});

// Arrancar visor
inicializarVisor();

function mostrarLoteEnVisor(data) {
    const debugCheckbox = document.getElementById("debug-mode-checkbox");
    const isDebugActive = debugCheckbox && debugCheckbox.checked;

    if (isDebugActive) {
        ejecutarSimulacionPasoAPasoVisor(data);
    } else {
        ejecutarSimulacionNormalVisor(data);
    }
}

function ejecutarSimulacionNormalVisor(data) {
    if (!data.center) return;
    highlightLoteId = data.id_lote;
    map.flyTo([data.center.lat, data.center.lon], 18, {
        duration: 1.5
    });

    const searchTime = data.execution_time_ms ? Number(data.execution_time_ms) : 0.145;
    actualizarHudRendimiento(searchTime);
    visualizarBusquedaRTree(data.center, data.geom);
    animarTrazaRTree(data);
}

function ejecutarSimulacionPasoAPasoVisor(data) {
    if (!data.center) return;
    
    // Bloquear clicks de randomización
    const diceBtn = document.querySelector(".btn-dice");
    if (diceBtn) diceBtn.disabled = true;
    
    limpiarVisualizacionRTree();
    highlightLoteId = data.id_lote;
    
    const lat = Number(data.center.lat);
    const lon = Number(data.center.lon);
    
    // Resetear clases de animación del panel flotante
    const elements = {
        n0: document.getElementById("r-tree-n0"),
        c0: document.getElementById("r-tree-c0"),
        n1: document.getElementById("r-tree-n1"),
        c1: document.getElementById("r-tree-c1"),
        n2: document.getElementById("r-tree-n2")
    };
    Object.values(elements).forEach(el => {
        if (el) el.className = el.className.split(" ")[0];
    });
    
    const n0Meta = document.getElementById("n0-meta");
    const n1Meta = document.getElementById("n1-meta");
    const n2Meta = document.getElementById("n2-meta");
    if (n0Meta) n0Meta.textContent = "evaluando...";
    if (n1Meta) n1Meta.textContent = "sector_cluster";
    if (n2Meta) n2Meta.textContent = "lote_id";
    
    // Zoom out inicial a escala macro
    map.flyTo([lat, lon], 15, { duration: 0.8 });
    
    let rectN0, rectN1;
    
    // Paso 1: Raíz N0
    setTimeout(() => {
        const boundsN0 = [[lat - 0.0055, lon - 0.0075], [lat + 0.0055, lon + 0.0075]];
        rectN0 = L.rectangle(boundsN0, { 
            color: "#a855f7", 
            weight: 2, 
            fill: true, 
            fillColor: "#a855f7", 
            fillOpacity: 0.08, 
            dashArray: "6, 6", 
            interactive: false 
        }).addTo(map);
        rectN0.bindTooltip("R-Tree N0 (Raíz)", { permanent: true, className: "r-tree-tooltip-n0", direction: "top", opacity: 0.8 });
        rTreeVisualLayers.push(rectN0);
        rectN0.bringToFront();
        
        if (elements.n0) elements.n0.classList.add("active-n0");
        if (n0Meta) n0Meta.textContent = "evaluando...";
    }, 900);
    
    // Paso 2: Nodo Interno N1 (Manzana)
    setTimeout(() => {
        if (rectN0) {
            rectN0.setStyle({ color: "rgba(255, 255, 255, 0.15)", fillColor: "none" });
        }
        
        const boundsN1 = [[lat - 0.0012, lon - 0.0016], [lat + 0.0012, lon + 0.0016]];
        rectN1 = L.rectangle(boundsN1, { 
            color: "#06b6d4", 
            weight: 2, 
            fill: true, 
            fillColor: "#06b6d4", 
            fillOpacity: 0.1, 
            dashArray: "4, 4", 
            interactive: false 
        }).addTo(map);
        rectN1.bindTooltip("R-Tree N1 (Nodo Interno)", { permanent: true, className: "r-tree-tooltip-n1", direction: "top", opacity: 0.8 });
        rTreeVisualLayers.push(rectN1);
        rectN1.bringToFront();
        
        map.flyTo([lat, lon], 17, { duration: 1.0 });
        
        if (elements.c0) elements.c0.classList.add("active-c0");
        if (elements.n1) elements.n1.classList.add("active-n1");
        if (n0Meta) n0Meta.textContent = data.ciudad ? data.ciudad.split("(")[0].trim() : "Puno";
        if (n1Meta) n1Meta.textContent = "evaluando...";
    }, 2100);
    
    // Paso 3: Lote N2
    setTimeout(() => {
        if (rectN1) {
            rectN1.setStyle({ color: "rgba(255, 255, 255, 0.15)", fillColor: "none" });
        }
        
        lotesLayer.eachLayer((layer) => {
            if (layer.feature && layer.feature.properties && layer.feature.properties.id_lote === data.id_lote) {
                layer.setStyle({
                    color: "#10b981", 
                    weight: 4,
                    fillColor: "#10b981",
                    fillOpacity: 0.65
                });
                setTimeout(() => { layer.openPopup(); }, 300);
            }
        });
        
        map.flyTo([lat, lon], 19, { duration: 1.0 });
        
        if (elements.c1) elements.c1.classList.add("active-c1");
        if (elements.n2) elements.n2.classList.add("active-n2");
        if (n1Meta) {
            const side = Math.sqrt(data.area_grafica || 200) * 3.5;
            n1Meta.textContent = `bbox ${side.toFixed(0)}x${side.toFixed(0)}m`;
        }
        if (n2Meta) n2Meta.textContent = `id ${data.id_lote.substring(10)}`;
        
        const searchTime = data.execution_time_ms ? Number(data.execution_time_ms) : 0.145;
        actualizarHudRendimiento(searchTime);
        
        if (diceBtn) diceBtn.disabled = false;
    }, 3300);
}