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
                    dbCountEl.textContent = `${data.count.toLocaleString()} lotes urbanos`;
                }
            }
        } catch (error) {
            agregarLog(`Error de monitoreo: ${error.message}`, "error");
            clearInterval(syncInterval);
            btn.disabled = false;
        }
    }, 2500);
}

// Estado de animación del randomizador/dado
let isRandomizing = false;

// Inicializa el fondo animado tipo mapa digital/catastral vectorizado
function inicializarMapaFondo() {
    const canvas = document.getElementById("bg-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    
    let w, h;
    function resize() {
        w = canvas.width = window.innerWidth;
        h = canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);
    
    let scrollX = 0;
    let scrollY = 0;
    
    // Coordenadas del cursor en pantalla para la iluminación interactiva
    let mouseX = -1000;
    let mouseY = -1000;
    
    // Bandera para evitar iluminar el fondo cuando el cursor está sobre la tarjeta protagonista
    let cursorSobreTarjeta = false;
    const heroCard = document.querySelector(".hero-lote-card");
    if (heroCard) {
        heroCard.addEventListener("mouseenter", () => {
            cursorSobreTarjeta = true;
            mouseX = -1000;
            mouseY = -1000;
        });
        heroCard.addEventListener("mouseleave", () => {
            cursorSobreTarjeta = false;
        });
    }
    
    window.addEventListener("mousemove", (e) => {
        if (cursorSobreTarjeta) {
            mouseX = -1000;
            mouseY = -1000;
            return;
        }
        mouseX = e.clientX;
        mouseY = e.clientY;
    });
    
    window.addEventListener("mouseleave", () => {
        mouseX = -1000;
        mouseY = -1000;
    });
    
    // Generador determinista rápido para evitar parpadeos en los lotes del fondo al desplazarse
    function crearRandom(seed) {
        let current = seed;
        return function() {
            current = (current * 9301 + 49297) % 233280;
            return current / 233280;
        };
    }
    
    function draw() {
        ctx.clearRect(0, 0, w, h);
        
        // Paneo muy lento y suave
        scrollX += 0.20;
        scrollY += 0.12;
        
        const gridSize = 160;
        const offsetX = scrollX % gridSize;
        const offsetY = scrollY % gridSize;
        
        // --- 1. DIBUJAR VÍAS BASE (Gris Pálido) ---
        ctx.strokeStyle = "rgba(148, 163, 184, 0.14)";
        ctx.lineWidth = 1.5;
        
        // Líneas Verticales
        for (let x = -gridSize; x < w + gridSize; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x + offsetX, 0);
            ctx.lineTo(x + offsetX, h);
            ctx.stroke();
        }
        // Líneas Horizontales
        for (let y = -gridSize; y < h + gridSize; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y + offsetY);
            ctx.lineTo(w, y + offsetY);
            ctx.stroke();
        }
        
        // --- 2. DIBUJAR DIVISIONES PREDIALES DENTRO DE MANZANAS (Deterministas & Reactivas) ---
        for (let x = -gridSize; x < w + gridSize; x += gridSize) {
            for (let y = -gridSize; y < h + gridSize; y += gridSize) {
                const cellX = x + offsetX;
                const cellY = y + offsetY;
                
                const blockPadding = 25;
                const blockWidth = gridSize - blockPadding * 2;
                const blockHeight = gridSize - blockPadding * 2;
                
                const gridX = Math.floor(x / gridSize);
                const gridY = Math.floor(y / gridSize);
                const cellSeed = (Math.abs(gridX) * 353 + Math.abs(gridY) * 919) % 1000;
                const rnd = crearRandom(cellSeed);
                
                const rowsCount = rnd() > 0.5 ? 2 : 1;
                const colsCount = rnd() > 0.5 ? 2 : 3;
                
                const pw = blockWidth / colsCount;
                const ph = blockHeight / rowsCount;
                
                for (let r = 0; r < rowsCount; r++) {
                    for (let c = 0; c < colsCount; c++) {
                        if (rnd() < 0.12) continue;
                        
                        const px = cellX + blockPadding + c * pw;
                        const py = cellY + blockPadding + r * ph;
                        
                        const pad = 3;
                        
                        const p1x = px + pad + rnd() * 2.5;
                        const p1y = py + pad + rnd() * 2.5;
                        const p2x = px + pw - pad - rnd() * 2.5;
                        const p2y = py + pad + rnd() * 2.5;
                        const p3x = px + pw - pad - rnd() * 2.5;
                        const p3y = py + ph - pad - rnd() * 2.5;
                        const p4x = px + pad + rnd() * 2.5;
                        const p4y = py + ph - pad - rnd() * 2.5;
                        
                        ctx.beginPath();
                        ctx.moveTo(p1x, p1y);
                        ctx.lineTo(p2x, p2y);
                        ctx.lineTo(p3x, p3y);
                        ctx.lineTo(p4x, p4y);
                        ctx.closePath();
                        
                        // Calcular centro del lote para interacciones
                        const cx = px + pw / 2;
                        const cy = py + ph / 2;
                        
                        let fillStyle = "rgba(148, 163, 184, 0.04)";
                        let strokeStyle = "rgba(148, 163, 184, 0.08)";
                        
                        if (mouseX >= 0 && mouseY >= 0) {
                            const dx = cx - mouseX;
                            const dy = cy - mouseY;
                            const dist = Math.sqrt(dx * dx + dy * dy);
                            
                            if (dist < 160) {
                                const intensity = (160 - dist) / 160;
                                fillStyle = `rgba(129, 140, 248, ${0.04 + intensity * 0.22})`;
                                strokeStyle = `rgba(129, 140, 248, ${0.08 + intensity * 0.35})`;
                            } else if (cellSeed % 23 === 0) {
                                const timeFactor = (Math.sin(Date.now() * 0.0018 + cellSeed) + 1) / 2;
                                fillStyle = `rgba(168, 85, 247, ${0.02 + timeFactor * 0.07})`;
                                strokeStyle = `rgba(168, 85, 247, ${0.06 + timeFactor * 0.12})`;
                            }
                        } else if (cellSeed % 23 === 0) {
                            const timeFactor = (Math.sin(Date.now() * 0.0018 + cellSeed) + 1) / 2;
                            fillStyle = `rgba(168, 85, 247, ${0.02 + timeFactor * 0.07})`;
                            strokeStyle = `rgba(168, 85, 247, ${0.06 + timeFactor * 0.12})`;
                        }
                        
                        ctx.fillStyle = fillStyle;
                        ctx.strokeStyle = strokeStyle;
                        ctx.fill();
                        ctx.stroke();
                    }
                }
                
                if ((gridX + gridY) % 5 === 0) {
                    ctx.fillStyle = "rgba(148, 163, 184, 0.35)";
                    ctx.font = "8px 'Fira Code', monospace";
                    const simulatedLat = (-12.046 + (y / h) * 0.04).toFixed(4);
                    const simulatedLon = (-77.035 + (x / w) * 0.04).toFixed(4);
                    ctx.fillText(`GPS [${simulatedLat}, ${simulatedLon}]`, cellX + 5, cellY - 5);
                }
            }
        }
        
        // --- 3. ILUMINAR VÍAS DE FORMA INTERACTIVA AL HOVER DEL MOUSE ---
        if (mouseX >= 0 && mouseY >= 0) {
            const grad = ctx.createRadialGradient(mouseX, mouseY, 10, mouseX, mouseY, 160);
            grad.addColorStop(0, "rgba(129, 140, 248, 0.35)");
            grad.addColorStop(0.4, "rgba(129, 140, 248, 0.1)");
            grad.addColorStop(1, "rgba(129, 140, 248, 0)");
            
            ctx.strokeStyle = grad;
            ctx.lineWidth = 2.0;
            
            for (let x = -gridSize; x < w + gridSize; x += gridSize) {
                ctx.beginPath();
                ctx.moveTo(x + offsetX, 0);
                ctx.lineTo(x + offsetX, h);
                ctx.stroke();
            }
            for (let y = -gridSize; y < h + gridSize; y += gridSize) {
                ctx.beginPath();
                ctx.moveTo(0, y + offsetY);
                ctx.lineTo(w, y + offsetY);
                ctx.stroke();
            }
        }
        
        requestAnimationFrame(draw);
    }
    
    draw();
}

