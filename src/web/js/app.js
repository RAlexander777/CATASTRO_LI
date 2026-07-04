const PRESETS = {
    puno_urbano: { min_lat: -15.850, min_lon: -70.040, max_lat: -15.820, max_lon: -69.995 },
    arequipa: { min_lat: -16.408, min_lon: -71.545, max_lat: -16.392, max_lon: -71.530 },
    cusco: { min_lat: -13.525, min_lon: -71.988, max_lat: -13.513, max_lon: -71.970 },
    lima: { min_lat: -12.055, min_lon: -77.045, max_lat: -12.038, max_lon: -77.020 },
    la_paz: { min_lat: -16.508, min_lon: -68.140, max_lat: -16.495, max_lon: -68.125 }
};

let currentLoteData = null;

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
        mockCoords.push(mockCoords[0]);
        
        const mockGeom = {
            type: "Polygon",
            coordinates: [mockCoords]
        };
        renderizarLoteSVG(mockGeom);
        
        const cities = ["Lima", "Arequipa", "Cusco", "Puno", "Juliaca", "Trujillo", "Chiclayo", "Piura", "Huancayo", "Iquitos"];
        if (elements.id) elements.id.textContent = `21010101${Math.floor(Math.random() * 900000) + 100000}`;
        if (elements.ciudad) elements.ciudad.textContent = cities[Math.floor(Math.random() * cities.length)];
        if (elements.area) elements.area.textContent = `${(Math.random() * 150 + 50).toFixed(2)} m²`;
        if (elements.peri) elements.peri.textContent = `${(Math.random() * 60 + 20).toFixed(2)} m`;
        if (elements.coords) elements.coords.textContent = `${(-15 - Math.random() * 2).toFixed(4)}, ${(-70 - Math.random() * 2).toFixed(4)}`;
        if (elements.time) elements.time.textContent = `${(Math.random() * 10 + 20).toFixed(3)} ms`;
        
    }, 50);
    
    return () => {
        clearInterval(interval);
        realDataCallback();
    };
}

async function coldCacheFlush() {
    const cb = document.getElementById("cold-cache-checkbox");
    if (!cb || !cb.checked) return;
    try {
        await fetch("/api/cache/flush", { method: "POST" });
    } catch (e) {
        console.warn("Error al limpiar caché:", e);
    }
}

async function cargarLoteAleatorio() {
    if (isRandomizing) return;
    await coldCacheFlush();
    isRandomizing = true;
    
    const debugCheckbox = document.getElementById("debug-mode-checkbox");
    const isDebugActive = debugCheckbox && debugCheckbox.checked;
    if (!isDebugActive) {
        const metadataPanel = document.getElementById("metadata-details-panel");
        if (metadataPanel) {
            metadataPanel.classList.add("collapsed");
        }
    }
    
    const diceBtn = document.querySelector(".btn-dice");
    if (diceBtn) {
        diceBtn.disabled = true;
        diceBtn.classList.add("spinning");
        setTimeout(() => diceBtn.classList.remove("spinning"), 500);
    }
    
    let fetchResolved = false;
    let realData = null;
    let learnedStats = null;
    let errorOccurred = null;
    
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
        
    const stopScanner = animarScanner(async () => {
        if (errorOccurred) {
            console.error("Error al cargar lote aleatorio:", errorOccurred);
            const placeholder = document.getElementById("lote-preview-placeholder");
            if (placeholder) placeholder.textContent = "Error al cargar";
        } else if (realData) {
            let realRtreeTime = null;
            if (realData.center) {
                try {
                    const [rtreeRes, learnedRes] = await Promise.allSettled([
                        fetch(`/api/search/rtree?lat=${realData.center.lat}&lon=${realData.center.lon}`),
                        fetch(`/api/search/learned?lat=${realData.center.lat}&lon=${realData.center.lon}`)
                    ]);
                    if (rtreeRes.status === 'fulfilled' && rtreeRes.value.ok) {
                        const result = await rtreeRes.value.json();
                        realRtreeTime = result.stats.rtree_search_time_ms;
                    }
                    if (learnedRes.status === 'fulfilled' && learnedRes.value.ok) {
                        const result = await learnedRes.value.json();
                        learnedStats = result.stats;
                    }
                } catch (e) {}
            }
            actualizarLotePresentador(realData, learnedStats, realRtreeTime);
        }
        const debugCheckbox = document.getElementById("debug-mode-checkbox");
        const isDbg = debugCheckbox && debugCheckbox.checked;
        if (!isDbg || errorOccurred) {
            isRandomizing = false;
            if (diceBtn) diceBtn.disabled = false;
        }
    });
    
    setTimeout(async () => {
        while (!fetchResolved) {
            await new Promise(r => setTimeout(r, 40));
        }
        stopScanner();
    }, 700);
}

