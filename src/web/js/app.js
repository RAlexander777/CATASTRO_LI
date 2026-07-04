const PRESETS = {
    puno_urbano: { min_lat: -15.850, min_lon: -70.040, max_lat: -15.820, max_lon: -69.995 },
    arequipa: { min_lat: -16.408, min_lon: -71.545, max_lat: -16.392, max_lon: -71.530 },
    cusco: { min_lat: -13.525, min_lon: -71.988, max_lat: -13.513, max_lon: -71.970 },
    lima: { min_lat: -12.055, min_lon: -77.045, max_lat: -12.038, max_lon: -77.020 },
    la_paz: { min_lat: -16.508, min_lon: -68.140, max_lat: -16.495, max_lon: -68.125 }
};

function cargarPreset(nombre) {
    const preset = PRESETS[nombre];
    if (!preset) return;
    document.getElementById("min_lat").value = preset.min_lat;
    document.getElementById("min_lon").value = preset.min_lon;
    document.getElementById("max_lat").value = preset.max_lat;
    document.getElementById("max_lon").value = preset.max_lon;
    
    agregarLog(`Preset cargado: ${nombre.toUpperCase().replace('_', ' ')}`, 'info');
}

function agregarLog(mensaje, tipo = '') {
    const consoleLog = document.getElementById("console-log");
    if (!consoleLog) return;
    
    const time = new Date().toLocaleTimeString();
    const line = document.createElement("p");
    line.className = `console-line ${tipo}`;
    line.innerHTML = `<span style="opacity: 0.6;">[${time}]</span> <span>${mensaje}</span>`;
    consoleLog.appendChild(line);
    consoleLog.scrollTop = consoleLog.scrollHeight;
}

let syncInterval = null;

async function iniciarSincronizacion() {
    const min_lat = parseFloat(document.getElementById("min_lat").value);
    const min_lon = parseFloat(document.getElementById("min_lon").value);
    const max_lat = parseFloat(document.getElementById("max_lat").value);
    const max_lon = parseFloat(document.getElementById("max_lon").value);
    const accumulate = document.getElementById("accumulate").checked;
    
    const btn = document.getElementById("btn-sync");
    btn.disabled = true;
    
    agregarLog(`Solicitando sincronización (${accumulate ? 'ACUMULAR' : 'SOBRESCRIBIR'}) al servidor...`, "info");
    
    try {
        const response = await fetch("/api/lotes/reload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ min_lat, min_lon, max_lat, max_lon, accumulate })
        });
        
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.detail || "Error al iniciar sincronización");
        }
        
        agregarLog("Sincronización iniciada en segundo plano con éxito.", "info");
        monitorearEstado();
        
    } catch (error) {
        agregarLog(`Fallo al iniciar: ${error.message}`, "error");
        btn.disabled = false;
    }
}

async function monitorearEstado() {
    const btn = document.getElementById("btn-sync");
    btn.disabled = true;
    
    if (syncInterval) clearInterval(syncInterval);
    
    syncInterval = setInterval(async () => {
        try {
            const response = await fetch("/api/lotes/sync-status");
            if (!response.ok) throw new Error("No se pudo obtener el estado.");
            
            const data = await response.json();
            
            // Solo agregar log si el mensaje cambia o es un hito de éxito/error
            agregarLog(data.message, data.status === 'failed' ? 'error' : (data.status === 'success' ? 'info' : ''));
            
            if (data.status !== 'running') {
                clearInterval(syncInterval);
                btn.disabled = false;
                
                // Actualizar volumen de datos en la UI
                const dbCountEl = document.getElementById("db-count");
                if (dbCountEl && data.count) {
                    dbCountEl.textContent = `${data.count.toLocaleString()} parcelas urbanas`;
                }
            }
        } catch (error) {
            agregarLog(`Error de monitoreo: ${error.message}`, "error");
            clearInterval(syncInterval);
            btn.disabled = false;
        }
    }, 2500);
}

async function cargarLoteAleatorio() {
    const placeholder = document.getElementById("lote-preview-placeholder");
    if (placeholder) placeholder.textContent = "Obteniendo lote...";
    
    try {
        const response = await fetch("/api/lotes/random");
        if (!response.ok) throw new Error("No se pudo obtener un lote aleatorio.");
        const data = await response.json();
        actualizarLotePresentador(data);
    } catch (error) {
        console.error("Error al cargar lote aleatorio:", error);
        if (placeholder) placeholder.textContent = "Error al cargar";
    }
}

async function buscarLotePorId() {
    const idInput = document.getElementById("search-lote-input").value.trim();
    if (!idInput || idInput.length !== 14) {
        alert("Por favor ingrese un código catastral válido de 14 dígitos.");
        return;
    }
    
    const placeholder = document.getElementById("lote-preview-placeholder");
    if (placeholder) placeholder.textContent = "Buscando lote...";
    
    try {
        const response = await fetch(`/api/lotes/${idInput}`);
        if (response.status === 404) {
            throw new Error("Lote no encontrado.");
        }
        if (!response.ok) throw new Error("Error en la búsqueda.");
        const data = await response.json();
        actualizarLotePresentador(data);
    } catch (error) {
        alert(error.message);
        if (placeholder) placeholder.textContent = "No encontrado";
    }
}

