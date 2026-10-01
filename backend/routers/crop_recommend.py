"""
routers/crop_recommend.py – AI-powered crop recommendation engine.

This endpoint pulls the latest IoT sensor data (ESP32) from the database,
merges it with live weather data (Open-Meteo), and runs:

  1. ML crop ranking  – scikit-learn RandomForest from crop_recommender.py
  2. Gemini AI reasoning  – if GEMINI_API_KEY is set, an LLM generates a rich,
     grounded crop advisory. Otherwise falls back to deterministic reasoning.

Endpoints
---------
GET  /crop-recommendation          – Latest sensor reading → ranked recommendations
POST /crop-recommendation/manual   – User-supplied values → ranked recommendations
GET  /crop-recommendation/history  – Last N IoT-driven recommendations (cached)
"""

from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.config import settings
from backend.database import get_db
from backend.models import SensorReading
from backend.crop_recommender import predict_ranked_crops, CROP_METADATA

logger = logging.getLogger("agro_in.crop_recommend")
router = APIRouter(tags=["Crop Recommendation"])

# ── Weather fetch (lightweight copy — avoids circular imports) ─────────────────

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
_wx_cache: Dict[str, Any] = {}


async def _get_weather(lat: float, lon: float) -> Dict[str, Any]:
    key = f"{lat:.4f},{lon:.4f}"
    entry = _wx_cache.get(key)
    if entry and (time.time() - entry["ts"]) < settings.WEATHER_CACHE_TTL_SECONDS:
        return entry["data"]

    params = {
        "latitude": lat, "longitude": lon,
        "current": ["temperature_2m", "relative_humidity_2m",
                    "precipitation", "precipitation_probability"],
        "daily": ["precipitation_sum", "precipitation_probability_max"],
        "forecast_days": 7, "timezone": "auto",
    }
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(OPEN_METEO_URL, params=params, timeout=8.0)
            r.raise_for_status()
            raw = r.json()
    except Exception as exc:
        logger.warning("Weather fetch failed: %s", exc)
        return {"available": False}

    cur = raw.get("current", {})
    daily = raw.get("daily", {})
    data = {
        "available": True,
        "temperature": cur.get("temperature_2m"),
        "humidity": cur.get("relative_humidity_2m"),
        "precipitation": cur.get("precipitation", 0.0),
        "rain_probability": cur.get("precipitation_probability"),
        "rainfall_7d_avg": (
            sum(daily.get("precipitation_sum", [])) / len(daily.get("precipitation_sum", [1]))
        ) if daily.get("precipitation_sum") else None,
    }
    _wx_cache[key] = {"data": data, "ts": time.time()}
    return data


# ── Gemini AI enrichment ───────────────────────────────────────────────────────

CROP_ADVISORY_PROMPT = """\
You are an expert agronomist for AgroIn India. Based on the provided real IoT sensor
and weather data, give a concise, practical crop recommendation advisory.

Sensor & Weather Data:
{sensor_block}

ML Model Top Crop Picks: {top_crops}

Your task:
1. Confirm or nuance the ML ranking with agronomic reasoning based ONLY on the data.
2. Mention specific soil/climate factors that support each top pick.
3. Flag any critical soil deficiencies or weather risks the farmer must address first.
4. Be practical (mention Indian market seasonality where relevant).
5. Keep it under 200 words. Do NOT invent missing data.

Respond in plain text (no markdown, no headers).
"""


async def _get_gemini_reasoning(
    sensor_ctx: str,
    top_crops: List[str],
) -> Optional[str]:
    """Call Gemini API for enriched crop advisory text. Returns None on failure."""
    api_key = settings.GEMINI_API_KEY
    if not api_key:
        return None

    prompt = CROP_ADVISORY_PROMPT.format(
        sensor_block=sensor_ctx,
        top_crops=", ".join(top_crops),
    )
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{settings.GEMINI_MODEL}:generateContent?key={api_key}"
    )
    payload = {"contents": [{"parts": [{"text": prompt}]}]}

    try:
        async with httpx.AsyncClient() as client:
            r = await client.post(url, json=payload, timeout=20.0)
            r.raise_for_status()
            data = r.json()
            text = (
                data.get("candidates", [{}])[0]
                .get("content", {})
                .get("parts", [{}])[0]
                .get("text", "")
                .strip()
            )
            return text if text else None
    except Exception as exc:
        logger.warning("Gemini crop advisory failed: %s", exc)
        return None