async function buscarLotePorId() {
    if (isRandomizing) return;
    await coldCacheFlush();
    
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
    
    const debugCheckbox = document.getElementById("debug-mode-checkbox");
    const isDebugActive = debugCheckbox && debugCheckbox.checked;
    if (!isDebugActive) {
        const metadataPanel = document.getElementById("metadata-details-panel");
        if (metadataPanel) {
            metadataPanel.classList.add("collapsed");
        }
    }
    
    let fetchResolved = false;
    let realData = null;
    let learnedStats = null;
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
        
    const stopScanner = animarScanner(async () => {
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
            let realRtreeTime = null;
            if (realData.center) {
                try {
                    const [rtreeRes, learnedRes] = await Promise.allSettled([
                        fetch(`/api/search/rtree?lat=${realData.center.lat}&lon=${realData.center.lon}`),
                        fetch(`/api/search/learned?lat=${realData.center.lat}&lon=${realData.center.lon}`)
                    ]);
                    if (rtreeRes.status === 'fulfilled' && rtreeRes.value.ok) {
                        const result = await rtreeRes.value.json();
                        realRtreeTime = result.stats.rtree_search_time_ms;
                    }
                    if (learnedRes.status === 'fulfilled' && learnedRes.value.ok) {
                        const result = await learnedRes.value.json();
                        learnedStats = result.stats;
                    }
                } catch (e) {}
            }
            actualizarLotePresentador(realData, learnedStats, realRtreeTime);
        }
        const debugCheckbox = document.getElementById("debug-mode-checkbox");
        const isDbg = debugCheckbox && debugCheckbox.checked;
        if (!isDbg || errorOccurred) {
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

function actualizarLotePresentador(data, learnedStats, rtreeSearchTimeMs) {
    if (!data) return;
    currentLoteData = data;
    
    const debugCheckbox = document.getElementById("debug-mode-checkbox");
    const isDebugActive = debugCheckbox && debugCheckbox.checked;
    
    const previewContainer = document.querySelector(".preview-container");
    const debugContainer = document.getElementById("debug-steps-container");
    const metadataPanel = document.getElementById("metadata-details-panel");

    if (isDebugActive) {
        if (metadataPanel) {
            metadataPanel.classList.remove("collapsed");
        }
        
        if (previewContainer) previewContainer.style.display = "none";
        if (debugContainer) {
            debugContainer.classList.add("active");
        }
        ejecutarSimulacionPasoAPaso(data, rtreeSearchTimeMs);
    } else {
        if (metadataPanel) {
            metadataPanel.classList.remove("collapsed");
        }
        
        if (debugContainer) {
            debugContainer.classList.remove("active");
            debugContainer.innerHTML = "";
        }
        if (previewContainer) previewContainer.style.display = "flex";
        actualizarLotePresentadorNormal(data, learnedStats, rtreeSearchTimeMs);
    }
}

function actualizarLotePresentadorNormal(data, learnedStats, rtreeSearchTimeMs) {
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
    
    const timeEl = document.getElementById("pres-time");
    const rtreeTimeTag = document.querySelector(".minimal-time-tag");
    
    if (learnedStats && learnedStats.learned_search_time_ms) {
        const learnedMs = Number(learnedStats.learned_search_time_ms);
        const rtreeMs = rtreeSearchTimeMs || (learnedStats.rtree_search_time_ms ? Number(learnedStats.rtree_search_time_ms) : null);
        if (timeEl) {
            timeEl.innerHTML = `<span style="color: #10b981;">${learnedMs.toFixed(3)} ms</span>`;
            timeEl.style.color = "#10b981";
        }
        if (rtreeTimeTag) {
            if (rtreeMs !== null) {
                rtreeTimeTag.innerHTML = `[pgm_li: <span style="color: #10b981; font-weight:bold;">${learnedMs.toFixed(3)} ms</span> | R-TREE ACC: <span style="color: #a855f7;">${rtreeMs.toFixed(3)} ms</span>]`;
            } else {
                rtreeTimeTag.innerHTML = `[pgm_li: <span style="color: #10b981; font-weight:bold;">${learnedMs.toFixed(3)} ms</span>]`;
            }
        }
    } else {
        // Usar la métrica real del endpoint /api/search/rtree si está disponible (valor exacto, sin jitter)
        const realTime = rtreeSearchTimeMs ? Number(rtreeSearchTimeMs) : (data.execution_time_ms ? Number(data.execution_time_ms) : 0.120);
        if (timeEl) {
            timeEl.textContent = `${realTime.toFixed(3)} ms`;
            timeEl.style.transition = "none";
            timeEl.style.color = "#818cf8";
            setTimeout(() => {
                timeEl.style.transition = "color 0.8s ease";
                timeEl.style.color = "";
            }, 120);
        }
        if (rtreeTimeTag) {
            if (rtreeSearchTimeMs) {
                rtreeTimeTag.innerHTML = `[R-TREE ACC: <span style="color: #a855f7; font-weight: bold;">${realTime.toFixed(3)} ms</span>]`;
            } else {
                rtreeTimeTag.innerHTML = `[r_tree: <span style="color: #818cf8; font-weight: bold;">${realTime.toFixed(3)} ms</span>]`;
            }
        }
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

    // Reiniciar clases de animación (R-Tree widget)
    const rTreeElements = {
        n0: document.getElementById("r-tree-n0"),
        c0: document.getElementById("r-tree-c0"),
        n1: document.getElementById("r-tree-n1"),
        c1: document.getElementById("r-tree-c1"),
        n2: document.getElementById("r-tree-n2")
    };
    
    Object.values(rTreeElements).forEach(el => {
        if (el) el.className = el.className.split(" ")[0];
    });

    // Secuencia de animación de traza en niveles del R-Tree
    setTimeout(() => { if (rTreeElements.n0) rTreeElements.n0.classList.add("active-n0"); }, 50);
    setTimeout(() => { if (rTreeElements.c0) rTreeElements.c0.classList.add("active-c0"); }, 180);
    setTimeout(() => { if (rTreeElements.n1) rTreeElements.n1.classList.add("active-n1"); }, 300);
    setTimeout(() => { if (rTreeElements.c1) rTreeElements.c1.classList.add("active-c1"); }, 420);
    setTimeout(() => { if (rTreeElements.n2) rTreeElements.n2.classList.add("active-n2"); }, 550);

    // Reiniciar clases de animación (PGM widget)
    const pgmElements = {
        n0: document.getElementById("pgm-n0"),
        c0: document.getElementById("pgm-c0"),
        n1: document.getElementById("pgm-n1"),
        c1: document.getElementById("pgm-c1"),
        n2: document.getElementById("pgm-n2")
    };

    Object.values(pgmElements).forEach(el => {
        if (el) el.className = el.className.split(" ")[0];
    });

    const pgmMetas = {
        n0: document.getElementById("pgm-n0-meta"),
        n1: document.getElementById("pgm-n1-meta"),
        n2: document.getElementById("pgm-n2-meta")
    };

    if (pgmMetas.n0) pgmMetas.n0.textContent = "hilbert_val";
    if (pgmMetas.n1) pgmMetas.n1.textContent = "modelo_lineal";
    if (pgmMetas.n2) pgmMetas.n2.textContent = "rango_ε";

    // Secuencia de animación PGM en paralelo
    setTimeout(() => { if (pgmElements.n0) pgmElements.n0.classList.add("active-pgm-n0"); }, 50);
    setTimeout(() => { if (pgmElements.c0) pgmElements.c0.classList.add("active-pgm-c0"); }, 180);
    setTimeout(() => { if (pgmElements.n1) pgmElements.n1.classList.add("active-pgm-n1"); }, 300);
    setTimeout(() => { if (pgmElements.c1) pgmElements.c1.classList.add("active-pgm-c1"); }, 420);
    setTimeout(() => { if (pgmElements.n2) pgmElements.n2.classList.add("active-pgm-n2"); }, 550);
    
    const mapBtn = document.getElementById("btn-ver-mapa");
    if (mapBtn && data.center) {
        mapBtn.href = `/visor?lat=${data.center.lat}&lon=${data.center.lon}&zoom=18&id=${data.id_lote}&ciudad=${encodeURIComponent(data.ciudad || '')}`;
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
    
    // Botón para copiar ID Catastral al portapapeles
    const btnCopy = document.getElementById("btn-copy-id");
    if (btnCopy) {
        btnCopy.addEventListener("click", () => {
            const presId = document.getElementById("pres-id").textContent;
            if (presId && presId !== "—" && presId !== "...") {
                navigator.clipboard.writeText(presId).then(() => {
                    const originalColor = btnCopy.style.color;
                    btnCopy.style.color = "#10b981"; // Verde neón temporal
                    setTimeout(() => btnCopy.style.color = originalColor, 1000);
                }).catch(err => console.error("Fallo al copiar:", err));
            }
        });
    }
    
    // Toggle manual de metadatos (Plegar / Desplegar)
    const btnToggleMetadata = document.getElementById("btn-toggle-metadata");
    const metadataPanel = document.getElementById("metadata-details-panel");
    if (btnToggleMetadata && metadataPanel) {
        btnToggleMetadata.addEventListener("click", () => {
            const isCollapsed = metadataPanel.classList.toggle("collapsed");
            const polyline = document.getElementById("toggle-polyline");
            if (polyline) {
                polyline.setAttribute("points", isCollapsed ? "9 18 15 12 9 6" : "15 18 9 12 15 6");
            }
            btnToggleMetadata.title = isCollapsed ? "Desplegar Metadatos" : "Plegar Metadatos";
        });
    }

    // Botones para copiar comandos del Wiki Drawer
    document.querySelectorAll(".btn-copy-command").forEach(btn => {
        btn.addEventListener("click", () => {
            const cmd = btn.dataset.cmd;
            if (cmd) {
                navigator.clipboard.writeText(cmd).then(() => {
                    const originalColor = btn.style.color;
                    btn.style.color = "#10b981"; // Verde neón temporal
                    setTimeout(() => btn.style.color = originalColor, 1000);
                }).catch(err => console.error("Fallo al copiar comando:", err));
            }
        });
    });
    
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
        // Al hacer clic en el lote protagonista, plegar/desplegar metadatos
        svg.addEventListener("click", () => {
            const debugCheckbox = document.getElementById("debug-mode-checkbox");
            const isDebugActive = debugCheckbox && debugCheckbox.checked;
            if (isDebugActive) return;
            
            const metadataPanel = document.getElementById("metadata-details-panel");
            if (metadataPanel) {
                metadataPanel.classList.toggle("collapsed");
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
                const debugCheckbox = document.getElementById("debug-mode-checkbox");
                const isDebugActive = debugCheckbox && debugCheckbox.checked;
                if (isDebugActive) {
                    const val = searchInput.value.trim();
                    if (val.length === 14) {
                        fetch(`/api/lotes/${val}`)
                            .then(r => r.ok ? r.json() : null)
                            .then(data => {
                                if (data && data.center) {
                                    buscarLoteUnificado(data.center.lat, data.center.lon);
                                }
                            });
                    }
                } else {
                    buscarLotePorId();
                }
            }
        });
        
        document.addEventListener("click", (e) => {
            if (!searchContainer.contains(e.target) && searchContainer.classList.contains("expanded") && searchInput.value === "") {
                searchContainer.classList.remove("expanded");
            }
        });
    }

    // Toggle unificado de trazas (R-Tree + PGM)
    const btnToggleTraces = document.getElementById("btn-toggle-traces");
    const traceWidgets = document.querySelectorAll(".r-tree-traversal-widget, .pgm-traversal-widget");
    
    if (btnToggleTraces && traceWidgets.length) {
        btnToggleTraces.addEventListener("click", () => {
            let anyExpanded = false;
            traceWidgets.forEach(w => {
                const was = w.classList.toggle("expanded");
                if (was) anyExpanded = true;
            });
            btnToggleTraces.textContent = anyExpanded
                ? "> ocultar_trazas_busqueda"
                : "> mostrar_trazas_busqueda";
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

        // Actualizar widgets de memoria y rendimiento reales de forma dinámica
        if (document.getElementById("stat-postgis-ram")) {
            document.getElementById("stat-postgis-ram").textContent = data.postgis_ram || "—";
        }
        if (document.getElementById("stat-pgm-ram")) {
            document.getElementById("stat-pgm-ram").textContent = data.pgm_ram || "—";
        }
        if (document.getElementById("stat-db-disk")) {
            document.getElementById("stat-db-disk").textContent = data.db_disk || "—";
        }
        if (document.getElementById("stat-pgm-training")) {
            document.getElementById("stat-pgm-training").textContent = data.training_time || "—";
        }

        // Actualizar gráficos comparativos reales de eficiencia en RAM
        if (document.getElementById("val-postgres-ram") && data.postgis_ram) {
            document.getElementById("val-postgres-ram").textContent = `Consumo: ${data.postgis_ram}`;
        }
        if (document.getElementById("val-learned-ram") && data.pgm_ram) {
            const postgresBytes = parseFloat(data.postgis_ram.replace(/[^0-9.]/g, '')) || 1.0;
            const learnedBytes = parseFloat(data.pgm_ram.replace(/[^0-9.]/g, '')) || 0.1;
            const savings = Math.max(0, Math.round((1 - (learnedBytes / postgresBytes)) * 100));
            document.getElementById("val-learned-ram").textContent = `Consumo: ${data.pgm_ram} (↓ ${savings}%)`;
            
            const barLearned = document.getElementById("bar-learned-fill");
            if (barLearned) {
                const ratio = Math.max(2, Math.min(100, Math.round((learnedBytes / postgresBytes) * 100)));
                barLearned.style.width = `${ratio}%`;
            }
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

function crearMiniCardSVG(pasoIndex, data, rtreeSearchTimeMs) {
    let svgContent = "";
    let title = "";
    let titleColor = "";
    let desc = "";
    let metricsHtml = "";

    const ciudad = data.ciudad ? data.ciudad.split("(")[0].trim() : "Puno";
    const rawTotal = document.getElementById("db-count") ? document.getElementById("db-count").textContent : "24,580";
    const dbTotal = rawTotal === "Calculando..." ? "24,580" : rawTotal;
    
    // Hash determinista del lote ID para sacar un número de lotes en la manzana
    const lotesEnManzana = data.id_lote ? (data.id_lote.charCodeAt(12) % 15) + 20 : 35;
    const side = Math.sqrt(data.area_grafica || 200) * 3.5;
    // Usar la métrica real del endpoint /api/search/rtree (búsqueda espacial GiST) si está disponible,
    // si no, caer al execution_time_ms del endpoint de lote
    const searchTime = rtreeSearchTimeMs
        ? Number(rtreeSearchTimeMs).toFixed(3)
        : (data.execution_time_ms ? Number(data.execution_time_ms).toFixed(3) : "0.145");

    switch(pasoIndex) {
        case 0:
            title = "n0: raíz";
            titleColor = "#a855f7";
            desc = "escaneo nodo raíz";
            svgContent = `
                <rect x="5" y="5" width="150" height="100" stroke="#a855f7" stroke-width="1.5" fill="rgba(168, 85, 247, 0.05)" stroke-dasharray="4,4"/>
                <text x="12" y="25" fill="#a855f7" font-size="9px" font-family="monospace" font-weight="bold">MBR N0 (RAÍZ)</text>
                <text x="12" y="38" fill="rgba(168, 85, 247, 0.4)" font-size="7px" font-family="monospace">Puno macro sector</text>
            `;
            metricsHtml = `
                <div class="debug-step-metrics">
                    <div class="metric-row"><span class="metric-k">MBR ÁREA</span><span class="metric-v">${ciudad}</span></div>
                    <div class="metric-row"><span class="metric-k">REGISTROS</span><span class="metric-v">${dbTotal}</span></div>
                    <div class="metric-row"><span class="metric-k">OPERADOR</span><span class="metric-v">ST_Overlap</span></div>
                    <div class="metric-row"><span class="metric-k">EVAL</span><span class="metric-v success-val">CONSISTENT</span></div>
                </div>
            `;
            break;
        case 1:
            title = "n1: manzana";
            titleColor = "#06b6d4";
            desc = "poda de sub-ramas";
            svgContent = `
                <rect x="5" y="5" width="150" height="100" stroke="rgba(255,255,255,0.08)" stroke-width="1" fill="none"/>
                <rect x="40" y="20" width="80" height="70" stroke="#06b6d4" stroke-width="1.5" fill="rgba(6, 182, 212, 0.06)" stroke-dasharray="3,3"/>
                <text x="48" y="35" fill="#06b6d4" font-size="9px" font-family="monospace" font-weight="bold">MBR N1</text>
            `;
            break;
        case 2:
            title = "n2: predio";
            titleColor = "#10b981";
            desc = "registro encontrado";
            
            // Generar el polígono real escalado
            let pointsStr = "";
            if (data && data.geom && data.geom.coordinates && data.geom.coordinates[0]) {
                const coordinates = data.geom.coordinates[0];
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
                const max_dimension = Math.max(w, h) || 1;
                
                // Centrar y escalar a 110x70 dentro del área de 160x110
                const scale = 70 / max_dimension;
                const offsetX = (160 - w * scale) / 2;
                const offsetY = (110 - h * scale) / 2;
                
                const scaledPoints = coordinates.map(p => {
                    const x = offsetX + (p[0] - min_x) * scale;
                    const y = 110 - (offsetY + (p[1] - min_y) * scale); 
                    return `${x.toFixed(1)},${y.toFixed(1)}`;
                });
                pointsStr = scaledPoints.join(" ");
            }
            
            svgContent = `
                <polygon points="${pointsStr}" stroke="#10b981" stroke-width="1.8" fill="rgba(16, 185, 129, 0.15)"/>
            `;
            break;
    }

    // Insertar métricas en línea para N1 y N2
    if (pasoIndex === 1) {
        metricsHtml = `
            <div class="debug-step-metrics">
                <div class="metric-row"><span class="metric-k">MBR LÍMITE</span><span class="metric-v">${side.toFixed(0)}x${side.toFixed(0)}m</span></div>
                <div class="metric-row"><span class="metric-k">CANDIDATOS</span><span class="metric-v">${lotesEnManzana} lotes</span></div>
                <div class="metric-row"><span class="metric-k">OPERADOR</span><span class="metric-v">ST_Contains</span></div>
                <div class="metric-row"><span class="metric-k">EVAL</span><span class="metric-v success-val">CONSISTENT</span></div>
            </div>
        `;
    } else if (pasoIndex === 2) {
        metricsHtml = `
            <div class="debug-step-metrics">
                <div class="metric-row"><span class="metric-k">LOTE ID</span><span class="metric-v">...${data.id_lote.substring(10)}</span></div>
                <div class="metric-row"><span class="metric-k">ÁREA REG</span><span class="metric-v">${data.area_grafica ? Number(data.area_grafica).toFixed(1) : "N/D"} m²</span></div>
                <div class="metric-row"><span class="metric-k">R-TREE ACC</span><span class="metric-v">${searchTime} ms</span></div>
                <div class="metric-row"><span class="metric-k">ESTADO</span><span class="metric-v success-val">FOUND</span></div>
            </div>
        `;
    }

    return `
        <div class="debug-step-card">
            <span class="debug-step-title" style="color: ${titleColor};">${title}</span>
            <svg width="160" height="110" style="background: rgba(5,7,12,0.65); border: 1px solid rgba(129,140,248,0.12);">
                ${svgContent}
            </svg>
            <span class="debug-step-desc">${desc}</span>
            ${metricsHtml}
        </div>
    `;
}

function crearMiniCardSVGPGM(pasoIndex, data, stats) {
    let svgContent = "";
    let title = "";
    let titleColor = "";
    let desc = "";
    let metricsHtml = "";

    const searchTime = stats ? Number(stats.learned_search_time_ms).toFixed(3) : "0.025";

    switch(pasoIndex) {
        case 0:
            title = "hk: hilbert 1d";
            titleColor = "#34d399";
            desc = "codificación coordenadas";
            svgContent = `
                <text x="12" y="30" fill="#34d399" font-size="9px" font-family="monospace" font-weight="bold">CURVA HILBERT</text>
                <line x1="20" y1="50" x2="140" y2="50" stroke="#34d399" stroke-width="0.5" stroke-dasharray="2,2" opacity="0.3"/>
                <text x="12" y="65" fill="rgba(52, 211, 153, 0.4)" font-size="7px" font-family="monospace">lat→lon→hilbert_key</text>
                <circle cx="80" cy="45" r="3" fill="#34d399" opacity="0.6"/>
            `;
            metricsHtml = `
                <div class="debug-step-metrics">
                    <div class="metric-row"><span class="metric-k">CLAVE HK</span><span class="metric-v" style="color:#34d399">${stats && stats.hilbert_key ? stats.hilbert_key.toString().substring(0,12)+"..." : "—"}</span></div>
                    <div class="metric-row"><span class="metric-k">MÉTRICA</span><span class="metric-v">Hilbert 1D</span></div>
                    <div class="metric-row"><span class="metric-k">ESTADO</span><span class="metric-v success-val">MAPPED</span></div>
                </div>
            `;
            break;
        case 1:
            title = "pgm: predicción";
            titleColor = "#06b6d4";
            desc = "regresión segmentada";
            svgContent = `
                <text x="12" y="25" fill="#06b6d4" font-size="9px" font-family="monospace" font-weight="bold">MODELO PGM</text>
                <line x1="15" y1="80" x2="145" y2="20" stroke="#06b6d4" stroke-width="1.2" opacity="0.6"/>
                <circle cx="95" cy="45" r="4" fill="#06b6d4" opacity="0.8"/>
                <text x="70" y="42" fill="#fff" font-size="6px" font-family="monospace">● pred</text>
            `;
            metricsHtml = `
                <div class="debug-step-metrics">
                    <div class="metric-row"><span class="metric-k">SEGMENTOS</span><span class="metric-v" style="color:#06b6d4">${stats ? stats.segments_count : "—"}</span></div>
                    <div class="metric-row"><span class="metric-k">ERROR ε</span><span class="metric-v">${stats ? stats.epsilon : "—"}</span></div>
                    <div class="metric-row"><span class="metric-k">ESTADO</span><span class="metric-v success-val">PREDICTED</span></div>
                </div>
            `;
            break;
        case 2:
            title = "bs: búsqueda local";
            titleColor = "#f59e0b";
            desc = "registro verificado";
            svgContent = `
                <polygon points="30,15 50,55 10,55" stroke="#f59e0b" stroke-width="1.2" fill="rgba(245, 158, 11, 0.1)" transform="translate(60,20)"/>
                <text x="80" y="85" fill="#f59e0b" font-size="7px" font-family="monospace">rango [ε]</text>
            `;
            metricsHtml = `
                <div class="debug-step-metrics">
                    <div class="metric-row"><span class="metric-k">RANGO BS</span><span class="metric-v" style="color:#f59e0b">${stats && stats.pgm_search_range ? `[${stats.pgm_search_range.join(',')}]` : "—"}</span></div>
                    <div class="metric-row"><span class="metric-k">PASOS</span><span class="metric-v">${stats ? stats.binary_steps : "—"}</span></div>
                    <div class="metric-row"><span class="metric-k">PGM ACC</span><span class="metric-v">${searchTime} ms</span></div>
                    <div class="metric-row"><span class="metric-k">ESTADO</span><span class="metric-v success-val">FOUND</span></div>
                </div>
            `;
            break;
    }

    return `
        <div class="debug-step-card pgm-debug-card">
            <span class="debug-step-title" style="color: ${titleColor};">${title}</span>
            <svg width="160" height="110" style="background: rgba(5,7,12,0.65); border: 1px solid rgba(16,185,129,0.15);">
                ${svgContent}
            </svg>
            <span class="debug-step-desc">${desc}</span>
            ${metricsHtml}
        </div>
    `;
}

function ejecutarSimulacionPasoAPaso(data, rtreeSearchTimeMs) {
    const diceBtn = document.querySelector(".btn-dice");
    if (diceBtn) diceBtn.disabled = true;
    
    const setId = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setId("pres-id", "...");
    setId("pres-ciudad", "...");
    setId("pres-area", "...");
    setId("pres-peri", "...");
    setId("pres-coords", "...");
    setId("pres-time", "...");

    // Randomizer para métricas durante la simulación de debug (efecto "scanner" sobre pres-time y minimal-time-tag)
    const presTimeEl = document.getElementById("pres-time");
    const rtreeTimeTag = document.querySelector(".minimal-time-tag");
    let randomizerTarget = rtreeSearchTimeMs ? Number(rtreeSearchTimeMs) : null;
    let pgmTarget = null;
    let randomizerInterval = setInterval(() => {
        // Actualizar el target de PGM si learnedStats ya llegó
        if (learnedStats && learnedStats.learned_search_time_ms) {
            pgmTarget = Number(learnedStats.learned_search_time_ms);
        }
        // Generar valor aleatorio para pres-time que converja al R-Tree real
        if (presTimeEl) {
            if (randomizerTarget !== null) {
                const jitter = (Math.random() - 0.5) * randomizerTarget * 0.4;
                const value = Math.max(0.05, randomizerTarget + jitter);
                presTimeEl.textContent = `${value.toFixed(3)} ms`;
                presTimeEl.style.color = "#a855f7";
            } else {
                presTimeEl.textContent = `${(Math.random() * 3 + 0.5).toFixed(3)} ms`;
                presTimeEl.style.color = "#a855f7";
            }
        }
        // Generar valores aleatorios para minimal-time-tag (pgm_li + R-TREE ACC)
        if (rtreeTimeTag) {
            const rtreeVal = randomizerTarget !== null
                ? Math.max(0.05, randomizerTarget + (Math.random() - 0.5) * randomizerTarget * 0.4)
                : (Math.random() * 3 + 0.5);
            const pgmVal = pgmTarget !== null
                ? Math.max(0.005, pgmTarget + (Math.random() - 0.5) * pgmTarget * 0.4)
                : (Math.random() * 0.05 + 0.005);
            rtreeTimeTag.innerHTML = `[pgm_li: <span style="color: #10b981; font-weight:bold;">${pgmVal.toFixed(3)} ms</span> | R-TREE ACC: <span style="color: #a855f7;">${rtreeVal.toFixed(3)} ms</span>]`;
        }
    }, 60);
    
    const rTreeElements = {
        n0: document.getElementById("r-tree-n0"),
        c0: document.getElementById("r-tree-c0"),
        n1: document.getElementById("r-tree-n1"),
        c1: document.getElementById("r-tree-c1"),
        n2: document.getElementById("r-tree-n2")
    };
    Object.values(rTreeElements).forEach(el => {
        if (el) el.className = el.className.split(" ")[0];
    });

    const pgmElements = {
        n0: document.getElementById("pgm-n0"),
        c0: document.getElementById("pgm-c0"),
        n1: document.getElementById("pgm-n1"),
        c1: document.getElementById("pgm-c1"),
        n2: document.getElementById("pgm-n2")
    };
    Object.values(pgmElements).forEach(el => {
        if (el) el.className = el.className.split(" ")[0];
    });

    const debugContainer = document.getElementById("debug-steps-container");
    if (debugContainer) {
        debugContainer.innerHTML = "";
        debugContainer.classList.add("dual-debug");
    }

    let learnedStats = null;

    const lat = data.center ? data.center.lat : -15.8402;
    const lon = data.center ? data.center.lon : -70.0219;
    fetch(`/api/search/learned?lat=${lat}&lon=${lon}`)
        .then(r => r.ok ? r.json() : null)
        .then(res => { if (res) learnedStats = res.stats; })
        .catch(() => {});

    // Helper para crear columnas duales
    function dualRow(rtreeHtml, pgmHtml) {
        return `<div class="dual-debug-row"><div class="dual-debug-col rtree-col">${rtreeHtml}</div><div class="dual-debug-col pgm-col">${pgmHtml}</div></div>`;
    }

    // Paso 0: N0 Raíz + HK (t = 0)
    if (debugContainer) {
        debugContainer.innerHTML += dualRow(crearMiniCardSVG(0, data, rtreeSearchTimeMs), crearMiniCardSVGPGM(0, data, null));
    }
    if (rTreeElements.n0) rTreeElements.n0.classList.add("active-n0");
    if (pgmElements.n0) pgmElements.n0.classList.add("active-pgm-n0");
    const n0Meta = document.getElementById("n0-meta");
    if (n0Meta) n0Meta.textContent = "evaluando...";
    const pgmN0Meta = document.getElementById("pgm-n0-meta");
    if (pgmN0Meta) pgmN0Meta.textContent = "evaluando...";
    
    // Paso 1: N1 Manzana + PGM Predicción (t = 1000ms)
    setTimeout(() => {
        if (debugContainer) {
            debugContainer.innerHTML += dualRow(crearMiniCardSVG(1, data, rtreeSearchTimeMs), crearMiniCardSVGPGM(1, data, learnedStats));
        }
        if (rTreeElements.c0) rTreeElements.c0.classList.add("active-c0");
        if (rTreeElements.n1) rTreeElements.n1.classList.add("active-n1");
        if (n0Meta) n0Meta.textContent = data.ciudad ? data.ciudad.split("(")[0].trim() : "Puno";
        const n1Meta = document.getElementById("n1-meta");
        if (n1Meta) n1Meta.textContent = "evaluando...";

        if (pgmElements.c0) pgmElements.c0.classList.add("active-pgm-c0");
        if (pgmElements.n1) pgmElements.n1.classList.add("active-pgm-n1");
        const pgmN1Meta = document.getElementById("pgm-n1-meta");
        if (pgmN1Meta) pgmN1Meta.textContent = "evaluando...";
    }, 1000);
    
    // Paso 2: N2 Predio + BS Búsqueda Local (t = 2000ms)
    setTimeout(() => {
        // Detener randomizer y mostrar valor real sincronizado con la card N2
        clearInterval(randomizerInterval);
        if (presTimeEl && rtreeSearchTimeMs) {
            presTimeEl.textContent = `${Number(rtreeSearchTimeMs).toFixed(3)} ms`;
            presTimeEl.style.color = "#a855f7";
        } else if (presTimeEl) {
            presTimeEl.textContent = `${(data.execution_time_ms || 0.145).toFixed(3)} ms`;
            presTimeEl.style.color = "#a855f7";
        }
        if (debugContainer) {
            debugContainer.innerHTML += dualRow(crearMiniCardSVG(2, data, rtreeSearchTimeMs), crearMiniCardSVGPGM(2, data, learnedStats));
        }
        if (rTreeElements.c1) rTreeElements.c1.classList.add("active-c1");
        if (rTreeElements.n2) rTreeElements.n2.classList.add("active-n2");
        const n1Meta = document.getElementById("n1-meta");
        if (n1Meta) {
            const side = Math.sqrt(data.area_grafica || 200) * 3.5;
            n1Meta.textContent = `bbox ${side.toFixed(0)}x${side.toFixed(0)}m`;
        }
        const n2Meta = document.getElementById("n2-meta");
        if (n2Meta) n2Meta.textContent = "accediendo...";

        if (pgmElements.c1) pgmElements.c1.classList.add("active-pgm-c1");
        if (pgmElements.n2) pgmElements.n2.classList.add("active-pgm-n2");
        const pgmN2Meta = document.getElementById("pgm-n2-meta");
        if (pgmN2Meta) pgmN2Meta.textContent = "evaluando...";
    }, 2000);
    
    // Finalización (t = 3000ms)
    setTimeout(() => {
        const n2Meta = document.getElementById("n2-meta");
        if (n2Meta) n2Meta.textContent = `id ${data.id_lote.substring(10)}`;
        const pgmN2Meta = document.getElementById("pgm-n2-meta");
        if (pgmN2Meta && learnedStats) pgmN2Meta.textContent = `ε=${learnedStats.epsilon}`;

        // Restaurar todos los datos del lote y métricas sincronizadas con la card N2
        actualizarLotePresentadorNormal(data, learnedStats, rtreeSearchTimeMs);
        
        isRandomizing = false;
        if (diceBtn) diceBtn.disabled = false;
    }, 3000);
}

// ── BÚSQUEDA UNIFICADA (R-TREE + PGM-INDEX SIMULTÁNEO) ──
async function buscarLoteUnificado(lat, lon) {
    if (isRandomizing) return;
    await coldCacheFlush();

    if (lat === undefined || lon === undefined) {
        if (currentLoteData && currentLoteData.center) {
            lat = currentLoteData.center.lat;
            lon = currentLoteData.center.lon;
        } else {
            lat = -15.8402;
            lon = -70.0219;
        }
    }

    isRandomizing = true;

    const metadataPanel = document.getElementById("metadata-details-panel");
    if (metadataPanel) metadataPanel.classList.remove("collapsed");

    const previewContainer = document.querySelector(".preview-container");
    const debugContainer = document.getElementById("debug-steps-container");

    if (previewContainer) previewContainer.style.display = "flex";
    if (debugContainer) {
        debugContainer.classList.remove("active");
        debugContainer.innerHTML = "";
    }

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
            isRandomizing = false;
            return;
        }

        await new Promise(r => setTimeout(r, 600));

        const realRtreeTime = rtreeStats ? rtreeStats.rtree_search_time_ms : null;
        actualizarLotePresentadorNormal(lote, learnedStats, realRtreeTime);
        currentLoteData = lote;

        animarWidgetsConcurrentes(lote, learnedStats);
    } catch (err) {
        console.error("Error en búsqueda unificada:", err);
    } finally {
        isRandomizing = false;
    }
}

function animarWidgetsConcurrentes(lote, learnedStats) {
    const rTreeElements = {
        n0: document.getElementById("r-tree-n0"),
        c0: document.getElementById("r-tree-c0"),
        n1: document.getElementById("r-tree-n1"),
        c1: document.getElementById("r-tree-c1"),
        n2: document.getElementById("r-tree-n2")
    };

    const pgmElements = {
        n0: document.getElementById("pgm-n0"),
        c0: document.getElementById("pgm-c0"),
        n1: document.getElementById("pgm-n1"),
        c1: document.getElementById("pgm-c1"),
        n2: document.getElementById("pgm-n2")
    };

    const rTreeMetas = {
        n0: document.getElementById("n0-meta"),
        n1: document.getElementById("n1-meta"),
        n2: document.getElementById("n2-meta")
    };

    const pgmMetas = {
        n0: document.getElementById("pgm-n0-meta"),
        n1: document.getElementById("pgm-n1-meta"),
        n2: document.getElementById("pgm-n2-meta")
    };

    Object.values(rTreeElements).forEach(el => {
        if (el) el.className = el.className.split(" ")[0];
    });
    Object.values(pgmElements).forEach(el => {
        if (el) el.className = el.className.split(" ")[0];
    });

    if (pgmMetas.n0 && learnedStats) {
        pgmMetas.n0.textContent = learnedStats.hilbert_key ? learnedStats.hilbert_key.toString().substring(0, 10) + "..." : "hilbert_val";
    }
    if (pgmMetas.n1 && learnedStats) {
        pgmMetas.n1.textContent = learnedStats.pgm_predicted_index !== undefined ? `idx: ${learnedStats.pgm_predicted_index}` : "modelo_lineal";
    }
    if (pgmMetas.n2 && learnedStats) {
        pgmMetas.n2.textContent = learnedStats.pgm_search_range ? `[${learnedStats.pgm_search_range.join(',')}]` : "rango_ε";
    }

    setTimeout(() => { if (rTreeElements.n0) rTreeElements.n0.classList.add("active-n0"); }, 50);
    setTimeout(() => {
        if (rTreeElements.c0) rTreeElements.c0.classList.add("active-c0");
        if (rTreeElements.n1) rTreeElements.n1.classList.add("active-n1");
        if (rTreeMetas.n0) rTreeMetas.n0.textContent = lote.ciudad ? lote.ciudad.split("(")[0].trim() : "Puno";
    }, 200);
    setTimeout(() => {
        if (rTreeElements.c1) rTreeElements.c1.classList.add("active-c1");
        if (rTreeElements.n2) rTreeElements.n2.classList.add("active-n2");
        if (rTreeMetas.n1) {
            const side = Math.sqrt(lote.area_grafica || 200) * 3.5;
            rTreeMetas.n1.textContent = `bbox ${side.toFixed(0)}x${side.toFixed(0)}m`;
        }
        if (rTreeMetas.n2) rTreeMetas.n2.textContent = `id ${lote.id_lote.substring(10)}`;
    }, 400);

    setTimeout(() => { if (pgmElements.n0) pgmElements.n0.classList.add("active-pgm-n0"); }, 50);
    setTimeout(() => {
        if (pgmElements.c0) pgmElements.c0.classList.add("active-pgm-c0");
        if (pgmElements.n1) pgmElements.n1.classList.add("active-pgm-n1");
    }, 200);
    setTimeout(() => {
        if (pgmElements.c1) pgmElements.c1.classList.add("active-pgm-c1");
        if (pgmElements.n2) pgmElements.n2.classList.add("active-pgm-n2");
        if (pgmMetas.n2 && learnedStats) pgmMetas.n2.textContent = `ε=${learnedStats.epsilon}`;
    }, 400);
}

function restaurarEtiquetasRTree() {
    const title = document.querySelector(".traversal-title");
    if (title) title.textContent = ">> r_tree_traversal_trace:";
    
    const n0 = document.getElementById("r-tree-n0");
    if (n0) {
        n0.querySelector(".node-index").textContent = "N0";
        n0.querySelector(".node-level").textContent = "Raíz";
    }
    const n1 = document.getElementById("r-tree-n1");
    if (n1) {
        n1.querySelector(".node-index").textContent = "N1";
        n1.querySelector(".node-level").textContent = "Manzana";
    }
    const n2 = document.getElementById("r-tree-n2");
    if (n2) {
        n2.querySelector(".node-index").textContent = "N2";
        n2.querySelector(".node-level").textContent = "Predio";
    }
}

function cambiarEtiquetasPGM(stats) {
    const title = document.querySelector(".traversal-title");
    if (title) title.textContent = ">> learned_index_pgm_trace:";
    
    const n0 = document.getElementById("r-tree-n0");
    if (n0) {
        n0.querySelector(".node-index").textContent = "HK";
        n0.querySelector(".node-level").textContent = "Clave 1D";
        document.getElementById("n0-meta").textContent = stats.hilbert_key.toString().substring(0, 10) + "...";
    }
    const n1 = document.getElementById("r-tree-n1");
    if (n1) {
        n1.querySelector(".node-index").textContent = "PGM";
        n1.querySelector(".node-level").textContent = "Predicción";
        document.getElementById("n1-meta").textContent = `idx: ${stats.pgm_predicted_index}`;
    }
    const n2 = document.getElementById("r-tree-n2");
    if (n2) {
        n2.querySelector(".node-index").textContent = "BS";
        n2.querySelector(".node-level").textContent = "Búsqueda Local";
        document.getElementById("n2-meta").textContent = `rango [${stats.pgm_search_range.join(',')}]`;
    }
}

function activarNodosRTreeSecuencial(lote) {
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
    
    if (elements.n0) elements.n0.classList.add("active-n0");
    
    setTimeout(() => {
        if (elements.c0) elements.c0.classList.add("active-c0");
        if (elements.n1) elements.n1.classList.add("active-n1");
        const side = Math.sqrt(lote.area_grafica || 200) * 3.5;
        document.getElementById("n1-meta").textContent = `bbox ${side.toFixed(0)}x${side.toFixed(0)}m`;
    }, 200);
    
    setTimeout(() => {
        if (elements.c1) elements.c1.classList.add("active-c1");
        if (elements.n2) elements.n2.classList.add("active-n2");
        document.getElementById("n2-meta").textContent = `id ${lote.id_lote.substring(10)}`;
    }, 400);
}

function activarNodosPGMSecuencial(stats) {
    const elements = {
        n0: document.getElementById("pgm-n0"),
        c0: document.getElementById("pgm-c0"),
        n1: document.getElementById("pgm-n1"),
        c1: document.getElementById("pgm-c1"),
        n2: document.getElementById("pgm-n2")
    };

    const metas = {
        n0: document.getElementById("pgm-n0-meta"),
        n1: document.getElementById("pgm-n1-meta"),
        n2: document.getElementById("pgm-n2-meta")
    };
    
    Object.values(elements).forEach(el => {
        if (el) el.className = el.className.split(" ")[0];
    });

    if (metas.n0 && stats) metas.n0.textContent = stats.hilbert_key ? stats.hilbert_key.toString().substring(0, 10) + "..." : "hilbert_val";
    if (metas.n1 && stats) metas.n1.textContent = stats.pgm_predicted_index !== undefined ? `idx: ${stats.pgm_predicted_index}` : "modelo_lineal";
    if (metas.n2 && stats) metas.n2.textContent = stats.pgm_search_range ? `[${stats.pgm_search_range.join(',')}]` : "rango_ε";
    
    if (elements.n0) elements.n0.classList.add("active-pgm-n0");
    
    setTimeout(() => {
        if (elements.c0) elements.c0.classList.add("active-pgm-c0");
        if (elements.n1) elements.n1.classList.add("active-pgm-n1");
    }, 200);
    
    setTimeout(() => {
        if (elements.c1) elements.c1.classList.add("active-pgm-c1");
        if (elements.n2) elements.n2.classList.add("active-pgm-n2");
        if (metas.n2 && stats) metas.n2.textContent = `ε=${stats.epsilon}`;
    }, 400);
}

window.buscarLoteUnificado = buscarLoteUnificado;