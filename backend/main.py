from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import torch
import torch.nn as nn
from torchvision import models, transforms
from PIL import Image
import io
from pydantic import BaseModel

# ============
# 1. Definir Arquitectura (ResNet18 Modificado)
# ============
# ============
# 1. Definir Arquitectura (ResNet50 - Wrapper Class)
# ============
# ============
# 1. Definir Arquitectura (Exacta al Entrenamiento)
# ============
class PotatoBlightDetector(nn.Module):
    """
    Modelo ResNet optimizado para detección de Tizón Tardío
    Diseñado para minimizar Falsos Negativos (crítico en aplicaciones médicas)
    """
    def __init__(self, model_name='resnet50', pretrained=False, dropout=0.5):
        super().__init__()
        
        # Seleccionar arquitectura base
        # Nota: Usamos pretrained=False (weights=None) porque cargaremos nuestros propios pesos
        if model_name == 'resnet18':
            self.backbone = models.resnet18(weights=None)
            num_features = 512
        elif model_name == 'resnet34':
            self.backbone = models.resnet34(weights=None)
            num_features = 512
        elif model_name == 'resnet50':
            self.backbone = models.resnet50(weights=None)
            num_features = 2048
        elif model_name == 'resnet101':
            self.backbone = models.resnet101(weights=None)
            num_features = 2048
        else:
            raise ValueError(f"Modelo no soportado: {model_name}")
        
        # Reemplazar la última capa FC por una cabeza personalizada
        # Arquitectura optimizada para clasificación binaria
        self.backbone.fc = nn.Sequential(
            nn.Dropout(dropout),
            nn.Linear(num_features, 512),
            nn.ReLU(inplace=True),
            nn.BatchNorm1d(512),
            nn.Dropout(dropout / 2),
            nn.Linear(512, 256),
            nn.ReLU(inplace=True),
            nn.BatchNorm1d(256),
            nn.Dropout(dropout / 3),
            nn.Linear(256, 1)  # Salida binaria (logit)
        )
        
    def forward(self, x):
        return self.backbone(x)

# Global model variable
model = None

# ============
# 2. Lifespan (Carga de Modelo)
# ============
@asynccontextmanager
async def lifespan(app: FastAPI):
    global model
    try:
        # Instanciar el modelo con la configuración exacta del entrenamiento
        model = PotatoBlightDetector(model_name='resnet50', pretrained=False, dropout=0.5)
        
        checkpoint = torch.load("../potato_blight_cnn.pth", map_location="cpu", weights_only=False)
        
        if isinstance(checkpoint, dict) and 'model_state_dict' in checkpoint:
            state_dict = checkpoint['model_state_dict']
        else:
            state_dict = checkpoint
            
        # Cargar estado.
        model.load_state_dict(state_dict)
            
        model.eval()
        print("Modelo ResNet50 cargado exitosamente.")
    except Exception as e:
        print(f"Error cargando el modelo: {e}")
        import traceback
        traceback.print_exc()
        model = None
    yield
    # Clean up resources if needed
    model = None

app = FastAPI(lifespan=lifespan)

# Permitir acceso desde frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============
# 3. Preprocesamiento
# ============
# Config del checkpoint decía IMG_SIZE: 224
# Ajuste: Usamos Resize((224, 224)) directo (Squish) en lugar de Crop.
# Esto suele suavizar las predicciones y evita perder bordes importantes.
transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
])

# ============
# 4. Sistema DSS
# ============
def decision_support(prob):
    # Heurística para modelo binario
    # Asumimos: 0 = Sano, 1 = Enfermo (Tizón) basado en nombres comunes de datasets
    
    # Zona de Incertidumbre (40% - 60%)
    if 0.4 <= prob <= 0.6:
        return {
            "diagnostico": "Incierto / No Concluyente",
            "riesgo": "Moderado",
            "recomendacion": "El modelo no está seguro (Confianza baja). Por favor tome otra foto con mejor iluminación o enfoque."
        }
    
    if prob < 0.4:
        confidence = (1 - prob) * 100
        return {
            "diagnostico": "Sano",
            "riesgo": "Bajo",
            "recomendacion": f"La hoja parece sana (Confianza: {confidence:.1f}%). Monitorear nuevamente en 48–72 horas."
        }
    else:
        confidence = prob * 100
        # No podemos distinguir Temprano vs Tardío con un modelo binario con certeza sin más info
        # Devolvemos un diagnóstico general de Tizón
        return {
            "diagnostico": "Posible Tizón (Enfermo)",
            "riesgo": "Alto",
            "recomendacion": f"Se detectaron signos de enfermedad (Confianza: {confidence:.1f}%). Inspeccionar si es Tizón Temprano o Tardío y aplicar fungicida."
        }

# ============
# 5. Modelos Pydantic
# ============
class AnalysisResponse(BaseModel):
    diagnostico: str
    riesgo: str
    recomendacion: str
    probabilidad_enfermedad: float

class WeatherData(BaseModel):
    temperature: float
    humidity: float
    raining: bool
    hours: float

class RiskResponse(BaseModel):
    mensaje: str
    color: str

# ============
# 6. Endpoints
# ============
@app.post("/analizar", response_model=AnalysisResponse)
async def analizar(file: UploadFile = File(...)):
    if model is None:
        return {
            "diagnostico": "Error", 
            "riesgo": "N/A", 
            "recomendacion": "El modelo no se pudo cargar en el servidor.",
            "probabilidad_enfermedad": 0.0
        }

    img_bytes = await file.read()
    img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    
    tensor = transform(img).unsqueeze(0)

    with torch.no_grad():
        output = model(tensor)
        # Salida es logits lineales -> Sigmoid para probabilidad
        prob = torch.sigmoid(output).item()
        print(f"DEBUG: Predicción Raw (Logits): {output.item():.4f}, Probabilidad: {prob:.4f}")
    
    dss = decision_support(prob)

    return {
        "diagnostico": dss["diagnostico"],
        "riesgo": dss["riesgo"],
        "recomendacion": dss["recomendacion"],
        "probabilidad_enfermedad": prob
    }

def calculate_risk_level(data: WeatherData):
    T = data.temperature
    H = data.humidity
    P = data.raining
    Horas = data.hours
    
    mensaje = ""
    color = ""
    
    # Nivel 1: Filtro Térmico
    if T < 3:
        mensaje = "RIESGO NULO (Helada): El hongo no sobrevive."
        color = "blue"
    elif T > 29:
        mensaje = "RIESGO BAJO: Demasiado calor para el patógeno."
        color = "green"
    else:
        # Nivel 2: Condición de Agua
        mojado = P or (H >= 90)

        if mojado:
            if 10 <= T <= 25:
                if Horas >= 4:
                    mensaje = "🚨 RIESGO MUY ALTO: Condiciones epidémicas."
                    color = "red"
                else:
                    mensaje = "RIESGO ALTO (Latente): Falta tiempo de exposición."
                    color = "orange"
            else:
                mensaje = "RIESGO MEDIO: Hay agua, pero T° no es óptima."
                color = "#f1c40f" # Amarillo oscuro
        else:
            # Nivel 3: Condición Seca
            if 80 <= H < 90 and 10 <= T <= 25:
                mensaje = "RIESGO MEDIO: Esporulación posible."
                color = "#f1c40f"
            else:
                mensaje = "RIESGO BAJO: Ambiente seco."
                color = "green"
                
    return {
        "mensaje": mensaje,
        "color": color
    }

@app.post("/calcular-riesgo", response_model=RiskResponse)
async def calcular_riesgo(data: WeatherData):
    result = calculate_risk_level(data)
    return result