// Genera un bucle visual rápido simulando un escaneo en base de datos
function animarScanner(realDataCallback) {
    const placeholder = document.getElementById("lote-preview-placeholder");
    if (placeholder) placeholder.textContent = "";
    
    const elements = {
        id: document.getElementById("pres-id"),
        ciudad: document.getElementById("pres-ciudad"),
        area: document.getElementById("pres-area"),
        peri: document.getElementById("pres-peri"),
        coords: document.getElementById("pres-coords"),
        time: document.getElementById("pres-time")
    };
    
    const interval = setInterval(() => {
        // Construir un polígono aleatorio de 4 a 5 vértices dentro del canvas 240x240
        const mockCoords = [];
        const ptsCount = 4 + Math.floor(Math.random() * 2);
        const padding = 40;
        const spread = 160;
        
        for (let i = 0; i < ptsCount; i++) {
            mockCoords.push([
                padding + Math.random() * spread,
                padding + Math.random() * spread
            ]);
        }
        mockCoords.push(mockCoords[0]); // Cerrar el polígono
        
        const mockGeom = {
            type: "Polygon",
            coordinates: [mockCoords]
        };
        renderizarLoteSVG(mockGeom);
        
        // Mutar textos en pantalla a velocidades de microsegundos (incluyendo nombres de ciudades en barrido)
        const cities = ["Lima", "Arequipa", "Cusco", "Puno", "Juliaca", "Trujillo", "Chiclayo", "Piura", "Huancayo", "Iquitos"];
        elements.id.textContent = `21010101${Math.floor(Math.random() * 900000) + 100000}`;
        elements.ciudad.textContent = cities[Math.floor(Math.random() * cities.length)];
        elements.area.textContent = `${(Math.random() * 150 + 50).toFixed(2)} m²`;
        elements.peri.textContent = `${(Math.random() * 60 + 20).toFixed(2)} m`;
        elements.coords.textContent = `${(-15 - Math.random() * 2).toFixed(4)}, ${(-70 - Math.random() * 2).toFixed(4)}`;
        elements.time.textContent = `${(Math.random() * 10 + 20).toFixed(3)} ms`;
        
    }, 50);
    
    return () => {
        clearInterval(interval);
        realDataCallback();
    };
}

