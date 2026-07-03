document.addEventListener("DOMContentLoaded", async () => {
    const dbNameEl = document.getElementById("db-name");
    const dbCountEl = document.getElementById("db-count");

    try {
        const response = await fetch("http://localhost:8010/api/status");
        if (!response.ok) throw new Error("Error de comunicación");
        
        const data = await response.json();

        if (dbNameEl) dbNameEl.textContent = data.database.toUpperCase();
        if (dbCountEl) dbCountEl.textContent = data.total_records;

    } catch (error) {
        console.error("No se pudo recuperar el estado de los servicios:", error);
        if (dbNameEl) dbNameEl.textContent = "POSTGRESQL (DESCONECTADO)";
        if (dbCountEl) dbCountEl.textContent = "No disponible";
    }
});