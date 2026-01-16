## Configuración Inicial (Solo la primera vez)

Si estás corriendo esto en una **nueva PC**, primero necesitas instalar las dependencias:

1.  Abre una terminal en la carpeta del proyecto.
2.  Crea un entorno virtual:
    ```powershell
    python -m venv venv
    ```
3.  Activa el entorno:
    ```powershell
    .\venv\Scripts\activate
    ```
4.  Instala las librerías necesarias:
    ```powershell
    pip install -r requirements.txt
    ```

---

## Ejecución Diaria

Para ejecutar el sistema completo, necesitas abrir **dos terminales**: una para el "cerebro" (Backend) y otra para la "cara" (Frontend).

### Terminal 1: Backend (API)
Esta terminal se encarga de procesar las imágenes y los cálculos de riesgo.

1. Abre una terminal (PowerShell o CMD).
2. Navega a la carpeta del proyecto.
3. Activa el entorno virtual:
    ```powershell
    .\venv\Scripts\activate
    ```
4. Navega a la carpeta `backend` e inicia el servidor:
    ```powershell
    cd backend
    uvicorn main:app --reload --port 8000
    ```
    *Si ves "Application startup complete", todo está bien.*

### Terminal 2: Frontend (Interfaz Web)
Esta terminal sirve la página web para que puedas verla en tu navegador.

1. Abre **otra** terminal nueva.
2. Navega a la carpeta del frontend:
   ```powershell
   cd frontend
   ```
3. Inicia el servidor web simple de Python:
   ```powershell
   python -m http.server 8081
   ```
   *Nota: No necesitas activar el entorno virtual para esto, pero no hace daño si lo haces.*

## Acceso
Una vez que ambas terminales estén corriendo:
- **Ve a:** [http://127.0.0.1:8081](http://127.0.0.1:8081) para usar la aplicación.

---

## 📦 Guía de Limpieza (Transferir a otra PC)

Si vas a copiar este proyecto a otra computadora (por USB, Drive, ZIP, etc.), **NO COPIES** (o borra antes de copiar) las siguientes carpetas. Son muy pesadas, específicas de tu PC y se regeneran solas:

| Carpeta / Archivo | ¿Por qué borrarlo? |
| :--- | :--- |
| `venv/`, `backend/venv38/` | Es el entorno virtual específico de tu PC. NO sirve en otra. |
| `__pycache__/` | Archivos temporales de Python. |
| `.vscode/`, `.idea/` | Configuraciones de tu editor. |

**Lo único que debes copiar es:**
- Todo el código fuente.
- El archivo `requirements.txt`.
- El modelo `potato_blight_cnn.pth`.
