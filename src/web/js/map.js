// Renderer Canvas — dramáticamente más eficiente que SVG para >500 geometrías
const canvasRenderer = L.canvas({ padding: 0.5 });

// Inicializar el mapa
const map = L.map('map', {
    zoomControl: false,
    preferCanvas: true,
    renderer: canvasRenderer
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
        maxZoom: 20
    },
    satellite: {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attrib: 'Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        maxZoom: 19
    },
    osm: {
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attrib: '© OpenStreetMap contributors',
        maxZoom: 19
    },
    light: {
        url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        attrib: '© OpenStreetMap contributors, © CartoDB',
        maxZoom: 20
    }
};

// Añadir la capa base por defecto (CartoDB Dark)
let baseTileLayer = L.tileLayer(MAP_STYLES.dark.url, {
    maxZoom: MAP_STYLES.dark.maxZoom,
    attribution: MAP_STYLES.dark.attrib
}).addTo(map);

// Crear panel informativo personalizado en el mapa
const infoControl = L.control({ position: 'topleft' });
infoControl.onAdd = function (map) {
    const div = L.DomUtil.create('div', 'map-info-panel-retro');
    div.innerHTML = `<span id="info-msg">> inicializando_visor...</span>`;
    return div;
};
infoControl.addTo(map);

// Capa contenedora para los lotes y geometrías del catastro
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
    document.getElementById("modal-pres-time").textContent = "-";
    
    try {
        const response = await fetch(`/api/lotes/${idLote}`);
        if (!response.ok) throw new Error("No se pudo obtener información del lote.");
        const data = await response.json();
        
        document.getElementById("modal-pres-id").textContent = data.id_lote;
        document.getElementById("modal-pres-area").textContent = data.area_grafica ? Number(data.area_grafica).toFixed(2) + " m²" : "N/D";
        document.getElementById("modal-pres-peri").textContent = data.peri_grafico ? Number(data.peri_grafico).toFixed(2) + " m" : "N/D";
        document.getElementById("modal-pres-coords").textContent = data.center ? `${Number(data.center.lat).toFixed(5)}, ${Number(data.center.lon).toFixed(5)}` : "N/D";
        document.getElementById("modal-pres-ciudad").textContent = data.ciudad || "Sector Sintético";
        document.getElementById("modal-pres-time").textContent = data.execution_time_ms ? `${data.execution_time_ms} ms` : "N/D";
        
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
            // Opcional: limpiar la variable tras abrir el popup una vez para que no interfiera en movimientos futuros
            highlightLoteId = null;
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
    
    try {
        // Hacemos una consulta rápida simplificada (a nivel macro)
        const response = await fetch('/api/lotes/?zoom=11');
        if (!response.ok) throw new Error('Error de inicialización');
        const data = await response.json();
        
        if (data.features && data.features.length > 0) {
            // Cargar geometrías temporales para calcular el encuadre
            lotesLayer.addData(data);
            const bounds = lotesLayer.getBounds();
            map.fitBounds(bounds);
            
            // Forzar acercamiento a nivel de parcela (Zoom 16) tras un ligero retraso de transición
            setTimeout(() => {
                map.setZoom(16);
                // Registrar el evento de movimiento del mapa
                map.on('moveend', cargarLotesPorViewport);
                cargarLotesPorViewport();
            }, 800);
        } else {
            // Si no hay datos, enfocar Puno Centro por defecto
            map.setView([-15.8402, -70.0219], 16);
            map.on('moveend', cargarLotesPorViewport);
            cargarLotesPorViewport();
        }
    } catch (error) {
        console.error("Fallo al inicializar la cámara:", error);
        map.setView([-15.8402, -70.0219], 16);
        map.on('moveend', cargarLotesPorViewport);
        cargarLotesPorViewport();
    }
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
            highlightLoteId = data.id_lote;
            map.flyTo([data.center.lat, data.center.lon], 18, {
                duration: 1.5
            });

            // Actualizar el selector de ciudad si la ciudad del lote existe en el select
            if (data.ciudad) {
                const citySelector = document.getElementById("city-selector");
                if (citySelector) {
                    const normalizedCity = data.ciudad.toLowerCase()
                        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                        .replace(/\s+/g, "");
                    const optionExists = Array.from(citySelector.options).some(opt => opt.value === normalizedCity);
                    if (optionExists) {
                        citySelector.value = normalizedCity;
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
        alert("Por favor ingrese un código catastral válido de 14 dígitos.");
        return;
    }
    
    try {
        const response = await fetch(`/api/lotes/${idInput}`);
        if (response.status === 404) {
            alert("Lote no encontrado en la base de datos.");
            return;
        }
        if (!response.ok) throw new Error("Error en búsqueda.");
        const data = await response.json();
        
        if (data.center) {
            highlightLoteId = data.id_lote;
            map.flyTo([data.center.lat, data.center.lon], 18, {
                duration: 1.5
            });
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
            if (opacityLabel) opacityLabel.textContent = `${e.target.value}%`;
            aplicarColorLotes();
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

    // — Efecto tilt 3D en el polígono del modal —
    const modalPolygon = document.getElementById("modal-lote-polygon");
    const modalSvg     = document.getElementById("modal-lote-svg");
    if (modalPolygon && modalSvg) {
        modalPolygon.addEventListener("mousemove", (e) => {
            const rect = modalSvg.getBoundingClientRect();
            const rotX = ((rect.height/2 - (e.clientY - rect.top)) / (rect.height/2)) * 12;
            const rotY = (((e.clientX - rect.left) - rect.width/2) / (rect.width/2)) * 12;
            modalSvg.style.transition = "transform 0.08s ease-out";
            modalSvg.style.transform  = `perspective(600px) scale(1.03) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg)`;
        });
        modalPolygon.addEventListener("mouseleave", () => {
            modalSvg.style.transition = "transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)";
            modalSvg.style.transform  = "perspective(600px) scale(1) rotateX(0deg) rotateY(0deg)";
        });
    }

    // — Stats iniciales —
    actualizarStats();
});

// Arrancar visor
inicializarVisor();