async function cargarLoteAleatorio() {
    if (isRandomizing) return;
    isRandomizing = true;
    
    const diceBtn = document.querySelector(".btn-dice");
    if (diceBtn) {
        diceBtn.disabled = true;
        diceBtn.classList.add("spinning");
        setTimeout(() => diceBtn.classList.remove("spinning"), 500);
    }
    
    let fetchResolved = false;
    let realData = null;
    let errorOccurred = null;
    
    // Iniciar fetch en paralelo
    const fetchPromise = fetch("/api/lotes/random")
        .then(async r => {
            if (!r.ok) throw new Error("Error en servidor");
            realData = await r.json();
            fetchResolved = true;
        })
        .catch(err => {
            errorOccurred = err;
            fetchResolved = true;
        });
        
    // Lanzar escáner animado
    const stopScanner = animarScanner(() => {
        if (errorOccurred) {
            console.error("Error al cargar lote aleatorio:", errorOccurred);
            const placeholder = document.getElementById("lote-preview-placeholder");
            if (placeholder) placeholder.textContent = "Error al cargar";
        } else if (realData) {
            actualizarLotePresentador(realData);
        }
        isRandomizing = false;
        if (diceBtn) diceBtn.disabled = false;
    });
    
    // Ejecutar scanner por al menos 700ms para impacto estético
    setTimeout(async () => {
        while (!fetchResolved) {
            await new Promise(r => setTimeout(r, 40));
        }
        stopScanner();
    }, 700);
}