# ── Sensor context builder ─────────────────────────────────────────────────────

def _build_sensor_context(reading: Optional[SensorReading], weather: Dict[str, Any]) -> str:
    lines = []
    if reading:
        lines.append(f"- Soil Status: {reading.soil_status}")
        if reading.temperature is not None:
            lines.append(f"- Temperature (ESP32): {reading.temperature:.1f} °C")
        if reading.humidity is not None:
            lines.append(f"- Humidity (ESP32): {reading.humidity:.1f} %")
        if reading.co2 is not None:
            lines.append(f"- CO₂: {reading.co2:.0f} ppm")
        if reading.nitrogen is not None:
            lines.append(f"- Nitrogen (N): {reading.nitrogen:.1f} mg/kg")
        if reading.phosphorus is not None:
            lines.append(f"- Phosphorus (P): {reading.phosphorus:.1f} mg/kg")
        if reading.potassium is not None:
            lines.append(f"- Potassium (K): {reading.potassium:.1f} mg/kg")
    else:
        lines.append("- No IoT sensor reading available")

    if weather.get("available"):
        if weather.get("temperature") is not None:
            lines.append(f"- Ambient Temperature (weather): {weather['temperature']:.1f} °C")
        if weather.get("humidity") is not None:
            lines.append(f"- Ambient Humidity (weather): {weather['humidity']:.0f} %")
        if weather.get("rain_probability") is not None:
            lines.append(f"- Rain Probability: {weather['rain_probability']:.0f} %")
        if weather.get("rainfall_7d_avg") is not None:
            lines.append(f"- 7-day Avg Rainfall: {weather['rainfall_7d_avg']:.1f} mm/day")
    else:
        lines.append("- Weather data unavailable")

    return "\n".join(lines)


# ── Deterministic advisory fallback ───────────────────────────────────────────

def _deterministic_advisory(
    reading: Optional[SensorReading],
    weather: Dict[str, Any],
    recommendations: List[Dict[str, Any]],
) -> str:
    parts = []
    top = recommendations[0] if recommendations else None
    if top:
        parts.append(
            f"Based on your current IoT sensor readings, {top['crop_name']} is the highest-ranked "
            f"crop with a {top['score_pct']:.0f}% suitability score."
        )

    if reading:
        if reading.soil_status == "DRY":
            parts.append(
                "Your soil is currently DRY — ensure adequate irrigation before sowing."
            )
        elif reading.soil_status == "WET":
            parts.append(
                "Soil moisture is high — consider drainage before planting moisture-sensitive crops."
            )

    if weather.get("available"):
        rp = weather.get("rain_probability")
        temp = weather.get("temperature")
        if rp is not None and rp > 60:
            parts.append(
                f"Rain probability is high ({rp:.0f}%) — plan sowing around forecast precipitation."
            )
        if temp is not None:
            if temp > 35:
                parts.append(
                    f"High ambient temperature ({temp:.1f}°C) — choose heat-tolerant varieties."
                )
            elif temp < 15:
                parts.append(
                    f"Low temperature ({temp:.1f}°C) — favour cold-hardy crops for this season."
                )

    if reading and reading.nitrogen is not None and reading.nitrogen < 60:
        parts.append(
            "Nitrogen levels are low — apply urea or FYM before sowing for better yield."
        )

    return " ".join(parts) if parts else (
        "ML model recommendation generated from empirical crop profile data. "
        "Connect sensors for personalised agronomic reasoning."
    )


# ── Response schema ────────────────────────────────────────────────────────────

class CropRecommendItem(BaseModel):
    rank: int
    crop_key: str
    crop_name: str
    icon: str
    category: str
    score_pct: float
    suitability: str
    badge_class: str
    reason: str


