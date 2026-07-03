// Inicializar el mapa centrado en Puno, Perú (Coordenadas Geográficas WGS84)
const map = L.map('map').setView([-15.8402, -70.0219], 14);

// Añadir capa base de OpenStreetMap (Estilo claro/estándar)
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Capa contenedora para los lotes y geometrías del catastro
const lotesLayer = L.geoJSON(null, {
    style: function (feature) {
        return {
            color: "#2c3e50",     
            weight: 1.5,
            fillColor: "#3498db",   
            fillOpacity: 0.4
        };
    },
    onEachFeature: function (feature, layer) {
        if (feature.properties && feature.properties.id_lote) {
            layer.bindPopup(`<b>Código de Lote:</b> ${feature.properties.id_lote}`);
        }
    }
}).addTo(map);

// Función global para cargar datos desde el backend de FastAPI
async function cargarLotesDisponibles() {
    try {
        const response = await fetch('http://localhost:8010/api/lotes/');
        if (!response.ok) throw new Error('Error al consultar la API catastral');
        const data = await response.json();
        
        // Limpiar geometrías previas e inyectar el nuevo GeoJSON
        lotesLayer.clearLayers();
        lotesLayer.addData(data);
    } catch (error) {
        console.error("Error cargando la cartografía de la API:", error);
    }
}

// Ejecutar la carga inicial al abrir el visor
// cargarLotesDisponibles(); // Descomentar cuando el endpoint de FastAPI devuelva GeoJSON