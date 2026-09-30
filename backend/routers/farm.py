"""
routers/farm.py – Farm-level aggregation endpoints.

Endpoints
---------
GET  /farm-weather          – Current weather at the configured farm location
GET  /agriculture-analysis  – Combined sensor + weather + rule-based analysis
POST /ai/analyze-field      – Structured AI-ready field analysis (deterministic now, LLM later)
POST /ai/chat               – Conversational farm assistant (stub — LLM not yet connected)
GET  /farm-config           – Public farm configuration (no secrets)

Design principles
-----------------
* Weather data is cached to avoid hammering Open-Meteo on every dashboard poll.
* The sensor and weather data sources are always clearly labelled in responses.
* Rule-based analysis is never described as "ML" or "AI prediction".
* If weather or sensor data is unavailable the endpoint still returns a partial
  response — it never returns an error just because one data source is offline.
"""

from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.config import settings
from backend.database import get_db
from backend.models import SensorReading
from backend.analysis import build_field_analysis
from backend.ai.ai_service import FieldAnalysisInput, analyze_field
from backend.geo import calculate_polygon_area_and_perimeter
from backend.ml.predict import (
    predict_soil_moisture,
    predict_water_stress,
    predict_field_condition,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Farm Monitoring"])

# ── Constants ──────────────────────────────────────────────────────────────────

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
WEATHER_TIMEOUT = 10.0   # seconds

# ── Weather cache ──────────────────────────────────────────────────────────────
# Simple in-process cache keyed by (lat, lon) rounded to 4 decimal places.
# In production replace with Redis or a proper caching layer.

_weather_cache: Dict[str, Dict[str, Any]] = {}


def _cache_key(lat: float, lon: float) -> str:
    return f"{lat:.4f},{lon:.4f}"


def _get_cached_weather(lat: float, lon: float) -> Optional[Dict[str, Any]]:
    """Return cached weather data if still fresh, otherwise None."""
    key   = _cache_key(lat, lon)
    entry = _weather_cache.get(key)
    if entry is None:
        return None
    age = time.time() - entry["fetched_at"]
    if age > settings.WEATHER_CACHE_TTL_SECONDS:
        logger.debug("Weather cache expired for key=%s (age=%.0fs)", key, age)
        return None
    logger.debug("Weather cache hit for key=%s (age=%.0fs)", key, age)
    return entry["data"]


def _set_cached_weather(lat: float, lon: float, data: Dict[str, Any]) -> None:
    key = _cache_key(lat, lon)
    _weather_cache[key] = {"data": data, "fetched_at": time.time()}


# ── Open-Meteo fetch helper ────────────────────────────────────────────────────

async def _fetch_open_meteo(lat: float, lon: float) -> Optional[Dict[str, Any]]:
    """
    Fetch current + 7-day daily forecast from Open-Meteo.

    Returns None (never raises) so callers can degrade gracefully.
    The dashboard must continue to show sensor data even if weather is unavailable.
    """
    params = {
        "latitude":  lat,
        "longitude": lon,
        "current": [
            "temperature_2m",
            "relative_humidity_2m",
            "precipitation",
            "wind_speed_10m",
            "weather_code",
            "precipitation_probability",
        ],
        "daily": [
            "temperature_2m_max",
            "temperature_2m_min",
            "precipitation_sum",
            "precipitation_probability_max",
            "wind_speed_10m_max",
        ],
        "forecast_days": 7,
        "timezone": "auto",
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(OPEN_METEO_URL, params=params, timeout=WEATHER_TIMEOUT)
            resp.raise_for_status()
            return resp.json()
    except httpx.TimeoutException:
        logger.warning("Open-Meteo request timed out for lat=%s lon=%s", lat, lon)
        return None
    except httpx.HTTPStatusError as exc:
        logger.warning("Open-Meteo HTTP error %s for lat=%s lon=%s", exc.response.status_code, lat, lon)
        return None
    except Exception as exc:
        logger.warning("Open-Meteo fetch failed: %s", exc)
        return None


def _parse_weather(raw: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Extract the fields we need from an Open-Meteo response into a flat dict.

    Returns a dict with all fields set to None if raw is None (offline).
    The `available` flag tells callers whether the weather service responded.
    """
    if raw is None:
        return {
            "available":          False,
            "temperature":        None,
            "humidity":           None,
            "precipitation":      None,
            "wind_speed":         None,
            "rain_probability":   None,
            "temperature_max":    [],
            "temperature_min":    [],
            "rainfall":           [],
            "rain_probability_daily": [],
            "fetched_at":         None,
        }

    cur  = raw.get("current", {})
    daily = raw.get("daily", {})

    return {
        "available":          True,
        "temperature":        cur.get("temperature_2m"),
        "humidity":           cur.get("relative_humidity_2m"),
        "precipitation":      cur.get("precipitation"),
        "wind_speed":         cur.get("wind_speed_10m"),
        "rain_probability":   cur.get("precipitation_probability"),
        "temperature_max":    daily.get("temperature_2m_max", []),
        "temperature_min":    daily.get("temperature_2m_min", []),
        "rainfall":           daily.get("precipitation_sum", []),
        "rain_probability_daily": daily.get("precipitation_probability_max", []),
        "fetched_at":         datetime.now(timezone.utc).isoformat(),
    }


# ── GET /farm-weather ──────────────────────────────────────────────────────────

@router.get(
    "/farm-weather",
    summary="Current weather at the configured farm location",
    description=(
        "Returns weather data for the farm configured in FARM_LATITUDE / FARM_LONGITUDE. "
        "Response is cached for WEATHER_CACHE_TTL_SECONDS (default 10 min) to avoid "
        "unnecessary requests to Open-Meteo. "
        "Source: Open-Meteo — NOT an AI prediction. "
        "Compare with /weather to query arbitrary coordinates."
    ),
)
async def get_farm_weather() -> Dict[str, Any]:
    """Return cached or freshly fetched weather for the configured farm location."""
    lat = settings.FARM_LATITUDE
    lon = settings.FARM_LONGITUDE

    # Try cache first
    cached = _get_cached_weather(lat, lon)
    if cached is not None:
        weather = cached
    else:
        raw     = await _fetch_open_meteo(lat, lon)
        weather = _parse_weather(raw)
        if weather["available"]:
            _set_cached_weather(lat, lon, weather)

    return {
        "farm":     settings.FARM_NAME,
        "location": {"latitude": lat, "longitude": lon},
        "current_weather": {
            "temperature":      weather["temperature"],
            "humidity":         weather["humidity"],
            "precipitation":    weather["precipitation"],
            "wind_speed":       weather["wind_speed"],
            "rain_probability": weather["rain_probability"],
        },
        "daily_forecast": {
            "temperature_max":       weather["temperature_max"],
            "temperature_min":       weather["temperature_min"],
            "rainfall":              weather["rainfall"],
            "rain_probability":      weather["rain_probability_daily"],
        },
        "weather_source":   "Open-Meteo (https://open-meteo.com/)",
        "weather_available": weather["available"],
        "cache_ttl_seconds": settings.WEATHER_CACHE_TTL_SECONDS,
        "fetched_at":        weather["fetched_at"],
        "note": (
            "Weather data is from Open-Meteo, not from Google Maps or Google Earth. "
            "Forecasts are from the weather service model, not from this system's ML or AI."
        ),
    }


# ── GET /agriculture-analysis ──────────────────────────────────────────────────

@router.get(
    "/agriculture-analysis",
    summary="Combined sensor + weather + rule-based field analysis",
    description=(
        "Combines the latest ESP32 sensor reading with current weather data "
        "to produce a structured agricultural field assessment. "
        "Analysis is rule-based — it is NOT machine learning or AI prediction. "
        "Thresholds are configurable via environment variables."
    ),
)
async def get_agriculture_analysis(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Combine latest sensor data with farm weather and return a structured analysis.
    """
    # ── Fetch latest sensor reading ────────────────────────────────────────
    reading: Optional[SensorReading] = (
        db.query(SensorReading)
        .order_by(SensorReading.timestamp.desc())
        .first()
    )

    sensor_dict: Optional[Dict[str, Any]] = None
    if reading:
        sensor_dict = {
            "soil_status":        reading.soil_status,
            "temperature":        reading.temperature,
            "humidity":           reading.humidity,
            "co2":                reading.co2,
            "last_updated":       reading.timestamp.isoformat() if reading.timestamp else None,
        }

    # ── Fetch weather (cached) ────────────────────────────────────────────
    lat = settings.FARM_LATITUDE
    lon = settings.FARM_LONGITUDE

    cached = _get_cached_weather(lat, lon)
    if cached is not None:
        weather_parsed = cached
    else:
        raw            = await _fetch_open_meteo(lat, lon)
        weather_parsed = _parse_weather(raw)
        if weather_parsed["available"]:
            _set_cached_weather(lat, lon, weather_parsed)

    weather_for_analysis: Optional[Dict[str, Any]] = None
    if weather_parsed["available"]:
        weather_for_analysis = {
            "temperature":       weather_parsed["temperature"],
            "humidity":          weather_parsed["humidity"],
            "rain_probability":  weather_parsed["rain_probability"],
            "rainfall":          weather_parsed["precipitation"],
            "wind_speed":        weather_parsed["wind_speed"],
        }

    # ── Build analysis ────────────────────────────────────────────────────
    analysis = build_field_analysis(
        sensor=sensor_dict,
        weather=weather_for_analysis,
    )

    # ── Append data source metadata ───────────────────────────────────────
    analysis["sensor_available"]  = reading is not None
    analysis["weather_available"] = weather_parsed["available"]
    analysis["generated_at"]      = datetime.now(timezone.utc).isoformat()

    return analysis


# ── POST /ai/analyze-field ─────────────────────────────────────────────────────

class FieldAnalysisRequest(BaseModel):
    """Input payload for POST /ai/analyze-field."""
    field:      Optional[Dict[str, Any]] = Field(None, description="Field metadata")
    sensor:     Optional[Dict[str, Any]] = Field(None, description="Sensor readings")
    weather:    Optional[Dict[str, Any]] = Field(None, description="Weather data")
    historical: Optional[Dict[str, Any]] = Field(None, description="Historical trends")
    satellite:  Optional[Dict[str, Any]] = Field(None, description="NDVI / satellite data")


class FieldAnalysisResponse(BaseModel):
    summary:            str
    observations:       List[str] = []
    possible_risks:     List[str] = []
    recommended_checks: List[str] = []
    source:             str
    note:               Optional[str] = None


@router.post(
    "/ai/analyze-field",
    response_model=FieldAnalysisResponse,
    summary="AI-ready structured field analysis",
    description=(
        "Accepts a structured field-data payload and returns a validated analysis. "
        "Currently produces deterministic rule-based output. "
        "Future versions will send validated data to a Generative AI model (e.g. Gemini). "
        "The LLM will NOT be permitted to invent measurements — it uses only supplied data."
    ),
)
async def ai_analyze_field(request: FieldAnalysisRequest) -> FieldAnalysisResponse:
    """
    Validate input and run field analysis.
    Currently deterministic; LLM integration is planned.
    """
    field = request.field or {
        "id":        settings.FARM_NAME,
        "name":      settings.FARM_NAME,
        "latitude":  settings.FARM_LATITUDE,
        "longitude": settings.FARM_LONGITUDE,
    }

    inp    = FieldAnalysisInput(
        field=field,
        sensor=request.sensor,
        weather=request.weather,
        historical=request.historical,
        satellite=request.satellite,
    )
    result = await analyze_field(inp)

    return FieldAnalysisResponse(**result)


# ── POST /ai/chat ──────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str = Field(..., description="Farmer's question in natural language")
    context: Optional[Dict[str, Any]] = Field(
        None,
        description=(
            "Optional current field context (sensor readings, weather, etc.). "
            "The AI will base its answer on this data — it will not invent readings."
        ),
    )


class ChatResponse(BaseModel):
    reply:  str
    source: str
    note:   Optional[str] = None


@router.post(
    "/ai/chat",
    response_model=ChatResponse,
    summary="Conversational farm assistant (stub — LLM not yet connected)",
    description=(
        "Future farmer chatbot endpoint. "
        "The LLM will answer based on current sensor data, weather, and historical data. "
        "It will not invent measurements. "
        "Currently returns a static placeholder response."
    ),
)
async def ai_chat(request: ChatRequest) -> ChatResponse:
    """
    Conversational assistant stub.
    Replace this with a real LLM call when the API key is configured.
    """
    # Acknowledge the user's question so the endpoint is already wired up
    logger.info("AI chat request received: %s", request.message[:80])

    return ChatResponse(
        reply=(
            f"You asked: \"{request.message}\"\n\n"
            "The conversational AI assistant is not yet connected. "
            "It will use your current sensor data, weather information, and "
            "historical field data to answer questions like: "
            "'How is my field today?', 'Is irrigation needed?', "
            "'Why has soil moisture decreased?', or 'What does the weather forecast say?'\n\n"
            "Connect a Generative AI API key (see GEMINI_API_KEY in .env.example) "
            "to enable this feature."
        ),
        source="stub",
        note=(
            "This endpoint is a placeholder. "
            "POST /ai/analyze-field is the current structured analysis endpoint. "
            "When the LLM is connected it will receive ONLY validated field data "
            "and must not invent sensor readings."
        ),
    )


# ── GET /farm-config ───────────────────────────────────────────────────────────

@router.get(
    "/farm-config",
    summary="Public farm configuration (no secrets)",
    description=(
        "Returns the farm name, location, and boundary polygon for the frontend map. "
        "Does NOT expose API keys, database credentials, or other secrets."
    ),
)
def get_farm_config() -> Dict[str, Any]:
    """Return farm configuration safe for frontend consumption."""
    boundary: List[Dict[str, float]] = []
    if settings.FARM_BOUNDARY_JSON.strip():
        try:
            boundary = json.loads(settings.FARM_BOUNDARY_JSON)
        except (json.JSONDecodeError, ValueError) as exc:
            logger.warning("FARM_BOUNDARY_JSON is invalid JSON: %s", exc)

    geo_metrics = calculate_polygon_area_and_perimeter(boundary) if boundary else {}

    return {
        "farm_name":    settings.FARM_NAME,
        "latitude":     settings.FARM_LATITUDE,
        "longitude":    settings.FARM_LONGITUDE,
        "boundary":     boundary,
        "map_zoom":     17,
        "area_sq_meters": geo_metrics.get("area_sq_meters", 0.0),
        "area_hectares":  geo_metrics.get("area_hectares", 0.0),
        "area_acres":     geo_metrics.get("area_acres", 0.0),
        "perimeter_m":    geo_metrics.get("perimeter_m", 0.0),
        "center_lat":     geo_metrics.get("center_lat", settings.FARM_LATITUDE),
        "center_lon":     geo_metrics.get("center_lon", settings.FARM_LONGITUDE),
        "note": (
            "Set FARM_LATITUDE, FARM_LONGITUDE, FARM_NAME, and FARM_BOUNDARY_JSON "
            "in your .env file. Obtain exact coordinates from Google Maps or Google Earth."
        ),
    }


# ── GET /ml/status & POST /ml/predict ──────────────────────────────────────────

@router.get(
    "/ml/status",
    summary="Machine Learning Pipeline & Model Status",
    description="Returns current status of ML models, training dataset collection, and feature vectors.",
)
def get_ml_status(db: Session = Depends(get_db)) -> Dict[str, Any]:
    sensor_count = db.query(SensorReading).count()
    return {
        "pipeline_status": "data_collection_phase",
        "collected_sensor_samples": sensor_count,
        "minimum_samples_required": 500,
        "models": {
            "soil_moisture_24h": {
                "status": "training_dataset_gathering",
                "ready": False,
                "algorithm": "GradientBoostingRegressor / Random Forest",
                "features": ["soil_status", "temperature", "humidity", "rain_probability", "co2", "hour_of_day"],
            },
            "water_stress_index": {
                "status": "awaiting_gee_and_ml_weights",
                "ready": False,
                "algorithm": "LightGBM / XGBoost",
                "features": ["soil_moisture", "temperature", "vapor_pressure_deficit", "ndvi_gee"],
            },
            "field_condition_classifier": {
                "status": "rule_based_fallback_active",
                "ready": False,
                "algorithm": "Multi-class Classification (Optimal, Moderate, Stressed, Critical)",
                "features": ["combined_telemetry_vector"],
            }
        },
        "gee_integration": {
            "satellite_sources": ["Sentinel-2 Multispectral", "Landsat 8/9 OLI"],
            "indices_prepared": ["NDVI", "EVI", "SAVI", "NDWI"],
            "ready": False,
            "note": "Awaiting Google Earth Engine service account credentials in GEE_SERVICE_ACCOUNT_KEY"
        }
    }


@router.post(
    "/ml/predict",
    summary="Run ML predictions (with transparent fallback/stubs)",
    description="Invokes the ML prediction interfaces defined in backend/ml/predict.py.",
)
async def post_ml_predict(
    request: Optional[Dict[str, Any]] = None,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    # Fetch latest sensor reading
    reading: Optional[SensorReading] = (
        db.query(SensorReading)
        .order_by(SensorReading.timestamp.desc())
        .first()
    )
    sensor_dict = {
        "soil_status": reading.soil_status if reading else "UNKNOWN",
        "temperature": reading.temperature if reading else None,
        "humidity": reading.humidity if reading else None,
        "co2": reading.co2 if reading else None,
    } if reading else None

    # Fetch weather
    lat = settings.FARM_LATITUDE
    lon = settings.FARM_LONGITUDE
    cached = _get_cached_weather(lat, lon)
    weather_dict = cached if cached else _parse_weather(await _fetch_open_meteo(lat, lon))

    soil_pred = predict_soil_moisture(sensor_dict, weather_dict)
    stress_pred = predict_water_stress(sensor_dict, weather_dict)
    cond_pred = predict_field_condition(sensor_dict, weather_dict)

    return {
        "soil_moisture_prediction": soil_pred,
        "water_stress_prediction": stress_pred,
        "field_condition_prediction": cond_pred,
        "features_supplied": {
            "sensor": sensor_dict,
            "weather": {
                "temperature": weather_dict.get("temperature"),
                "humidity": weather_dict.get("humidity"),
                "rain_probability": weather_dict.get("rain_probability"),
            }
        },
        "source": "backend.ml.predict",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

