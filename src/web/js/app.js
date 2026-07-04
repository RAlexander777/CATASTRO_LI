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
                    const textX = cellX + 5;
                    const textY = cellY - 5;
                    let textStyle = "rgba(148, 163, 184, 0.28)";
                    if (mouseX >= 0 && mouseY >= 0) {
                        const dx = (cellX + 40) - mouseX;
                        const dy = textY - mouseY;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist < 150) {
                            const intensity = (150 - dist) / 150;
                            textStyle = `rgba(129, 140, 248, ${0.28 + intensity * 0.52})`;
                        }
                    }
                    ctx.fillStyle = textStyle;
                    ctx.font = "8px 'Fira Code', monospace";
                    const simulatedLat = (-12.046 + (y / h) * 0.04).toFixed(4);
                    const simulatedLon = (-77.035 + (x / w) * 0.04).toFixed(4);
                    ctx.fillText(`GPS [${simulatedLat}, ${simulatedLon}]`, textX, textY);
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
    if (placeholder) {
        placeholder.textContent = "";
        placeholder.classList.remove("error-active");
    }
    
    const glowWrap = document.getElementById("lote-glow-wrap");
    if (glowWrap) {
        glowWrap.classList.remove("glitch-active");
    }
    
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
        const debugCheckbox = document.getElementById("debug-mode-checkbox");
        const isDebugActive = debugCheckbox && debugCheckbox.checked;
        if (!isDebugActive || errorOccurred) {
            isRandomizing = false;
            if (diceBtn) diceBtn.disabled = false;
        }
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
            const placeholder = document.getElementById("lote-preview-placeholder");
            if (placeholder) {
                placeholder.textContent = "No encontrado";
                placeholder.classList.add("error-active");
            }
            const glowWrap = document.getElementById("lote-glow-wrap");
            if (glowWrap) {
                glowWrap.classList.add("glitch-active");
            }
            document.getElementById("pres-id").textContent = "-";
            document.getElementById("pres-ciudad").textContent = "-";
            document.getElementById("pres-area").textContent = "-";
            document.getElementById("pres-peri").textContent = "-";
            document.getElementById("pres-coords").textContent = "-";
            document.getElementById("pres-time").textContent = "-";
        } else if (realData) {
            actualizarLotePresentador(realData);
        }
        const debugCheckbox = document.getElementById("debug-mode-checkbox");
        const isDebugActive = debugCheckbox && debugCheckbox.checked;
        if (!isDebugActive || errorOccurred) {
            isRandomizing = false;
        }
    });
    
    setTimeout(async () => {
        while (!fetchResolved) {
            await new Promise(r => setTimeout(r, 40));
        }
        stopScanner();
    }, 700);
}

function actualizarLotePresentador(data) {
    const debugCheckbox = document.getElementById("debug-mode-checkbox");
    const isDebugActive = debugCheckbox && debugCheckbox.checked;
    
    if (isDebugActive) {
        ejecutarSimulacionPasoAPaso(data);
    } else {
        actualizarLotePresentadorNormal(data);
    }
}