class SensorSnapshot(BaseModel):
    reading_id: Optional[int] = None
    soil_status: Optional[str] = None
    temperature: Optional[float] = None
    humidity: Optional[float] = None
    co2: Optional[float] = None
    nitrogen: Optional[float] = None
    phosphorus: Optional[float] = None
    potassium: Optional[float] = None
    last_updated: Optional[str] = None


class WeatherSnapshot(BaseModel):
    available: bool = False
    temperature: Optional[float] = None
    humidity: Optional[float] = None
    rain_probability: Optional[float] = None
    rainfall_7d_avg: Optional[float] = None


class CropRecommendationResponse(BaseModel):
    generated_at: str
    farm_name: str
    sensor: SensorSnapshot
    weather: WeatherSnapshot
    recommendations: List[CropRecommendItem]
    ai_advisory: str
    ai_source: str          # "gemini" | "rule-based"
    data_quality: str       # "full" | "partial" | "defaults-only"


class ManualInputRequest(BaseModel):
    nitrogen:    Optional[float] = Field(None, ge=0, le=300, description="N (mg/kg)")
    phosphorus:  Optional[float] = Field(None, ge=0, le=300, description="P (mg/kg)")
    potassium:   Optional[float] = Field(None, ge=0, le=300, description="K (mg/kg)")
    ph:          Optional[float] = Field(None, ge=3.0, le=10.0)
    temperature: Optional[float] = Field(None, ge=-10, le=55)
    humidity:    Optional[float] = Field(None, ge=0, le=100)
    rainfall:    Optional[float] = Field(None, ge=0, le=500, description="Expected rainfall mm/month")
    soil_status: Optional[str]  = Field(None, description="WET or DRY")
    location_name: Optional[str] = Field(None, description="Optional region label")
    top_k:       int = Field(5, ge=1, le=22)


# ── GET /crop-recommendation ───────────────────────────────────────────────────

@router.get(
    "/crop-recommendation",
    response_model=CropRecommendationResponse,
    summary="AI Crop Recommendation from IoT Sensor Data",
    description=(
        "Fetches the latest ESP32 sensor reading, merges it with real-time weather, "
        "and runs the ML crop ranking model (RandomForest trained on Kaggle Crop Recommendation dataset). "
        "If GEMINI_API_KEY is configured, Gemini provides an enriched agronomic advisory; "
        "otherwise a deterministic rule-based advisory is returned."
    ),
)
async def get_crop_recommendation(
    top_k: int = Query(5, ge=1, le=22, description="Number of top crops to return"),
    db: Session = Depends(get_db),
) -> CropRecommendationResponse:
    # 1. Latest sensor reading
    reading: Optional[SensorReading] = (
        db.query(SensorReading)
        .order_by(SensorReading.timestamp.desc())
        .first()
    )

    # 2. Weather
    weather = await _get_weather(settings.FARM_LATITUDE, settings.FARM_LONGITUDE)

    # 3. ML prediction
    n = reading.nitrogen   if reading else None
    p = reading.phosphorus if reading else None
    k = reading.potassium  if reading else None
    temp = (
        reading.temperature
        if reading and reading.temperature is not None
        else weather.get("temperature")
    )
    hum = (
        reading.humidity
        if reading and reading.humidity is not None
        else weather.get("humidity")
    )
    # Estimate monthly rainfall from 7-day avg
    rainfall_est = (
        (weather.get("rainfall_7d_avg") or 0) * 30
        if weather.get("rainfall_7d_avg") is not None
        else None
    )

    recommendations = predict_ranked_crops(
        nitrogen=n, phosphorus=p, potassium=k,
        temperature=temp, humidity=hum, rainfall=rainfall_est,
        top_k=top_k,
    )

    # 4. Determine data quality
    has_npk = any(x is not None for x in [n, p, k])
    has_env = (temp is not None) or (hum is not None)
    if has_npk and has_env:
        data_quality = "full"
    elif has_npk or has_env:
        data_quality = "partial"
    else:
        data_quality = "defaults-only"

    # 5. AI advisory
    sensor_ctx = _build_sensor_context(reading, weather)
    top_names = [r["crop_name"] for r in recommendations[:3]]

    advisory_text = await _get_gemini_reasoning(sensor_ctx, top_names)
    ai_source = "gemini" if advisory_text else "rule-based"
    if not advisory_text:
        advisory_text = _deterministic_advisory(reading, weather, recommendations)

    # 6. Build sensor snapshot
    sensor_snap = SensorSnapshot(
        reading_id=reading.id if reading else None,
        soil_status=reading.soil_status if reading else None,
        temperature=reading.temperature if reading else None,
        humidity=reading.humidity if reading else None,
        co2=reading.co2 if reading else None,
        nitrogen=n, phosphorus=p, potassium=k,
        last_updated=reading.timestamp.isoformat() if reading else None,
    )

    weather_snap = WeatherSnapshot(
        available=weather.get("available", False),
        temperature=weather.get("temperature"),
        humidity=weather.get("humidity"),
        rain_probability=weather.get("rain_probability"),
        rainfall_7d_avg=weather.get("rainfall_7d_avg"),
    )

    return CropRecommendationResponse(
        generated_at=datetime.now(timezone.utc).isoformat(),
        farm_name=settings.FARM_NAME,
        sensor=sensor_snap,
        weather=weather_snap,
        recommendations=[CropRecommendItem(**r) for r in recommendations],
        ai_advisory=advisory_text,
        ai_source=ai_source,
        data_quality=data_quality,
    )


