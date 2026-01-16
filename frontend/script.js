const API_URL = "http://127.0.0.1:8000";

document.addEventListener('DOMContentLoaded', () => {
    // Inicializar listeners
    const fileInput = document.getElementById("input");
    if (fileInput) {
        fileInput.addEventListener('change', handleImagePreview);
    }

    // Mobile Menu
    const menuToggle = document.getElementById('menu-toggle');
    const overlay = document.getElementById('sidebar-overlay');
    const sidebar = document.querySelector('.sidebar');

    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            sidebar.classList.toggle('active');
            overlay.classList.toggle('active');
        });
    }

    if (overlay) {
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
        });
    }
});

function handleImagePreview(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (event) {
            const preview = document.getElementById('image-preview');
            preview.src = event.target.result;
            preview.style.display = 'block';
        }
        reader.readAsDataURL(file);
    }
}

// --- NAVEGACION SPA ---
function showSection(sectionId, linkElement) {
    // 1. Ocultar todas las secciones
    ['monitor', 'history', 'forecast'].forEach(id => {
        document.getElementById(`sec-${id}`).classList.remove('active-section');
        document.getElementById(`sec-${id}`).classList.add('hidden-section');
    });

    // 2. Mostrar la seleccionada
    document.getElementById(`sec-${sectionId}`).classList.remove('hidden-section');
    document.getElementById(`sec-${sectionId}`).classList.add('active-section');

    // 3. Actualizar nav active
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    linkElement.classList.add('active');

    // 4. Cargar datos si es necesario
    if (sectionId === 'history') renderHistory();
    if (sectionId === 'forecast') getForecast();

    // 5. Cerrar menú en mobile
    if (window.innerWidth <= 1024) {
        document.querySelector('.sidebar').classList.remove('active');
        document.getElementById('sidebar-overlay').classList.remove('active');
    }
}

// --- HISTORIAL ---
// --- UTILIDAD: Compresión de Imágenes ---
async function createThumbnail(base64Str, maxWidth = 150) {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = base64Str;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const scaleSize = maxWidth / img.width;
            canvas.width = maxWidth;
            canvas.height = img.height * scaleSize;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            // Comprimir a JPEG calidad 0.7 para ahorrar espacio drásticamente
            resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
    });
}

// --- HISTORIAL ---
async function saveToHistory(imageData, result) {
    try {
        let history = JSON.parse(localStorage.getItem('dss_history') || '[]');

        // Crear miniatura para no saturar el localStorage
        const thumbData = await createThumbnail(imageData, 150);

        const newEntry = {
            id: Date.now(),
            date: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString(),
            image: thumbData,
            diagnostico: result.diagnostico,
            riesgo: result.riesgo
        };

        history.unshift(newEntry); // Agregar al inicio

        // Algoritmo de reintento: Si falla por quota, borra el más viejo y reintenta
        while (true) {
            try {
                localStorage.setItem('dss_history', JSON.stringify(history));
                break; // Guardado exitoso
            } catch (e) {
                if (e.name === 'QuotaExceededError' || e.code === 22) {
                    if (history.length <= 1) {
                        console.error("No se pudo guardar ni siquiera el último item.");
                        break;
                    }
                    console.warn("Storage lleno, eliminando item más antiguo...");
                    history.pop(); // Eliminar el último (más antiguo)
                } else {
                    throw e; // Otro error
                }
            }
        }
    } catch (error) {
        console.error("Error gestionando historial:", error);
    }
}

function clearHistory() {
    if (confirm("¿Estás seguro de que quieres borrar todo el historial?")) {
        localStorage.removeItem('dss_history');
        renderHistory();
        alert("Historial borrado.");
    }
}

function renderHistory() {
    const history = JSON.parse(localStorage.getItem('dss_history') || '[]');
    const container = document.getElementById('history-grid');

    if (history.length === 0) {
        container.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">No hay diagnósticos guardados aún.</p>';
        return;
    }

    container.innerHTML = history.map(item => `
        <div class="card" style="padding: 15px;">
            <img src="${item.image}" style="width: 100%; height: 150px; object-fit: cover; border-radius: 8px; margin-bottom: 10px;">
            <div style="font-weight: 600; font-size: 14px;">${item.date}</div>
            <div style="font-size: 16px; color: var(--primary); font-weight: 700;">${item.diagnostico}</div>
            <div style="font-size: 13px; color: var(--text-muted);">Riesgo: ${item.riesgo}</div>
        </div>
    `).join('');
}