async function buscarLotePorId() {
    if (isRandomizing) return;
    
    const idInput = document.getElementById("search-lote-input").value.trim();
    if (!idInput || idInput.length !== 14) {
        alert("Por favor ingrese un código catastral válido de 14 dígitos.");
        return;
    }
    
    isRandomizing = true;
    
    let fetchResolved = false;
    let realData = null;
    let errorOccurred = null;
    
    const fetchPromise = fetch(`/api/lotes/${idInput}`)
        .then(async r => {
            if (r.status === 404) throw new Error("Lote no encontrado en la base de datos.");
            if (!r.ok) throw new Error("Error en la búsqueda.");
            realData = await r.json();
            fetchResolved = true;
        })
        .catch(err => {
            errorOccurred = err;
            fetchResolved = true;
        });
        
    const stopScanner = animarScanner(() => {
        if (errorOccurred) {
            alert(errorOccurred.message);
            const placeholder = document.getElementById("lote-preview-placeholder");
            if (placeholder) placeholder.textContent = "No encontrado";
            document.getElementById("pres-id").textContent = "-";
            document.getElementById("pres-ciudad").textContent = "-";
            document.getElementById("pres-area").textContent = "-";
            document.getElementById("pres-peri").textContent = "-";
            document.getElementById("pres-coords").textContent = "-";
            document.getElementById("pres-time").textContent = "-";
        } else if (realData) {
            actualizarLotePresentador(realData);
        }
        isRandomizing = false;
    });
    
    setTimeout(async () => {
        while (!fetchResolved) {
            await new Promise(r => setTimeout(r, 40));
        }
        stopScanner();
    }, 700);
}

function actualizarLotePresentador(data) {
    document.getElementById("pres-id").textContent = data.id_lote;
    document.getElementById("pres-ciudad").textContent = data.ciudad || "Sector Sintético";
    document.getElementById("pres-area").textContent = data.area_grafica ? Number(data.area_grafica).toFixed(2) + " m²" : "N/D";
    document.getElementById("pres-peri").textContent = data.peri_grafico ? Number(data.peri_grafico).toFixed(2) + " m" : "N/D";
    document.getElementById("pres-coords").textContent = data.center ? `${Number(data.center.lat).toFixed(5)}, ${Number(data.center.lon).toFixed(5)}` : "N/D";
    document.getElementById("pres-time").textContent = data.execution_time_ms ? `${data.execution_time_ms} ms` : "N/D";
    
    const mapBtn = document.getElementById("btn-ver-mapa");
    if (mapBtn && data.center) {
        mapBtn.href = `/visor?lat=${data.center.lat}&lon=${data.center.lon}&zoom=18&id=${data.id_lote}`;
    }
    
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

// Inicializar la página cargando el estado inicial y vinculando efectos interactivos
document.addEventListener("DOMContentLoaded", async () => {
    // Exponer las funciones globalmente
    window.cargarPreset = cargarPreset;
    window.iniciarSincronizacion = iniciarSincronizacion;
    window.cargarLoteAleatorio = cargarLoteAleatorio;
    window.buscarLotePorId = buscarLotePorId;
    
    const dbNameEl = document.getElementById("db-name");
    const dbCountEl = document.getElementById("db-count");

    // Inicializar mapa vectorial flotante de fondo
    inicializarMapaFondo();

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
            
            const rotateX = ((centerY - y) / centerY) * 12; 
            const rotateY = ((x - centerX) / centerX) * 12;  
            
            svg.style.transition = "transform 0.08s ease-out, filter 0.15s ease-out";
            svg.style.transform = `perspective(600px) scale(1.03) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg)`;
            svg.style.filter = "drop-shadow(0 10px 15px rgba(0, 0, 0, 0.22))";
        });
        
        polygon.addEventListener("mouseleave", () => {
            svg.style.transition = "transform 0.4s cubic-bezier(0.25, 1, 0.5, 1), filter 0.4s ease";
            svg.style.transform = `perspective(600px) scale(1) rotateX(0deg) rotateY(0deg)`;
            svg.style.filter = "drop-shadow(0 4px 6px rgba(0, 0, 0, 0.15))";
        });

        // Hacer que al hacer clic en el lote protagonista se redirija a su posición en el mapa
        svg.addEventListener("click", () => {
            const mapBtn = document.getElementById("btn-ver-mapa");
            if (mapBtn && mapBtn.getAttribute("href")) {
                window.location.href = mapBtn.getAttribute("href");
            }
        });
    }

    // Vincular controles de búsqueda expandibles minimalistas
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
                buscarLotePorId();
            }
        });
        
        searchInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
                buscarLotePorId();
            }
        });
        
        document.addEventListener("click", (e) => {
            if (!searchContainer.contains(e.target) && searchContainer.classList.contains("expanded") && searchInput.value === "") {
                searchContainer.classList.remove("expanded");
            }
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