function actualizarLotePresentadorNormal(data) {
    const placeholder = document.getElementById("lote-preview-placeholder");
    if (placeholder) {
        placeholder.classList.remove("error-active");
    }
    const glowWrap = document.getElementById("lote-glow-wrap");
    if (glowWrap) {
        glowWrap.classList.remove("glitch-active");
    }

    document.getElementById("pres-id").textContent = data.id_lote;
    document.getElementById("pres-ciudad").textContent = data.ciudad || "Sector Sintético";
    document.getElementById("pres-area").textContent = data.area_grafica ? Number(data.area_grafica).toFixed(2) + " m²" : "N/D";
    document.getElementById("pres-peri").textContent = data.peri_grafico ? Number(data.peri_grafico).toFixed(2) + " m" : "N/D";
    document.getElementById("pres-coords").textContent = data.center ? `${Number(data.center.lat).toFixed(5)}, ${Number(data.center.lon).toFixed(5)}` : "N/D";
    
    // Simulación de computación viva en el índice R-Tree de la base de datos
    const originalTime = data.execution_time_ms ? Number(data.execution_time_ms) : 0.120;
    const simulatedTime = (originalTime + (Math.random() * 0.04 - 0.02)).toFixed(3);
    const timeEl = document.getElementById("pres-time");
    if (timeEl) {
        timeEl.textContent = `${simulatedTime} ms`;
        timeEl.style.transition = "none";
        timeEl.style.color = "#818cf8"; // Resaltar azul AutoCAD al calcular
        setTimeout(() => {
            timeEl.style.transition = "color 0.8s ease";
            timeEl.style.color = ""; // Restaurar color inicial
        }, 120);
    }
    
    // Actualizar metadata dinámica en el árbol traversal del R-Tree
    const n0Meta = document.getElementById("n0-meta");
    const n1Meta = document.getElementById("n1-meta");
    const n2Meta = document.getElementById("n2-meta");
    
    if (n0Meta) n0Meta.textContent = data.ciudad ? data.ciudad.split("(")[0].trim() : "Puno";
    if (n1Meta) {
        // Estimar un tamaño de BBox simulado basado en el área del predio
        const side = Math.sqrt(data.area_grafica || 200) * 3.5;
        n1Meta.textContent = `bbox ${side.toFixed(0)}x${side.toFixed(0)}m`;
    }
    if (n2Meta) n2Meta.textContent = `id ${data.id_lote.substring(10)}`;

    // Reiniciar clases de animación
    const elements = {
        n0: document.getElementById("r-tree-n0"),
        c0: document.getElementById("r-tree-c0"),
        n1: document.getElementById("r-tree-n1"),
        c1: document.getElementById("r-tree-c1"),
        n2: document.getElementById("r-tree-n2")
    };
    
    Object.values(elements).forEach(el => {
        if (el) el.className = el.className.split(" ")[0]; // Mantener sólo clase base (traversal-node/traversal-connector)
    });

    // Secuencia de animación de traza en niveles del R-Tree
    setTimeout(() => { if (elements.n0) elements.n0.classList.add("active-n0"); }, 50);
    setTimeout(() => { if (elements.c0) elements.c0.classList.add("active-c0"); }, 180);
    setTimeout(() => { if (elements.n1) elements.n1.classList.add("active-n1"); }, 300);
    setTimeout(() => { if (elements.c1) elements.c1.classList.add("active-c1"); }, 420);
    setTimeout(() => { if (elements.n2) elements.n2.classList.add("active-n2"); }, 550);
    
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
        // Reiniciar animación del trazado vectorial SVG
        polygon.classList.remove("draw-animated");
        void polygon.offsetWidth; // Forzar reflow para reiniciar animación
        polygon.classList.add("draw-animated");
    }
    
    // Activar destello perimetral en el envoltorio del lote
    const glowWrap = document.getElementById("lote-glow-wrap");
    if (glowWrap) {
        glowWrap.classList.remove("glow-active");
        void glowWrap.offsetWidth; // Forzar reflow
        glowWrap.classList.add("glow-active");
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

    // Configurar efecto 3D Tilt tipo carta coleccionable sobre la mini-carta del lote únicamente
    const glowWrap = document.getElementById("lote-glow-wrap");
    const svg = document.getElementById("lote-svg");
    
    if (glowWrap) {
        glowWrap.addEventListener("mousemove", (e) => {
            const rect = glowWrap.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            const rotateX = ((centerY - y) / centerY) * 15; // Inclinación pronunciada de 15 grados al ser más compacto
            const rotateY = ((x - centerX) / centerX) * 15;
            
            glowWrap.style.transition = "transform 0.08s ease-out, box-shadow 0.15s ease-out, border-color 0.15s ease-out";
            glowWrap.style.transform = `perspective(600px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg)`;
            glowWrap.style.boxShadow = `${-rotateY * 2}px ${rotateX * 2}px 30px rgba(129, 140, 248, 0.14), 0 12px 35px rgba(0, 0, 0, 0.7)`;
            glowWrap.style.borderColor = "rgba(129, 140, 248, 0.45)";
        });
        
        glowWrap.addEventListener("mouseleave", () => {
            glowWrap.style.transition = "transform 0.4s cubic-bezier(0.25, 1, 0.5, 1), box-shadow 0.4s ease, border-color 0.4s ease";
            glowWrap.style.transform = "perspective(600px) rotateX(0deg) rotateY(0deg)";
            glowWrap.style.boxShadow = "";
            glowWrap.style.borderColor = "";
        });
    }

    if (svg) {
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

    // Toggle R-Tree Traversal Trace
    const btnToggleRTree = document.getElementById("btn-toggle-r-tree");
    const rTreeWidget = document.querySelector(".r-tree-traversal-widget");
    
    if (btnToggleRTree && rTreeWidget) {
        btnToggleRTree.addEventListener("click", () => {
            const isExpanded = rTreeWidget.classList.toggle("expanded");
            btnToggleRTree.textContent = isExpanded 
                ? "> ocultar_traza_r_tree" 
                : "> mostrar_traza_r_tree";
        });
    }

    // Manejo de Pestañas del Dashboard
    const tabButtons = document.querySelectorAll(".dashboard-tabs .tab-btn");
    const tabPanes = document.querySelectorAll(".dashboard-tabs-container .tab-pane");
    
    tabButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            tabButtons.forEach(b => b.classList.remove("active"));
            tabPanes.forEach(p => p.classList.remove("active"));
            
            btn.classList.add("active");
            const targetId = btn.getAttribute("data-tab");
            const targetPane = document.getElementById(targetId);
            if (targetPane) {
                targetPane.classList.add("active");
            }
        });
    });

    // Función de contador progresivo (Odometer Effect)
    function animarContador(elemento, valorFinal, duracion = 1400) {
        if (!elemento) return;
        let inicio = 0;
        const pasos = 60; // 60 ticks
        const pasoVal = valorFinal / pasos;
        const intervalo = duracion / pasos;
        
        const timer = setInterval(() => {
            inicio += pasoVal;
            if (inicio >= valorFinal) {
                inicio = valorFinal;
                clearInterval(timer);
            }
            elemento.textContent = Math.floor(inicio).toLocaleString("es-PE");
        }, intervalo);
    }

    try {
        const response = await fetch("/api/status");
        if (!response.ok) throw new Error("Error de comunicación");
        
        const data = await response.json();

        if (dbCountEl && data.total_records) {
            const rawCount = Number(data.total_records.replace(/[^0-9]/g, ''));
            const finalVal = isNaN(rawCount) ? 0 : rawCount;
            
            // Usar IntersectionObserver para disparar la animación solo al ser visible en pantalla
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        animarContador(dbCountEl, finalVal);
                        observer.unobserve(dbCountEl); // Ejecutar una sola vez
                    }
                });
            }, { threshold: 0.15 });
            
            observer.observe(dbCountEl);
        }

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
        if (dbCountEl) dbCountEl.textContent = "No disponible";
    }
});

