// Inicializar el mapa centrado en Puno, Perú (Coordenadas Geográficas WGS84)
const map = L.map('map', {
    zoomControl: false // Deshabilitamos control por defecto para posicionarlo en un lugar más limpio
}).setView([-15.8402, -70.0219], 13);

// Añadir control de zoom en una posición más discreta
L.control.zoom({ position: 'bottomright' }).addTo(map);

// Añadir capa base de OpenStreetMap (Estilo claro/estándar, que se oscurecerá mediante filtro CSS)
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Crear panel informativo personalizado en el mapa
const infoControl = L.control({ position: 'topleft' });
infoControl.onAdd = function (map) {
    const div = L.DomUtil.create('div', 'map-info-panel');
    div.innerHTML = `
        <div style="background: rgba(11, 15, 25, 0.95); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 8px; padding: 10px 15px; color: #fff; font-family: 'Outfit', sans-serif; font-size: 13px; backdrop-filter: blur(8px); box-shadow: 0 4px 15px rgba(0,0,0,0.5); display: flex; align-items: center; gap: 0.5rem;">
            <span id="info-msg"><span class="spinner"></span> Inicializando visor...</span>
        </div>
    `;
    return div;
};
infoControl.addTo(map);

// Capa contenedora para los lotes y geometrías del catastro
const lotesLayer = L.geoJSON(null, {
    style: function (feature) {
        return {
            color: "#2c3e50",     
            weight: 1.5,
            fillColor: "#3498db",   
            fillOpacity: 0.35
        };
    },
    onEachFeature: function (feature, layer) {
        if (feature.properties) {
            const props = feature.properties;
            let popupContent = `
                <div style="font-size: 13px; line-height: 1.6;">
                    <div style="font-weight: 700; color: #3b82f6; margin-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px;">
                        Detalle Catastral
                    </div>
                    <div><b>Código Lote:</b> ${props.id_lote || 'N/D'}</div>
                    <div><b>Área Gráfica:</b> ${props.area_grafica ? Number(props.area_grafica).toFixed(2) + ' m²' : 'N/D'}</div>
                    <div><b>Perímetro:</b> ${props.peri_grafico ? Number(props.peri_grafico).toFixed(2) + ' m' : 'N/D'}</div>
                </div>
            `;
            layer.bindPopup(popupContent);
        }
    }
}).addTo(map);

// Controlador de abortos para evitar colisiones de peticiones cruzadas al mover el mapa rápidamente
let activeAbortController = null;

// Función para cargar los lotes intersectados por el Bounding Box de la pantalla
async function cargarLotesPorViewport() {
    const zoom = map.getZoom();
    const infoMsg = document.getElementById("info-msg");
    
    // Si la cámara está muy alejada, no cargamos geometría para evitar colapso de red
    if (zoom < 15) {
        lotesLayer.clearLayers();
        if (infoMsg) {
            infoMsg.innerHTML = '<span style="color: #f59e0b; font-weight:600;">⚠️ Acerca el mapa (Zoom >= 15) para cargar parcelas</span>';
        }
        return;
    }
    
    if (infoMsg) {
        infoMsg.innerHTML = `<span style="color: #3b82f6;"><span class="spinner"></span> Renderizando parcelas en pantalla...</span>`;
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
        
        if (infoMsg) {
            const count = data.features ? data.features.length : 0;
            infoMsg.innerHTML = `<span style="color: #10b981; font-weight:600;">⚡ ${count} parcelas cargadas (Zoom: ${zoom})</span>`;
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            return; // Ignorar el aborto controlado
        }
        console.error("Error al recuperar el catastro gráfico:", error);
        if (infoMsg) {
            infoMsg.innerHTML = '<span style="color: #ef4444; font-weight:600;">❌ Error al recuperar el catastro</span>';
        }
    }
}

// Inicializar el visor enfocando la extensión general de datos de Puno
async function inicializarVisor() {
    const infoMsg = document.getElementById("info-msg");
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
    ayacucho: [-13.160, -74.225]
};

function irACiudad(ciudad) {
    const coords = CITY_COORDS[ciudad];
    if (coords) {
        map.flyTo(coords, 16, {
            duration: 1.5,
            easeLinearity: 0.25
        });
    }
}

// Exponer la función globalmente para el control HTML
window.irACiudad = irACiudad;

// Arrancar visor
inicializarVisor();