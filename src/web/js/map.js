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
let ultimoLoteCentro = null;
let renderLimit = 1500;


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

async function abrirLoteModal(idLote, learnedStats = null, rtreeSearchTimeMs = null) {
    const modal = document.getElementById("lote-modal");
    const placeholder = document.getElementById("modal-lote-placeholder");
    const polygon = document.getElementById("modal-lote-polygon");
    const statsContainer = document.getElementById("modal-learned-stats-container");
    
    if (modal) modal.classList.add("active");
    if (placeholder) placeholder.textContent = "> cargando_geometria...";
    if (polygon) polygon.setAttribute("points", "");
    
    if (statsContainer) statsContainer.style.display = "none";
    
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
        if (learnedStats) {
            const rtreeMs = rtreeSearchTimeMs || learnedStats.rtree_search_time_ms;
            actualizarHudRendimientoLearned(learnedStats.learned_search_time_ms, rtreeMs);
            if (statsContainer) {
                statsContainer.style.display = "block";
                document.getElementById("modal-learned-key").textContent = learnedStats.hilbert_key;
                document.getElementById("modal-learned-segments").textContent = `${learnedStats.segments_count} segmentos`;
                document.getElementById("modal-learned-range").textContent = `[${learnedStats.pgm_search_range.join(', ')}] (ε=${learnedStats.epsilon})`;
                document.getElementById("modal-learned-steps").textContent = `${learnedStats.binary_steps} iteraciones`;
            }
        } else {
            const searchTime = data.execution_time_ms ? Number(data.execution_time_ms) : 0.145;
            actualizarHudRendimiento(searchTime);
        }
        
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
        if (!isPGMMapDebugActive()) limpiarVisualizacionPGM();
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
        const url = `/api/lotes/?min_lat=${sw.lat}&min_lon=${sw.lng}&max_lat=${ne.lat}&max_lon=${ne.lng}&zoom=${zoom}&limit=${renderLimit}`;
        
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

// Normalizar nombres de ciudades provenientes de la base de datos para encajar con el selector del visor
function normalizarNombreCiudad(ciudad) {
    if (!ciudad) return "";
    let s = ciudad.toLowerCase();
    s = s.split('(')[0].trim();
    s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    s = s.replace(/\s+/g, "");
    if (s === "ciudaddemexico") return "cdmx";
    return s;
}

function sincronizarSelectorCiudad(ciudad) {
    if (!ciudad) return;
    const citySelector = document.getElementById("city-selector");
    if (!citySelector) return;
    const normalized = ciudad.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const matched = Array.from(citySelector.options).find(opt => {
        const optVal = opt.value.toLowerCase();
        return normalized.startsWith(optVal) || normalized.includes(optVal);
    });
    if (matched) {
        citySelector.value = matched.value;
    }
}

function encontrarCiudadMasCercana(lat, lon) {
    if (isNaN(lat) || isNaN(lon)) return null;
    let minDist = Infinity;
    let closest = null;
    for (const [key, coords] of Object.entries(CITY_COORDS)) {
        const d = Math.hypot(coords[0] - lat, coords[1] - lon);
        if (d < minDist) {
            minDist = d;
            closest = key;
        }
    }
    return closest;
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
    const urlCiudad = urlParams.get("ciudad");
    
    if (urlId) {
        highlightLoteId = urlId;
    }
    
    // Sincronizar el selector de la UI con la ciudad de la URL si se especifica
    const citySelector = document.getElementById("city-selector");
    if (urlCiudad && citySelector) {
        const normalized = normalizarNombreCiudad(urlCiudad);
        if (normalized) {
            citySelector.value = normalized;
        }
    }
    
    // Si se especifican coordenadas en la URL, enfocar directamente
    if (!isNaN(urlLat) && !isNaN(urlLon)) {
        if (!urlCiudad && citySelector) {
            const nearest = encontrarCiudadMasCercana(urlLat, urlLon);
            if (nearest) citySelector.value = nearest;
        }
        map.setView([urlLat, urlLon], urlZoom);
        map.on('moveend', cargarLotesPorViewport);
        await cargarLotesPorViewport();
        return;
    }
    
    // Por defecto, posicionar la cámara en Puno Centro (SRID 32719 zona de interés)
    map.setView([-15.8402, -70.0219], 16);
    
    // Asegurar que el selector de la UI esté sincronizado con Puno por defecto si no venía en la URL
    if (!urlCiudad && citySelector) {
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

// Capas para la visualización PGM-Index sobre el mapa
let pgmVisualLayers = [];

function limpiarVisualizacionPGM() {
    pgmVisualLayers.forEach(layer => {
        if (layer._pgmAxis) return;
        map.removeLayer(layer);
    });
    pgmVisualLayers = [];
    limpiarEjePGM();
}

function isPGMMapDebugActive() {
    const cb = document.getElementById("pgm-debug-checkbox");
    return !!(cb && cb.checked);
}

async function ejecutarSimulacionPasoAPasoPGM(data, learnedStats, realRtreeTime) {
    if (!data.center || !learnedStats) {
        const diceBtn = document.querySelector(".btn-dice");
        if (diceBtn) diceBtn.disabled = false;
        return;
    }

    const diceBtn = document.querySelector(".btn-dice");
    if (diceBtn) diceBtn.disabled = true;

    limpiarVisualizacionPGM();
    limpiarVisualizacionRTree();
    highlightLoteId = data.id_lote;

    const lat = Number(data.center.lat);
    const lon = Number(data.center.lon);
    const segCount = learnedStats.segments_count || 8;
    const segIdx = learnedStats.segment ? learnedStats.segment.segment_index : 0;
    const eps = learnedStats.epsilon || 4;
    const predPos = learnedStats.segment ? learnedStats.segment.predicted_position : null;
    const actPos = learnedStats.segment ? learnedStats.segment.actual_position : null;
    const hKey = learnedStats.hilbert_key;
    const slope = learnedStats.segment ? learnedStats.segment.slope : null;
    const intercept = learnedStats.segment ? learnedStats.segment.intercept : null;
    const searchRange = learnedStats.pgm_search_range || [0, 0];
    const binSteps = learnedStats.binary_steps || 0;
    
    const neighborhood = learnedStats.neighborhood || [];
    const low = searchRange[0];
    const high = searchRange[1];

    // ── Crear eje 1D en la parte inferior ─────────────────────────────
    const axisEl = crearEjePGM(learnedStats);
    if (axisEl) {
        axisEl.style.opacity = "0";
        document.getElementById("map").appendChild(axisEl);
        pgmVisualLayers.push({ _pgmAxis: true });
        requestAnimationFrame(() => { axisEl.style.opacity = "1"; });
    }

    // ==========================================================================
    // PASO 1 — HK: Punto de consulta y centrado general del mapa
    // ==========================================================================
    map.flyTo([lat, lon], 15, { duration: 0.8 });

    const qDot = L.circleMarker([lat, lon], {
        radius: 7, color: "#fbbf24", fillColor: "#fbbf24", fillOpacity: 0.9, weight: 2.5, interactive: false
    }).addTo(map);
    qDot.bindTooltip(`consulta (${lat.toFixed(5)}, ${lon.toFixed(5)})`, { className: "pgm-tooltip", direction: "top", opacity: 0.85 });
    pgmVisualLayers.push(qDot);

    // Línea de proyección conceptual hacia la barra de Hilbert inferior
    const projLine = L.polyline(
        [[lat, lon], [lat - 0.0015, lon]],
        { color: "rgba(251,191,36,0.25)", weight: 1, dashArray: "4,4", interactive: false }
    ).addTo(map);
    pgmVisualLayers.push(projLine);

    // ==========================================================================
    // PASO 2 — PGM: Mostrar el segmento activo y la Curva de Hilbert local real
    // ==========================================================================
    setTimeout(() => {
        actualizarEjePGM(learnedStats, 1);

        projLine.setStyle({ color: "rgba(16,185,129,0.45)", weight: 1.5, dashArray: "2,3" });

        const glow = document.getElementById("pgm-axis-glow");
        if (glow) {
            glow.style.transition = "opacity 0.3s ease";
            glow.setAttribute("opacity", "0.85");
        }

        // Trazar la Curva de Hilbert local uniendo los centroides del vecindario
        if (neighborhood.length > 0) {
            const latlngs = neighborhood.map(l => [l.lat, l.lon]);
            const hilbertLine = L.polyline(latlngs, {
                color: "#10b981",
                weight: 2,
                opacity: 0.65,
                dashArray: "3,5",
                interactive: false
            }).addTo(map);
            pgmVisualLayers.push(hilbertLine);

            // Dibujar pequeños centroides del tramo catastral indexado en memoria
            neighborhood.forEach((l, idx) => {
                const isPred = (low + idx) === predPos;
                const isReal = (low + idx) === actPos;
                if (isPred || isReal) return; // Se renderizan con más énfasis en el paso 3

                const dot = L.circleMarker([l.lat, l.lon], {
                    radius: 3,
                    color: "rgba(6,182,212,0.5)",
                    fillColor: "rgba(6,182,212,0.5)",
                    fillOpacity: 0.7,
                    weight: 1,
                    interactive: false
                }).addTo(map);
                pgmVisualLayers.push(dot);
            });
        }
    }, 1500);

    // ==========================================================================
    // PASO 3 — BS: Mostrar rango de error ε, predicción, real y zoom final
    // ==========================================================================
    setTimeout(() => {
        actualizarEjePGM(learnedStats, 2);

        // Bounding Box del vecindario de búsqueda acotado física y lógicamente
        if (neighborhood.length > 0) {
            const latlngs = neighborhood.map(l => [l.lat, l.lon]);
            const bounds = L.latLngBounds(latlngs);
            
            const rangeBox = L.rectangle(bounds, {
                color: "#f59e0b",
                weight: 1.2,
                fillColor: "rgba(245,158,11,0.015)",
                fillOpacity: 0.04,
                dashArray: "4,4",
                interactive: false
            }).addTo(map);
            pgmVisualLayers.push(rangeBox);
            rangeBox.bindTooltip(`Rango de Búsqueda Local [${low} … ${high}] (2ε+1)`, { 
                permanent: true, 
                className: "pgm-tooltip-range", 
                direction: "bottom", 
                opacity: 0.8 
            });

            // Marcador de predicción (Cian)
            if (predPos !== null && predPos >= low && predPos <= high) {
                const pLote = neighborhood[predPos - low];
                const predDot = L.circleMarker([pLote.lat, pLote.lon], {
                    radius: 6, color: "#06b6d4", fillColor: "#06b6d4", fillOpacity: 0.8, weight: 2, interactive: false
                }).addTo(map);
                predDot.bindTooltip(`predicción → #${predPos}`, { className: "pgm-tooltip-pred", direction: "left", opacity: 0.9 });
                pgmVisualLayers.push(predDot);
            }

            // Marcador real (Esmeralda)
            if (actPos !== null && actPos >= low && actPos <= high) {
                const aLote = neighborhood[actPos - low];
                const actDot = L.circleMarker([aLote.lat, aLote.lon], {
                    radius: 6, color: "#10b981", fillColor: "#10b981", fillOpacity: 0.8, weight: 2, interactive: false
                }).addTo(map);
                actDot.bindTooltip(`real → #${actPos}`, { className: "pgm-tooltip-real", direction: "right", opacity: 0.9 });
                pgmVisualLayers.push(actDot);
            }
        }

        // Zoom cerrado al lote real
        map.flyTo([lat, lon], 18, { duration: 1.2 });

        // Highlight final del lote catastral encontrado
        setTimeout(() => {
            const foundDot = L.circleMarker([lat, lon], {
                radius: 9, color: "#ef4444", fillColor: "#ef4444", fillOpacity: 0.25, weight: 3, interactive: false
            }).addTo(map);
            foundDot.bindTooltip(`lote encontrado · ${data.id_lote} (${binSteps} iteraciones)`, { 
                className: "pgm-tooltip-success", 
                direction: "top", 
                opacity: 0.9 
            });
            pgmVisualLayers.push(foundDot);
        }, 400);

        // Mostrar HUD de rendimiento comparativo en tiempo real
        const rtreeMs = realRtreeTime || learnedStats.rtree_search_time_ms;
        if (learnedStats.learned_search_time_ms && rtreeMs) {
            actualizarHudRendimientoLearned(learnedStats.learned_search_time_ms, rtreeMs);
        }

        if (diceBtn) diceBtn.disabled = false;
    }, 3800);
}

// ── Panel de Debug PGM-Index (HK → PGM → BS) ── eliminado — reemplazado por eje 1D arriba

// ── PGM Index — Axis 1D ──────────────────────────────────────────────────

function isRTreeDebugActive() {
    const cb = document.getElementById("debug-mode-checkbox");
    return !!(cb && cb.checked);
}

let pgmAxisControl = null;

function crearEjePGM(stats) {
    const old = document.getElementById("pgm-axis");
    if (old) old.remove();
    if (!stats) return null;

    const segCount = stats.segments_count || 8;
    const segIdx = stats.segment ? stats.segment.segment_index : 0;
    const hKey = stats.hilbert_key || 0;
    const maxKey = Math.pow(2, 24) - 1;
    const hueStep = 360 / segCount;

    const container = document.createElement("div");
    container.id = "pgm-axis";
    container.style.cssText =
        "position:absolute;bottom:1rem;left:50%;transform:translateX(-50%);" +
        "z-index:700;width:min(700px,calc(100vw - 320px));" +
        "background:rgba(9,13,22,0.88);backdrop-filter:blur(6px);" +
        "border:1px solid rgba(52,211,153,0.2);padding:0.5rem 0.8rem 0.5rem;" +
        "font-family:'Fira Code',monospace;transition:opacity 0.4s ease;";

    // Título
    const title = document.createElement("div");
    title.style.cssText = "display:flex;justify-content:space-between;align-items:baseline;margin-bottom:0.35rem;";
    title.innerHTML = `<span style="color:#34d399;font-size:0.6rem;font-weight:700;">> hilbert_keyspace (0 … 2²⁴−1)</span>`;
    container.appendChild(title);

    // Barra SVG
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "32");
    svg.setAttribute("viewBox", "0 0 1000 32");
    svg.style.cssText = "display:block;width:100%;";
    svg.setAttribute("preserveAspectRatio", "none");

    // Segmentos
    const segW = 980 / segCount;
    for (let i = 0; i < segCount; i++) {
        const hue = i * hueStep;
        const isActive = i === segIdx;
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", String(10 + i * segW));
        rect.setAttribute("y", "10");
        rect.setAttribute("width", String(segW - 1));
        rect.setAttribute("height", "12");
        rect.setAttribute("fill", isActive ? `hsla(${hue},80%,55%,0.7)` : `hsla(${hue},50%,45%,0.25)`);
        rect.setAttribute("stroke", isActive ? `hsla(${hue},90%,60%,0.9)` : `hsla(${hue},40%,40%,0.1)`);
        rect.setAttribute("stroke-width", isActive ? "2" : "0.5");
        rect.setAttribute("rx", "1");
        svg.appendChild(rect);

        if (isActive) {
            // Destello sobre segmento activo
            const glow = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            glow.setAttribute("x", String(10 + i * segW));
            glow.setAttribute("y", "10");
            glow.setAttribute("width", String(segW - 1));
            glow.setAttribute("height", "12");
            glow.setAttribute("fill", "none");
            glow.setAttribute("stroke", "#10b981");
            glow.setAttribute("stroke-width", "3");
            glow.setAttribute("rx", "1");
            glow.setAttribute("opacity", "0.5");
            glow.id = "pgm-axis-glow";
            svg.appendChild(glow);
        }
    }

    // Eje numérico (línea base)
    const axisLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
    axisLine.setAttribute("x1", "10");
    axisLine.setAttribute("y1", "26");
    axisLine.setAttribute("x2", "990");
    axisLine.setAttribute("y2", "26");
    axisLine.setAttribute("stroke", "rgba(52,211,153,0.2)");
    axisLine.setAttribute("stroke-width", "0.5");
    svg.appendChild(axisLine);

    // Marcador de clave HK (triángulo invertido)
    const hkFrac = hKey / maxKey;
    const hkX = 10 + hkFrac * 980;
    const hkArrow = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    hkArrow.setAttribute("points", `${hkX-5},8 ${hkX+5},8 ${hkX},14`);
    hkArrow.setAttribute("fill", "#fbbf24");
    hkArrow.setAttribute("opacity", "0.9");
    hkArrow.id = "pgm-axis-hk-arrow";
    svg.appendChild(hkArrow);

    // Etiqueta HK
    const hkLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
    hkLabel.setAttribute("x", String(hkX));
    hkLabel.setAttribute("y", "7");
    hkLabel.setAttribute("fill", "#fbbf24");
    hkLabel.setAttribute("font-size", "7");
    hkLabel.setAttribute("font-family", "monospace");
    hkLabel.setAttribute("text-anchor", "middle");
    hkLabel.textContent = `HK=${hKey}`;
    hkLabel.id = "pgm-axis-hk-label";
    svg.appendChild(hkLabel);

    // Separadores de segmento y etiquetas
    for (let i = 0; i <= segCount; i++) {
        const x = 10 + i * segW;
        const tick = document.createElementNS("http://www.w3.org/2000/svg", "line");
        tick.setAttribute("x1", String(x));
        tick.setAttribute("y1", "24");
        tick.setAttribute("x2", String(x));
        tick.setAttribute("y2", "28");
        tick.setAttribute("stroke", "rgba(52,211,153,0.15)");
        tick.setAttribute("stroke-width", "0.5");
        svg.appendChild(tick);
    }

    container.appendChild(svg);

    // Footer con info del segmento activo
    const footer = document.createElement("div");
    footer.id = "pgm-axis-footer";
    footer.style.cssText = "display:flex;justify-content:space-between;font-size:0.55rem;color:rgba(52,211,153,0.5);margin-top:0.2rem;";
    footer.innerHTML = `<span>segmento <strong style="color:#34d399;">#${segIdx}</strong> de ${segCount}</span>`;
    container.appendChild(footer);

    return container;
}

function actualizarEjePGM(stats, step) {
    const footer = document.getElementById("pgm-axis-footer");
    if (!footer || !stats) return;
    const eps = stats.epsilon || 4;
    const predPos = stats.segment ? stats.segment.predicted_position : null;
    const actPos = stats.segment ? stats.segment.actual_position : null;
    const binSteps = stats.binary_steps || 0;
    const slope = stats.segment ? stats.segment.slope : null;
    const intercept = stats.segment ? stats.segment.intercept : null;

    if (step === 1) {
        footer.innerHTML =
            `segmento <strong style="color:#34d399;">#${stats.segment ? stats.segment.segment_index : 0}</strong>` +
            (slope ? ` &middot; y = ${slope.toExponential(2)}·x ${intercept >= 0 ? "+" : "−"} ${Math.abs(intercept).toFixed(2)}` : "") +
            ` &middot; ${stats.segment ? stats.segment.points_count : 0} puntos`;
    } else if (step === 2) {
        footer.innerHTML =
            `ε=${eps} · búsqueda en [${predPos - eps}, ${predPos + eps}] · ${binSteps} iteraciones` +
            (predPos !== null && actPos !== null ? ` · pred: ${predPos} → real: ${actPos}` : "");
    }
}

function limpiarEjePGM() {
    const el = document.getElementById("pgm-axis");
    if (el) el.remove();
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
    const hudLabel = document.querySelector("#r-tree-performance-hud .hud-label");
    const hudUnit = document.querySelector("#r-tree-performance-hud .hud-unit");
    
    if (hudLabel) hudLabel.textContent = "r_tree:";
    if (hudUnit) hudUnit.textContent = "ms";
    if (hudVal) {
        hudVal.textContent = Number(timeMs).toFixed(3);
    }
    
    if (hudContainer) {
        hudContainer.classList.remove("hud-flash");
        void hudContainer.offsetWidth; // Forzar reflow para reiniciar la animación CSS
        hudContainer.classList.add("hud-flash");
    }
}

function actualizarHudRendimientoLearned(learnedMs, rtreeMs) {
    const hudVal = document.getElementById("hud-time-val");
    const hudContainer = document.getElementById("r-tree-performance-hud");
    const hudLabel = document.querySelector("#r-tree-performance-hud .hud-label");
    const hudUnit = document.querySelector("#r-tree-performance-hud .hud-unit");
    
    if (hudLabel) hudLabel.textContent = "pgm_li:";
    if (hudUnit) hudUnit.textContent = "";
    if (hudVal) {
        hudVal.innerHTML = `<span style="color: #10b981;">${Number(learnedMs).toFixed(3)}ms</span> <span style="color: var(--text-muted); font-size:0.68rem; font-weight:normal; margin-left:0.2rem;">R-TREE ACC:</span> <span style="color: #a855f7;">${Number(rtreeMs).toFixed(3)}ms</span>`;
    }
    
    if (hudContainer) {
        hudContainer.classList.remove("hud-flash");
        void hudContainer.offsetWidth;
        hudContainer.classList.add("hud-flash");
    }
}

// ── Búsqueda y Aleatorización en el Visor ─────────────────────────────────
async function cargarLoteAleatorioVisor() {
    await coldCacheFlushVisor();
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
            if (isPGMMapDebugActive()) {
                // PGM animado: primero obtener stats, luego ejecutar simulación
                try {
                    const [rtreeRes, learnedRes] = await Promise.allSettled([
                        fetch(`/api/search/rtree?lat=${data.center.lat}&lon=${data.center.lon}`),
                        fetch(`/api/search/learned?lat=${data.center.lat}&lon=${data.center.lon}`)
                    ]);
                    let learnedStats = null;
                    let realRtreeTime = null;
                    if (rtreeRes.status === 'fulfilled' && rtreeRes.value.ok) {
                        const result = await rtreeRes.value.json();
                        realRtreeTime = result.stats.rtree_search_time_ms;
                    }
                    if (learnedRes.status === 'fulfilled' && learnedRes.value.ok) {
                        const result = await learnedRes.value.json();
                        learnedStats = result.stats;
                    }
                    await ejecutarSimulacionPasoAPasoPGM(data, learnedStats, realRtreeTime);
                } catch (e) {
                    console.error("Error en PGM debug:", e);
                    mostrarLoteEnVisor(data);
                }
            } else {
                mostrarLoteEnVisor(data);

                // Fetch R-Tree + PGM stats en paralelo para mostrar métricas reales
                Promise.allSettled([
                    fetch(`/api/search/rtree?lat=${data.center.lat}&lon=${data.center.lon}`),
                    fetch(`/api/search/learned?lat=${data.center.lat}&lon=${data.center.lon}`)
                ]).then(async ([rtreeRes, learnedRes]) => {
                    let learnedMs = null;
                    let rtreeMs = null;
                    if (rtreeRes.status === 'fulfilled' && rtreeRes.value.ok) {
                        const result = await rtreeRes.value.json();
                        rtreeMs = result.stats.rtree_search_time_ms;
                    }
                    if (learnedRes.status === 'fulfilled' && learnedRes.value.ok) {
                        const result = await learnedRes.value.json();
                        learnedMs = result.stats.learned_search_time_ms;
                    }
                    if (learnedMs !== null && rtreeMs !== null) {
                        actualizarHudRendimientoLearned(learnedMs, rtreeMs);
                    }
                }).catch(() => {});
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
    await coldCacheFlushVisor();
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
            if (isPGMMapDebugActive()) {
                try {
                    const [rtreeRes, learnedRes] = await Promise.allSettled([
                        fetch(`/api/search/rtree?lat=${data.center.lat}&lon=${data.center.lon}`),
                        fetch(`/api/search/learned?lat=${data.center.lat}&lon=${data.center.lon}`)
                    ]);
                    let learnedStats = null;
                    let realRtreeTime = null;
                    if (rtreeRes.status === 'fulfilled' && rtreeRes.value.ok) {
                        const result = await rtreeRes.value.json();
                        realRtreeTime = result.stats.rtree_search_time_ms;
                    }
                    if (learnedRes.status === 'fulfilled' && learnedRes.value.ok) {
                        const result = await learnedRes.value.json();
                        learnedStats = result.stats;
                    }
                    await ejecutarSimulacionPasoAPasoPGM(data, learnedStats, realRtreeTime);
                } catch (e) {
                    console.error("Error en PGM debug:", e);
                    const d = document.querySelector(".btn-dice");
                    if (d) d.disabled = false;
                    mostrarLoteEnVisor(data);
                }
            } else {
                mostrarLoteEnVisor(data);
                Promise.allSettled([
                    fetch(`/api/search/rtree?lat=${data.center.lat}&lon=${data.center.lon}`),
                    fetch(`/api/search/learned?lat=${data.center.lat}&lon=${data.center.lon}`)
                ]).then(async ([rtreeRes, learnedRes]) => {
                    let learnedMs = null;
                    let rtreeMs = null;
                    if (rtreeRes.status === 'fulfilled' && rtreeRes.value.ok) {
                        const result = await rtreeRes.value.json();
                        rtreeMs = result.stats.rtree_search_time_ms;
                    }
                    if (learnedRes.status === 'fulfilled' && learnedRes.value.ok) {
                        const result = await learnedRes.value.json();
                        learnedMs = result.stats.learned_search_time_ms;
                    }
                    if (learnedMs !== null && rtreeMs !== null) {
                        actualizarHudRendimientoLearned(learnedMs, rtreeMs);
                    }
                }).catch(() => {});
            }
        }
    } catch (err) {
        console.error("Error en la búsqueda:", err);
    }
}
window.buscarLotePorIdVisor = buscarLotePorIdVisor;

// ── DOMContentLoaded ─────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {

    // Botón para copiar ID Catastral en modal al portapapeles
    const btnCopyModal = document.getElementById("btn-copy-modal-id");
    if (btnCopyModal) {
        btnCopyModal.addEventListener("click", () => {
            const modalPresId = document.getElementById("modal-pres-id").textContent;
            if (modalPresId && modalPresId !== "—" && modalPresId !== "...") {
                navigator.clipboard.writeText(modalPresId).then(() => {
                    const originalColor = btnCopyModal.style.color;
                    btnCopyModal.style.color = "#10b981"; // Verde neón temporal
                    setTimeout(() => btnCopyModal.style.color = originalColor, 1000);
                }).catch(err => console.error("Fallo al copiar:", err));
            }
        });
    }

    // — Ciudad selector —
    const citySelector = document.getElementById("city-selector");
    if (citySelector) {
        citySelector.addEventListener("change", (e) => irACiudad(e.target.value));
    }

    // — Switch PGM map debug: mostrar/ocultar visualización PGM sobre el mapa —
    const pgmDebugCb = document.getElementById("pgm-debug-checkbox");
    if (pgmDebugCb) {
        pgmDebugCb.addEventListener("change", () => {
            if (!pgmDebugCb.checked) {
                limpiarVisualizacionPGM();
            }
        });
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

    // — Slider de límite de renderizado —
    const renderSlider = document.getElementById("render-limit-slider");
    const renderLabel  = document.getElementById("render-limit-label");
    if (renderSlider) {
        renderSlider.addEventListener("input", (e) => {
            renderLimit = parseInt(e.target.value);
            if (renderLabel) renderLabel.textContent = renderLimit.toLocaleString();
        });
        renderSlider.addEventListener("change", () => {
            const zoom = map.getZoom();
            if (zoom >= 15) {
                cargarLotesPorViewport();
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



    // — Buscar lote por coordenadas al hacer clic en el mapa si debug está activo —
    map.on('click', async function (e) {
        const debugCheckbox = document.getElementById("debug-mode-checkbox");
        const isDebugActive = debugCheckbox && debugCheckbox.checked;
        if (!isDebugActive) return;
        
        const lat = e.latlng.lat;
        const lon = e.latlng.lng;
        
        console.log(`[Búsqueda Unificada] Geolocalización: lat=${lat}, lon=${lon}`);
        
        const hudContainer = document.getElementById("r-tree-performance-hud");
        if (hudContainer) hudContainer.classList.add("hud-flash");
        
        await buscarLoteUnificadoVisor(lat, lon);
    });

    // — Stats iniciales —
    actualizarStats();
});

// Arrancar visor
inicializarVisor();

function mostrarLoteEnVisor(data) {
    if (data && data.center) {
        ultimoLoteCentro = data.center;
    }
    sincronizarSelectorCiudad(data && data.ciudad);
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

    // R-Tree visual solo cuando debug está activo
    if (isRTreeDebugActive()) {
        visualizarBusquedaRTree(data.center, data.geom);
        animarTrazaRTree(data);
    } else {
        limpiarVisualizacionRTree();
    }
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
    
    // Fetch R-Tree + PGM stats in background for dual debug
    let learnedStats = null;
    let realRtreeTime = null;
    Promise.allSettled([
        fetch(`/api/search/rtree?lat=${lat}&lon=${lon}`),
        fetch(`/api/search/learned?lat=${lat}&lon=${lon}`)
    ]).then(async ([rtreeRes, learnedRes]) => {
        if (rtreeRes.status === 'fulfilled' && rtreeRes.value.ok) {
            const result = await rtreeRes.value.json();
            realRtreeTime = result.stats.rtree_search_time_ms;
        }
        if (learnedRes.status === 'fulfilled' && learnedRes.value.ok) {
            const result = await learnedRes.value.json();
            learnedStats = result.stats;
            // Actualizar las metas del widget PGM con los datos reales del segmento
            const seg = learnedStats.segment;
            const n0 = document.getElementById("pgm-n0-meta");
            const n1 = document.getElementById("pgm-n1-meta");
            const n2 = document.getElementById("pgm-n2-meta");
            if (n0 && learnedStats.hilbert_key !== undefined) {
                n0.textContent = `hk=${learnedStats.hilbert_key}`;
            }
            if (n1 && seg) {
                n1.textContent = `seg #${seg.segment_index} • ${seg.points_count} pts`;
            }
            if (n2 && learnedStats.pgm_search_range) {
                n2.textContent = `ε=${learnedStats.epsilon} • [${learnedStats.pgm_search_range[0]},${learnedStats.pgm_search_range[1]}]`;
            }
        }
    }).catch(() => {});
    
    // Resetear clases de animación del panel flotante (R-Tree)
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

        // HUD dual
        if (learnedStats) {
            const rtreeMs = realRtreeTime || learnedStats.rtree_search_time_ms;
            actualizarHudRendimientoLearned(learnedStats.learned_search_time_ms, rtreeMs);
        } else {
            const searchTime = data.execution_time_ms ? Number(data.execution_time_ms) : 0.145;
            actualizarHudRendimiento(searchTime);
        }

        if (diceBtn) diceBtn.disabled = false;
    }, 3300);
}

// ── CONTROL DE CACHÉ FRÍO ──
async function coldCacheFlushVisor() {
    const cb = document.getElementById("cold-cache-checkbox");
    if (!cb || !cb.checked) return;
    try {
        await fetch("/api/cache/flush", { method: "POST" });
    } catch (e) {
        console.warn("Error al limpiar caché:", e);
    }
}

// ── BÚSQUEDA UNIFICADA EN EL VISOR (R-TREE + PGM SIMULTÁNEO) ──
async function buscarLoteUnificadoVisor(lat, lon) {
    await coldCacheFlushVisor();
    if (lat === undefined || lon === undefined) {
        if (ultimoLoteCentro) {
            lat = ultimoLoteCentro.lat;
            lon = ultimoLoteCentro.lon;
        } else {
            const center = map.getCenter();
            lat = center.lat;
            lon = center.lng;
        }
    }

    // Resetear el panel de debug PGM-Index antes de iniciar la consulta
    const hudContainer = document.getElementById("r-tree-performance-hud");
    if (hudContainer) hudContainer.classList.add("hud-flash");

    try {
        const [rtreeResult, learnedResult] = await Promise.allSettled([
            fetch(`/api/search/rtree?lat=${lat}&lon=${lon}`),
            fetch(`/api/search/learned?lat=${lat}&lon=${lon}`)
        ]);

        let lote = null;
        let rtreeStats = null;
        let learnedStats = null;

        if (rtreeResult.status === 'fulfilled' && rtreeResult.value.ok) {
            const data = await rtreeResult.value.json();
            lote = data.lote;
            rtreeStats = data.stats;
        }
        if (learnedResult.status === 'fulfilled' && learnedResult.value.ok) {
            const data = await learnedResult.value.json();
            lote = data.lote;
            learnedStats = data.stats;
        }

        if (!lote) {
            Swal.fire({
                title: '> sin_coincidencias',
                text: 'No se encontró ningún lote en esta coordenada.',
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

        ultimoLoteCentro = lote.center;

        const realRtreeTime = rtreeStats ? rtreeStats.rtree_search_time_ms : null;
        if (isPGMMapDebugActive() && learnedStats && lote.center) {
            await ejecutarSimulacionPasoAPasoPGM(lote, learnedStats, realRtreeTime);
        } else {
            mostrarLoteEnVisor(lote);
        }
        abrirLoteModal(lote.id_lote, learnedStats, realRtreeTime);

        // Actualizar HUD con ambos tiempos
        const learnedTime = learnedStats ? learnedStats.learned_search_time_ms : null;
        if (realRtreeTime !== null && learnedTime !== null) {
            actualizarHudRendimientoLearned(learnedTime, realRtreeTime);
        } else if (realRtreeTime !== null) {
            actualizarHudRendimiento(realRtreeTime);
        }
    } catch (err) {
        console.error("Error en búsqueda unificada visor:", err);
    }
}

window.buscarLoteUnificadoVisor = buscarLoteUnificadoVisor;