// — GLOBAL DRAWER WIKI CONTROL —
function toggleWikiDrawer(show) {
    const drawer = document.getElementById("wiki-drawer");
    const overlay = document.getElementById("drawer-overlay");
    if (drawer && overlay) {
        if (show) {
            overlay.style.display = "block";
            setTimeout(() => {
                drawer.classList.add("active");
                overlay.classList.add("active");
            }, 10);
        } else {
            drawer.classList.remove("active");
            overlay.classList.remove("active");
            setTimeout(() => {
                overlay.style.display = "none";
            }, 300);
        }
    }
}
window.toggleWikiDrawer = toggleWikiDrawer;

function switchDrawerTab(tabId) {
    const tabs = document.querySelectorAll(".drawer-tab-btn");
    const panes = document.querySelectorAll(".drawer-pane");
    
    tabs.forEach(btn => {
        const onclickAttr = btn.getAttribute("onclick");
        if (onclickAttr && onclickAttr.includes(tabId)) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });
    
    panes.forEach(pane => {
        if (pane.id === tabId) {
            pane.classList.add("active");
        } else {
            pane.classList.remove("active");
        }
    });
}
window.switchDrawerTab = switchDrawerTab;

// — SIMULADOR EN VIVO PASO A PASO (DEBUG MODE) —

function limpiarOverlaysSVG() {
    const svg = document.getElementById("lote-svg");
    if (!svg) return;
    const overlays = svg.querySelectorAll(".debug-overlay");
    overlays.forEach(el => el.remove());
}

function agregarRectanguloSVG(x, y, w, h, stroke, fill, dash, label) {
    const svg = document.getElementById("lote-svg");
    if (!svg) return;
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", x);
    rect.setAttribute("y", y);
    rect.setAttribute("width", w);
    rect.setAttribute("height", h);
    rect.setAttribute("stroke", stroke);
    rect.setAttribute("stroke-width", "1.5");
    rect.setAttribute("fill", fill);
    if (dash) rect.setAttribute("stroke-dasharray", dash);
    rect.setAttribute("class", "debug-overlay");
    svg.appendChild(rect);
    
    if (label) {
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", x + 5);
        text.setAttribute("y", y + 13);
        text.setAttribute("fill", stroke);
        text.setAttribute("font-size", "7.5px");
        text.setAttribute("font-family", "monospace");
        text.setAttribute("font-weight", "600");
        text.setAttribute("class", "debug-overlay");
        text.textContent = label;
        svg.appendChild(text);
    }
}