function actualizarLotePresentador(data) {
    document.getElementById("pres-id").textContent = data.id_lote;
    document.getElementById("pres-area").textContent = data.area_grafica ? Number(data.area_grafica).toFixed(2) + " m²" : "N/D";
    document.getElementById("pres-peri").textContent = data.peri_grafico ? Number(data.peri_grafico).toFixed(2) + " m" : "N/D";
    document.getElementById("pres-coords").textContent = data.center ? `${Number(data.center.lat).toFixed(5)}, ${Number(data.center.lon).toFixed(5)}` : "N/D";
    document.getElementById("pres-time").textContent = data.execution_time_ms ? `${data.execution_time_ms} ms` : "N/D";
    
    // Configurar enlace para el visor
    const mapBtn = document.getElementById("btn-ver-mapa");
    if (mapBtn && data.center) {
        mapBtn.href = `/visor?lat=${data.center.lat}&lon=${data.center.lon}&zoom=18&id=${data.id_lote}`;
    }
    
    // Dibujar SVG
    renderizarLoteSVG(data.geom);
}

function renderizarLoteSVG(geom) {
    const placeholder = document.getElementById("lote-preview-placeholder");
    const polygon = document.getElementById("lote-polygon");
    
    if (!geom || geom.type !== "Polygon" || !geom.coordinates || geom.coordinates.length === 0) {
        if (placeholder) placeholder.textContent = "Sin geometría";
        if (polygon) polygon.setAttribute("points", "");
        return;
    }
    
    const coordinates = geom.coordinates[0]; // Anillo exterior
    if (coordinates.length < 3) {
        if (placeholder) placeholder.textContent = "Geometría inválida";
        return;
    }
    
    // Obtener límites
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
    const padding = 30; // Margen interno
    
    // Escalar puntos al canvas SVG
    const points = coordinates.map(p => {
        const x = padding + ((p[0] - min_x) / (w || 1)) * (size - 2 * padding);
        // Invertir eje Y para el SVG
        const y = (size - padding) - ((p[1] - min_y) / (h || 1)) * (size - 2 * padding);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    
    if (polygon) {
        polygon.setAttribute("points", points);
    }
    if (placeholder) {
        placeholder.textContent = ""; // Ocultar cargando
    }
}

// Inicializar la página cargando el estado inicial y vinculando efectos interactivos
document.addEventListener("DOMContentLoaded", async () => {
    // Exponer las funciones globalmente
    window.cargarPreset = cargarPreset;
    window.iniciarSincronizacion = iniciarSincronizacion;
    window.cargarLoteAleatorio = cargarLoteAleatorio;
    window.buscarLotePorId = buscarLotePorId;
    
    const dbNameEl = document.getElementById("db-name");
    const dbCountEl = document.getElementById("db-count");

    // Configurar efecto 3D Tilt que actúa ÚNICAMENTE al flotar sobre el polígono del lote
    const polygon = document.getElementById("lote-polygon");
    const svg = document.getElementById("lote-svg");
    
    if (polygon && svg) {
        polygon.addEventListener("mousemove", (e) => {
            const rect = svg.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            // Inclinación de 12 grados para una respuesta física clara
            const rotateX = ((centerY - y) / centerY) * 12; // Inclinación vertical (arriba/abajo)
            const rotateY = ((x - centerX) / centerX) * 12;  // Inclinación horizontal (derecha/izquierda)
            
            // Una transición ultrarrápida (0.08s) suaviza el salto de entrada inicial sin retardar el tracking del mouse
            svg.style.transition = "transform 0.08s ease-out, filter 0.15s ease-out";
            svg.style.transform = `perspective(600px) scale(1.03) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg)`;
            
            // Sombra desaturada suave y natural (sin brillo de color) que se expande en hover
            svg.style.filter = "drop-shadow(0 10px 15px rgba(0, 0, 0, 0.22))";
        });
        
        polygon.addEventListener("mouseleave", () => {
            // Regresar al estado inicial con una transición suave y amortiguada
            svg.style.transition = "transform 0.4s cubic-bezier(0.25, 1, 0.5, 1), filter 0.4s ease";
            svg.style.transform = `perspective(600px) scale(1) rotateX(0deg) rotateY(0deg)`;
            svg.style.filter = "drop-shadow(0 4px 6px rgba(0, 0, 0, 0.15))";
        });
    }

    try {
        const response = await fetch("/api/status");
        if (!response.ok) throw new Error("Error de comunicación");
        
        const data = await response.json();

        if (dbNameEl) dbNameEl.textContent = data.database.toUpperCase();
        if (dbCountEl) dbCountEl.textContent = data.total_records;

        // Cargar lote inicial
        cargarLoteAleatorio();

        // Verificar si ya hay una sincronización corriendo al cargar la página
        const syncResponse = await fetch("/api/lotes/sync-status");
        if (syncResponse.ok) {
            const syncData = await syncResponse.json();
            if (syncData.status === "running") {
                agregarLog("Sincronización activa detectada. Conectando al monitor...", "info");
                monitorearEstado();
            }
        }

    } catch (error) {
        console.error("No se pudo recuperar el estado de los servicios:", error);
        if (dbNameEl) dbNameEl.textContent = "POSTGRESQL (DESCONECTADO)";
        if (dbCountEl) dbCountEl.textContent = "No disponible";
    }
});