// --- LÓGICA DE DIGNÓSTICO POR IMAGEN ---
async function analizar() {
    const btn = document.getElementById("btn-analizar");
    const outputDiv = document.getElementById("output");
    const fileInput = document.getElementById("input");
    const file = fileInput.files[0];
    const previewImg = document.getElementById('image-preview');

    if (!file) {
        alert("Por favor, selecciona una imagen primero.");
        return;
    }

    // UI Loading State
    outputDiv.style.display = "none";
    btn.disabled = true;
    const originalBtnText = btn.innerHTML;
    btn.innerHTML = '<span><div class="spinner"></div> Procesando...</span>';

    const form = new FormData();
    form.append("file", file);

    try {
        const res = await fetch(`${API_URL}/analizar`, {
            method: "POST",
            body: form
        });

        if (!res.ok) throw new Error(`${res.statusText}`);

        const data = await res.json();

        // Guardar en historial
        if (previewImg.src) {
            await saveToHistory(previewImg.src, data);
        }

        outputDiv.style.display = "block";
        outputDiv.innerHTML = `
            <div class="diagnostico-item">
                <span class="diagnostico-label">Diagnóstico</span>
                <span style="color: var(--primary); font-weight:700;">${data.diagnostico}</span>
            </div>
            <div class="diagnostico-item">
                <span class="diagnostico-label">Riesgo</span>
                <span>${data.riesgo}</span>
            </div>
            <div class="diagnostico-item">
                <span class="diagnostico-label">Confianza</span>
                <span>${(data.probabilidad_enfermedad * 100).toFixed(1)}%</span>
            </div>
            <div style="margin-top:15px; font-size: 13px; color: var(--text-muted); font-style: italic;">
                <strong>Nota:</strong> ${data.recomendacion}
            </div>
        `;
    } catch (error) {
        outputDiv.style.display = "block";
        outputDiv.innerHTML = `<span style="color:var(--danger);">Error: No se pudo conectar con el servidor.</span>`;
        console.error(error);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalBtnText;
    }
}

// --- LÓGICA DE RIESGO CLIMÁTICO ---
async function calcularRiesgo() {
    const btn = document.getElementById("btn-riesgo");
    const resDiv = document.getElementById('resultado-clima');

    const temp = parseFloat(document.getElementById('temp').value);
    const hum = parseFloat(document.getElementById('humedad').value);
    const lluvia = document.getElementById('lluvia').value === 'si';
    const horas = parseFloat(document.getElementById('horas').value);

    if (isNaN(temp) || isNaN(hum) || isNaN(horas)) {
        alert("Por favor, completa todos los campos.");
        return;
    }

    // UI Loading State
    resDiv.style.display = "none";
    btn.disabled = true;
    const originalBtnText = btn.innerHTML;
    btn.innerHTML = '<span><div class="spinner"></div> Calculando...</span>';

    try {
        const res = await fetch(`${API_URL}/calcular-riesgo`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ temperature: temp, humidity: hum, raining: lluvia, hours: horas })
        });

        if (!res.ok) throw new Error("Error en servidor");

        const data = await res.json();

        resDiv.style.display = "block";
        resDiv.style.backgroundColor = data.color;
        resDiv.style.color = (data.color === 'yellow' || data.color === '#f1c40f') ? '#283618' : 'white';
        resDiv.innerText = data.mensaje;

    } catch (error) {
        resDiv.style.display = "block";
        resDiv.style.backgroundColor = "transparent";
        resDiv.innerHTML = `<span style="color:var(--danger);">Error de conexión.</span>`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalBtnText;
    }
}