# ── POST /crop-recommendation/manual ─────────────────────────────────────────

@router.post(
    "/crop-recommendation/manual",
    response_model=CropRecommendationResponse,
    summary="Manual Crop Recommendation (user-supplied values)",
    description=(
        "Accepts manually entered soil and climate values, "
        "runs the ML model, and optionally enriches with Gemini AI advisory."
    ),
)
async def get_crop_recommendation_manual(
    body: ManualInputRequest,
) -> CropRecommendationResponse:
    recommendations = predict_ranked_crops(
        nitrogen=body.nitrogen,
        phosphorus=body.phosphorus,
        potassium=body.potassium,
        ph=body.ph,
        temperature=body.temperature,
        humidity=body.humidity,
        rainfall=body.rainfall,
        top_k=body.top_k,
    )

    # Build a pseudo-reading for advisory generation
    class _FakeReading:
        soil_status = body.soil_status or "DRY"
        temperature = body.temperature
        humidity    = body.humidity
        co2         = None
        nitrogen    = body.nitrogen
        phosphorus  = body.phosphorus
        potassium   = body.potassium

    weather_snap = WeatherSnapshot(
        available=False,
        temperature=body.temperature,
        humidity=body.humidity,
        rain_probability=None,
        rainfall_7d_avg=(body.rainfall / 30.0) if body.rainfall else None,
    )
    weather_dict: Dict[str, Any] = {
        "available": False,
        "temperature": body.temperature,
        "humidity": body.humidity,
    }

    sensor_ctx = _build_sensor_context(_FakeReading(), weather_dict)
    top_names = [r["crop_name"] for r in recommendations[:3]]

    advisory_text = await _get_gemini_reasoning(sensor_ctx, top_names)
    ai_source = "gemini" if advisory_text else "rule-based"
    if not advisory_text:
        advisory_text = _deterministic_advisory(_FakeReading(), weather_dict, recommendations)

    sensor_snap = SensorSnapshot(
        soil_status=body.soil_status,
        temperature=body.temperature,
        humidity=body.humidity,
        nitrogen=body.nitrogen,
        phosphorus=body.phosphorus,
        potassium=body.potassium,
    )

    has_npk = any(x is not None for x in [body.nitrogen, body.phosphorus, body.potassium])
    has_env = (body.temperature is not None) or (body.humidity is not None)
    data_quality = "full" if (has_npk and has_env) else ("partial" if (has_npk or has_env) else "defaults-only")

    return CropRecommendationResponse(
        generated_at=datetime.now(timezone.utc).isoformat(),
        farm_name=body.location_name or settings.FARM_NAME,
        sensor=sensor_snap,
        weather=weather_snap,
        recommendations=[CropRecommendItem(**r) for r in recommendations],
        ai_advisory=advisory_text,
        ai_source=ai_source,
        data_quality=data_quality,
    )
