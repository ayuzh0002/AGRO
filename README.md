# 🌾 AgroIn – AI-Based Agricultural Land Monitoring System

An end-to-end agricultural intelligence platform connecting on-field IoT hardware (ESP32 sensor node & rover telemetry), micro-climate weather forecasting (Open-Meteo), high-resolution Google Satellite maps with field boundary polygon visualization, automated agronomic condition analysis, and preparation pipelines for Machine Learning predictions and Generative AI advisors.

---

## 🏛️ System Architecture

```text
[ESP32 Hardware Node]               [Open-Meteo Weather API]
  (Soil Status, Temp, Humidity)       (Forecasts, Rain Prob, Wind)
           │                                       │
           ▼ (HTTP POST /sensor-data)              ▼ (HTTP GET /farm-weather)
┌────────────────────────────────────────────────────────────────────────┐
│                        FastAPI Backend Engine                          │
│                                                                        │
│  • routers/farm.py          → Aggregates sensor telemetry & weather    │
│  • analysis.py              → Rule-based agricultural analysis engine  │
│  • geo.py                   → Haversine & polygon area/perimeter math  │
│  • backend/ml/predict.py    → ML prediction interfaces (stubs/ready)   │
│  • backend/ai/ai_service.py → Generative AI structured grounding layer │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼ JSON APIs (CORS Enabled)
┌────────────────────────────────────────────────────────────────────────┐
│                        React + Vite Frontend                           │
│                                                                        │
│  • /field-monitoring  → Flagship Land Monitoring Dashboard             │
│  • Google Satellite   → Field polygon overlay (with hybrid fallback)   │
│  • Real-time Gauges   → On-field ESP32 vs. Ambient Weather comparison  │
│  • Agronomic Engine   → Irrigation Decision Matrix & Crop Risk Alerts  │
│  • AI & ML Panels     → Generative AI Agronomist & ML model readiness  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Key Features Implemented

1. **Google Satellite Map & Field Boundary Visualization**:
   - High-resolution Google Satellite/Hybrid map layer centered at your farm coordinates.
   - Vector polygon drawing (`google.maps.Polygon`) with calculated land area (Hectares & Acres), perimeter (Meters), and centroid.
   - Fallback high-resolution interactive satellite viewer if `GOOGLE_MAPS_API_KEY` is not yet configured.

2. **Weather API Integration (Open-Meteo)**:
   - Automated weather fetching with in-memory caching (`WEATHER_CACHE_TTL_SECONDS`).
   - Precipitation probability, wind speeds, temperature, humidity, and 7-day forecast.
   - Clear distinction between on-field hardware telemetry and external meteorological model forecasts.

3. **Combined ESP32 Hardware + Weather Telemetry**:
   - Live polling of `/sensor-data` from the ESP32 node.
   - Side-by-side comparison between ESP32 micro-climate readings and regional weather forecasts.

4. **Agricultural Condition Analysis & Irrigation Decision Matrix**:
   - Rule-based agronomic evaluation combining soil status and incoming rain probability:
     - *Dry Soil + Low Rain Probability* ➔ High Irrigation Urgency.
     - *Dry Soil + High Rain Probability (>50%)* ➔ Postpone Irrigation (Conserve Water).
     - *Wet Soil* ➔ Hold Irrigation (Avoid Waterlogging/Hypoxia).
   - Thermal stress and fungal disease risk calculation based on humidity and temperature.

5. **Preparation for Machine Learning (ML)**:
   - Stubs and interfaces in `backend/ml/predict.py`:
     - 24-hour Soil Moisture forecast (`predict_soil_moisture`).
     - Field Water Stress Index (`predict_water_stress`).
     - Field Condition Classifier (`predict_field_condition`).
   - Endpoints: `GET /ml/status` and `POST /ml/predict`.

6. **Preparation for Generative AI (LLM / Gemini)**:
   - Grounded conversational assistant (`POST /ai/chat` & `POST /ai/analyze-field`).
   - Prompts pass real, validated telemetry into the AI engine so it cannot invent fake measurements.

7. **Preparation for Google Earth Engine (GEE)**:
   - Multispectral indices blueprint: NDVI, NDWI, EVI formulas.
   - Ready to ingest Sentinel-2 and Landsat imagery once `GEE_SERVICE_ACCOUNT_KEY` is provided.

---

## 🛠️ Quickstart & Setup

### 1. Backend Setup

```bash
cd backend

# Create and activate virtual environment
python -m venv venv
venv\Scripts\activate      # Windows
# source venv/bin/activate  # Linux/macOS

# Install dependencies
pip install -r requirements.txt

# Create .env from template
copy ..\.env.example .env

# Run FastAPI server
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

FastAPI Documentation available at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

### 2. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start Vite dev server
npm run dev
```

Frontend application available at `http://localhost:5173`.

---

## 📡 ESP32 Sensor Node Integration

The ESP32 microcontroller (`esp32/sensor_node.ino`) connects to local Wi-Fi and pushes sensor telemetry directly to the FastAPI server:

```http
POST /sensor-data HTTP/1.1
Host: <YOUR_BACKEND_IP>:8000
Content-Type: application/json

{
  "soil_status": "WET",
  "temperature": 27.5,
  "humidity": 68.2,
  "co2": 420.0
}
```

The frontend polls `GET /sensor-data` or `GET /agriculture-analysis` from FastAPI — the browser never needs direct access to the ESP32.

---

## 🗺️ Configuring Your Field Boundary & Coordinates

In your `.env` file, specify your farm's location and corner coordinates:

```env
FARM_NAME=FIELD_01
FARM_LATITUDE=21.1458
FARM_LONGITUDE=79.0882
FARM_BOUNDARY_JSON=[{"lat":21.1465,"lng":79.0875},{"lat":21.1472,"lng":79.0890},{"lat":21.1450,"lng":79.0898},{"lat":21.1445,"lng":79.0880}]
GOOGLE_MAPS_API_KEY=YOUR_API_KEY_HERE
```