function agregarLineaSVG(x1, y1, x2, y2, stroke, dash) {
    const svg = document.getElementById("lote-svg");
    if (!svg) return;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", x1);
    line.setAttribute("y1", y1);
    line.setAttribute("x2", x2);
    line.setAttribute("y2", y2);
    line.setAttribute("stroke", stroke);
    line.setAttribute("stroke-width", "1.5");
    if (dash) line.setAttribute("stroke-dasharray", dash);
    line.setAttribute("class", "debug-overlay");
    svg.appendChild(line);
}

function agregarTextoHUD(textoLine1, textoLine2, color = "#fff") {
    const svg = document.getElementById("lote-svg");
    if (!svg) return;
    
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", "5");
    rect.setAttribute("y", "175");
    rect.setAttribute("width", "230");
    rect.setAttribute("height", "55");
    rect.setAttribute("fill", "rgba(5, 7, 12, 0.95)");
    rect.setAttribute("stroke", "rgba(129, 140, 248, 0.25)");
    rect.setAttribute("class", "debug-overlay");
    svg.appendChild(rect);
    
    if (textoLine1) {
        const t1 = document.createElementNS("http://www.w3.org/2000/svg", "text");
        t1.setAttribute("x", "15");
        t1.setAttribute("y", "195");
        t1.setAttribute("fill", color);
        t1.setAttribute("font-size", "9px");
        t1.setAttribute("font-family", "monospace");
        t1.setAttribute("font-weight", "700");
        t1.setAttribute("class", "debug-overlay");
        t1.textContent = textoLine1;
        svg.appendChild(t1);
    }
    if (textoLine2) {
        const t2 = document.createElementNS("http://www.w3.org/2000/svg", "text");
        t2.setAttribute("x", "15");
        t2.setAttribute("y", "215");
        t2.setAttribute("fill", "#a5b4fc");
        t2.setAttribute("font-size", "8px");
        t2.setAttribute("font-family", "monospace");
        t2.setAttribute("class", "debug-overlay");
        t2.textContent = textoLine2;
        svg.appendChild(t2);
    }
}