// --- UTILIDAD: CLIMA AUTOMÁTICO (CON FALLBACK) ---
async function obtenerClima() {
    const btn = document.getElementById("btn-geo");
    const originalText = btn.innerHTML;

    btn.disabled = true;
    btn.innerHTML = '<span><div class="spinner" style="border-top-color: var(--primary); border-color: rgba(45, 90, 39, 0.3);"></div> Obteniendo ubicación...</span>';

    const fetchWeather = async (lat, lon, isFallback = false) => {
        try {
            btn.innerHTML = '<span><div class="spinner" style="border-top-color: var(--primary); border-color: rgba(45, 90, 39, 0.3);"></div> Consultando satélite...</span>';
            const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,rain&timezone=auto`);

            if (!response.ok) throw new Error("Error al obtener datos del clima");

            const data = await response.json();
            const current = data.current;

            document.getElementById('temp').value = current.temperature_2m;
            document.getElementById('humedad').value = current.relative_humidity_2m;
            const isRaining = current.rain > 0;
            document.getElementById('lluvia').value = isRaining ? "si" : "no";

            if (isFallback) {
                alert("⚠ No se pudo detectar tu ubicación exacta. Usando datos de referencia (Ecuador).");
            }

            btn.innerHTML = "<span>✅ Datos actualizados</span>";
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }, 2000);
            return true;
        } catch (error) {
            console.error(error);
            return false;
        }
    };

    if (!navigator.geolocation) {
        // Fallback directo
        await fetchWeather(-2.9001, -79.0059, true); // Cuenca default
        return;
    }

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            await fetchWeather(lat, lon);
        },
        async (error) => {
            console.warn("Geolocation Error:", error);
            // Fallback en caso de error (Code 2, etc.)
            const success = await fetchWeather(-2.9001, -79.0059, true); // Cuenca default
            if (!success) {
                alert("No se pudo obtener el clima.");
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        },
        { timeout: 10000, enableHighAccuracy: false }
    );
}

// --- PRONÓSTICO 5 DÍAS (CON FALLBACK) ---
async function getForecast() {
    const container = document.getElementById('forecast-container');
    container.innerHTML = '<p>Obteniendo ubicación...</p>';

    const renderForecast = async (lat, lon, isFallback = false) => {
        try {
            const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto`);
            const data = await response.json();
            const daily = data.daily;

            let html = '';
            if (isFallback) {
                html += '<p style="grid-column: 1/-1; color: orange; font-size: 12px; margin-bottom: 10px;">⚠ Usando ubicación predeterminada (Ecuador) por falta de acceso GPS.</p>';
            }

            for (let i = 0; i < 5; i++) {
                const date = new Date(daily.time[i]).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' });
                const maxTemp = daily.temperature_2m_max[i];
                const rainProb = daily.precipitation_probability_max[i];

                let advice = "";
                let color = "green";

                if (rainProb > 50) {
                    advice = "🌧️ Alta prob. lluvia. No fumigar.";
                    color = "orange"; // Advertencia para lluvia
                } else if (maxTemp > 25 && rainProb > 20) {
                    advice = "⚠️ Riesgo de hongo. Fumigar hoy.";
                    color = "#d63031"; // Rojo para riesgo de hongo
                } else {
                    advice = "✅ Condiciones estables.";
                    color = "#2d5a27"; // Verde seguro
                }

                html += `
                    <div class="card" style="padding: 20px; text-align: center; border-left: 6px solid ${color}">
                        <h3 style="margin-bottom: 10px; text-transform: capitalize; font-size: 18px;">${date}</h3>
                        <div style="font-size: 28px; font-weight: bold; margin-bottom: 5px; color: ${color}">${maxTemp}°C</div>
                        <div style="color: var(--text-muted); margin-bottom: 15px;">Lluvia: ${rainProb}%</div>
                        <div style="font-size: 13px; font-weight: 600; background: #f1f2f6; padding: 10px; border-radius: 8px; color: #2f3542;">
                            ${advice}
                        </div>
                    </div>
                `;
            }
            container.innerHTML = html;
        } catch (e) {
            console.error(e);
            container.innerHTML = '<p style="color:red">Error cargando pronóstico.</p>';
        }
    };

    if (!navigator.geolocation) {
        renderForecast(-2.9001, -79.0059, true);
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            renderForecast(position.coords.latitude, position.coords.longitude);
        },
        (error) => {
            console.warn("Forecast Geo Error", error);
            renderForecast(-2.9001, -79.0059, true);
        },
        { timeout: 10000 }
    );
}