function ejecutarSimulacionPasoAPaso(data) {
    const diceBtn = document.querySelector(".btn-dice");
    if (diceBtn) diceBtn.disabled = true;
    
    document.getElementById("pres-id").textContent = "...";
    document.getElementById("pres-ciudad").textContent = "...";
    document.getElementById("pres-area").textContent = "...";
    document.getElementById("pres-peri").textContent = "...";
    document.getElementById("pres-coords").textContent = "...";
    document.getElementById("pres-time").textContent = "...";
    
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

    limpiarOverlaysSVG();
    agregarRectanguloSVG(15, 15, 210, 155, "#a855f7", "rgba(168, 85, 247, 0.04)", "6, 6", "MBR N0 (Raíz - Puno)");
    if (elements.n0) elements.n0.classList.add("active-n0");
    const n0Meta = document.getElementById("n0-meta");
    if (n0Meta) n0Meta.textContent = "evaluando...";
    agregarTextoHUD("> GiST: Escaneo N0 (Raíz)", "Consistent() en BBox global. O(log N)", "#a855f7");
    
    setTimeout(() => {
        limpiarOverlaysSVG();
        agregarRectanguloSVG(15, 15, 210, 155, "rgba(255, 255, 255, 0.12)", "none", "6, 6", "N0 (Descartado)");
        agregarRectanguloSVG(60, 50, 130, 110, "#06b6d4", "rgba(6, 182, 212, 0.05)", "4, 4", "MBR N1 (Manzana / Clúster)");
        if (elements.c0) elements.c0.classList.add("active-c0");
        if (elements.n1) elements.n1.classList.add("active-n1");
        if (n0Meta) n0Meta.textContent = data.ciudad ? data.ciudad.split("(")[0].trim() : "Puno";
        const n1Meta = document.getElementById("n1-meta");
        if (n1Meta) n1Meta.textContent = "evaluando...";
        agregarTextoHUD("> GiST: Poda de Ramas N1", "MBR intersecta. Se descartan ramas ajenas.", "#06b6d4");
    }, 900);
    
    setTimeout(() => {
        limpiarOverlaysSVG();
        agregarRectanguloSVG(60, 50, 130, 110, "rgba(255, 255, 255, 0.12)", "none", "4, 4", "N1 (Descartado)");
        agregarRectanguloSVG(95, 85, 50, 45, "#ef4444", "rgba(239, 68, 68, 0.08)", "2, 2", "MBR N2 (Lote)");
        if (elements.c1) elements.c1.classList.add("active-c1");
        if (elements.n2) elements.n2.classList.add("active-n2");
        const n1Meta = document.getElementById("n1-meta");
        if (n1Meta) {
            const side = Math.sqrt(data.area_grafica || 200) * 3.5;
            n1Meta.textContent = `bbox ${side.toFixed(0)}x${side.toFixed(0)}m`;
        }
        const n2Meta = document.getElementById("n2-meta");
        if (n2Meta) n2Meta.textContent = "accediendo...";
        agregarTextoHUD("> GiST: Registro N2 Encontrado", "Acceso físico finalizado. Eval: 14 nodos.", "#ef4444");
    }, 1800);
    
    setTimeout(() => {
        limpiarOverlaysSVG();
        const points = [
            [25, 175], [25, 125], [75, 125], [75, 175],
            [125, 175], [125, 125], [175, 125], [175, 175],
            [225, 175], [225, 75], [175, 75], [175, 25],
            [125, 25], [125, 75], [75, 75], [75, 25]
        ];
        for (let i = 0; i < points.length - 1; i++) {
            agregarLineaSVG(points[i][0], points[i][1], points[i+1][0], points[i+1][1], "#6366f1");
        }
        agregarTextoHUD("> Hilbert: Mapeo Dimensional 2D ➔ 1D", "Clave H: 983274981729 | Localidad OK", "#6366f1");
    }, 2800);
    
    setTimeout(() => {
        limpiarOverlaysSVG();
        agregarLineaSVG(30, 160, 210, 160, "rgba(255,255,255,0.2)"); 
        agregarLineaSVG(30, 20, 30, 160, "rgba(255,255,255,0.2)");  
        agregarLineaSVG(30, 140, 100, 120, "#818cf8"); 
        agregarLineaSVG(100, 120, 160, 60, "#a855f7"); 
        agregarLineaSVG(160, 60, 210, 40, "#06b6d4");  
        agregarLineaSVG(130, 165, 130, 95, "#06b6d4"); 
        agregarLineaSVG(125, 102, 130, 95, "#06b6d4"); 
        agregarLineaSVG(135, 102, 130, 95, "#06b6d4"); 
        agregarTextoHUD("> PGM: Salto de Memoria Predicho", "Regresión PLR tramo 2 predice dirección física", "#06b6d4");
    }, 3800);
    
    setTimeout(() => {
        limpiarOverlaysSVG();
        agregarLineaSVG(30, 160, 210, 160, "rgba(255,255,255,0.15)");
        agregarLineaSVG(30, 20, 30, 160, "rgba(255,255,255,0.15)");
        agregarLineaSVG(100, 120, 160, 60, "rgba(168, 85, 247, 0.3)");
        agregarRectanguloSVG(115, 75, 30, 30, "#10b981", "rgba(16, 185, 129, 0.12)", "2, 2", "Rango [±ε]");
        agregarLineaSVG(120, 75, 120, 105, "rgba(255, 255, 255, 0.7)");
        setTimeout(() => {
            agregarLineaSVG(135, 75, 135, 105, "rgba(255, 255, 255, 0.7)");
        }, 150);
        setTimeout(() => {
            agregarLineaSVG(128, 75, 128, 105, "rgba(16, 185, 129, 0.9)");
        }, 300);
        agregarTextoHUD("> Learned: Búsqueda Local en Cota ε", "Cota de Error ε = 4. Binaria final en [±4]", "#10b981");
    }, 4800);
    
    setTimeout(() => {
        limpiarOverlaysSVG();
        actualizarLotePresentadorNormal(data);
        const timeEl = document.getElementById("pres-time");
        if (timeEl) {
            timeEl.textContent = `PGM: 0.015ms | R-Tree: ${timeEl.textContent}`;
        }
        agregarTextoHUD("> ¡Búsqueda Finalizada con Éxito!", "Error ε: 4 registros. Acceso O(1) PGM.", "#10b981");
        
        isRandomizing = false;
        if (diceBtn) diceBtn.disabled = false;
        
        setTimeout(() => {
            limpiarOverlaysSVG();
        }, 2200);
    }, 5800);
}