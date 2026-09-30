"""
analysis.py – Rule-based agricultural condition analysis engine.

Combines ESP32 sensor readings with weather-service data to produce a
structured field-condition assessment.

Design principles
-----------------
* No hardcoded real credentials or coordinates.
* Thresholds are fully configurable via backend/config.py (and therefore .env).
* All thresholds have documented meaning — they are engineering defaults, NOT
  universal agronomic constants.  Adjust for crop type, soil type, and climate.
* This module produces deterministic rule-based output.
  It is NOT a machine-learning model.  Do not call it AI or ML.
* The output structure is designed to be forward-compatible with future ML and
  Generative AI layers that will replace / augment the rule-based logic.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from backend.config import settings

logger = logging.getLogger(__name__)


# ── Soil moisture status labels ────────────────────────────────────────────────

SOIL_STATUS_GOOD     = "GOOD SOIL MOISTURE"
SOIL_STATUS_MODERATE = "MODERATE SOIL MOISTURE"
SOIL_STATUS_LOW      = "LOW SOIL MOISTURE"
SOIL_STATUS_UNKNOWN  = "SOIL MOISTURE UNKNOWN"

# ── Weather status labels ──────────────────────────────────────────────────────

WEATHER_GOOD  = "FAVOURABLE WEATHER"
WEATHER_DRY   = "DRY CONDITIONS"
WEATHER_WET   = "WET CONDITIONS"
WEATHER_NONE  = "WEATHER DATA UNAVAILABLE"


# ── Soil moisture assessment ───────────────────────────────────────────────────

def assess_soil_moisture(
    soil_status_digital: Optional[str],     # "WET" / "DRY" from capacitive sensor
    rain_probability: Optional[float],      # 0–100 %
) -> Dict[str, str]:
    """
    Produce a soil-moisture assessment and recommendation.

    Parameters
    ----------
    soil_status_digital : "WET" | "DRY" | None
        Digital reading from the capacitive/resistive soil-moisture sensor.
    rain_probability : float | None
        Current rain probability (%) from weather service.

    Returns
    -------
    dict with keys:
        soil_moisture_status   – one of the SOIL_STATUS_* constants
        recommendation         – human-readable action string
    """
    if soil_status_digital is None:
        return {
            "soil_moisture_status": SOIL_STATUS_UNKNOWN,
            "recommendation": "Sensor data is unavailable. Verify the ESP32 connection.",
        }

    is_wet          = soil_status_digital.upper() == "WET"
    low_rain        = (rain_probability is None) or (rain_probability < settings.RAIN_PROBABILITY_LOW_THRESHOLD)

    if is_wet:
        status = SOIL_STATUS_GOOD
        rec    = (
            "Soil moisture appears adequate. "
            "Continue monitoring and avoid over-irrigation."
        )
    else:
        # DRY reading
        if low_rain:
            status = SOIL_STATUS_LOW
            rec    = (
                "Soil appears dry and rainfall probability is low. "
                "Inspect the field for irrigation requirements. "
                "Thresholds can be adjusted in configuration for your specific crop and soil type."
            )
        else:
            status = SOIL_STATUS_MODERATE
            rec    = (
                "Soil appears dry but rainfall is expected. "
                "Monitor soil moisture after rainfall before scheduling irrigation."
            )

    return {"soil_moisture_status": status, "recommendation": rec}


# ── Weather condition assessment ───────────────────────────────────────────────

def assess_weather(
    rain_probability: Optional[float],
    precipitation_mm: Optional[float],
    weather_temperature: Optional[float],
) -> str:
    """
    Return a simple weather-condition label for the dashboard.

    This is NOT a forecast — it summarises the current weather-service data.
    """
    if rain_probability is None and precipitation_mm is None and weather_temperature is None:
        return WEATHER_NONE

    if rain_probability is not None and rain_probability >= 70:
        return WEATHER_WET
    if (rain_probability is None or rain_probability < settings.RAIN_PROBABILITY_LOW_THRESHOLD) \
            and (precipitation_mm is None or precipitation_mm < 0.5):
        return WEATHER_DRY
    return WEATHER_GOOD


# ── Combined field analysis ────────────────────────────────────────────────────

def build_field_analysis(
    *,
    sensor: Optional[Dict[str, Any]],
    weather: Optional[Dict[str, Any]],
    historical_trend: Optional[Dict[str, Any]] = None,
    ndvi: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Combine all available data sources into a structured analysis object.

    This is the primary output function for GET /agriculture-analysis.
    It is also the building block for the future AI input payload
    (POST /ai/analyze-field).

    Parameters
    ----------
    sensor : dict | None
        Latest ESP32 sensor packet (keys: soil_status, co2, temperature, humidity).
    weather : dict | None
        Current weather data from weather service
        (keys: temperature, humidity, rain_probability, rainfall, wind_speed).
    historical_trend : dict | None
        Computed historical trends from the database (optional, used by future ML).
    ndvi : dict | None
        Satellite NDVI data (placeholder until GEE integration is complete).

    Returns
    -------
    Fully structured analysis dict, compatible with the AI-ready data contract.
    """
    # ── Extract sensor values ──────────────────────────────────────────────
    soil_status_digital: Optional[str]   = None
    sensor_temperature:  Optional[float] = None
    sensor_humidity:     Optional[float] = None
    sensor_co2:          Optional[float] = None

    if sensor:
        soil_status_digital = sensor.get("soil_status")
        sensor_temperature  = sensor.get("temperature")
        sensor_humidity     = sensor.get("humidity")
        sensor_co2          = sensor.get("co2")

    # ── Extract weather values ─────────────────────────────────────────────
    weather_temperature: Optional[float] = None
    weather_humidity:    Optional[float] = None
    rain_probability:    Optional[float] = None
    rainfall_mm:         Optional[float] = None
    wind_speed:          Optional[float] = None
    weather_available:   bool            = False

    if weather:
        weather_temperature = weather.get("temperature")
        weather_humidity    = weather.get("humidity")
        rain_probability    = weather.get("rain_probability")
        rainfall_mm         = weather.get("rainfall")
        wind_speed          = weather.get("wind_speed")
        weather_available   = True

    # ── Rule-based assessments ────────────────────────────────────────────
    soil_assessment  = assess_soil_moisture(soil_status_digital, rain_probability)
    weather_status   = assess_weather(rain_probability, rainfall_mm, weather_temperature)

    # ── Overall status logic ───────────────────────────────────────────────
    sm_status = soil_assessment["soil_moisture_status"]
    if sm_status == SOIL_STATUS_GOOD and weather_status in (WEATHER_GOOD, WEATHER_DRY):
        overall = "NORMAL"
    elif sm_status == SOIL_STATUS_LOW and weather_status == WEATHER_DRY:
        overall = "ATTENTION REQUIRED"
    elif sm_status == SOIL_STATUS_UNKNOWN:
        overall = "SENSOR DATA MISSING"
    elif not weather_available:
        overall = "PARTIAL DATA (weather unavailable)"
    else:
        overall = "MONITORING"

    # ── AI-ready summary (deterministic text — not from LLM) ──────────────
    # This will be replaced by a Generative AI call when that layer is ready.
    summary = _build_deterministic_summary(
        soil_status_digital=soil_status_digital,
        rain_probability=rain_probability,
        sensor_temperature=sensor_temperature,
        weather_available=weather_available,
    )

    return {
        # ── Field configuration ─────────────────────────────────────────
        "field": {
            "id":        settings.FARM_NAME,
            "name":      settings.FARM_NAME,
            "latitude":  settings.FARM_LATITUDE,
            "longitude": settings.FARM_LONGITUDE,
        },

        # ── Sensor data (labelled as ground sensor — not weather service) ─
        "sensor_data": {
            "soil_status":         soil_status_digital,
            "temperature_celsius": sensor_temperature,    # ground sensor
            "humidity_percent":    sensor_humidity,       # ground sensor
            "co2_ppm":             sensor_co2,
            "source":              "ESP32 ground sensor",
        },

        # ── Weather data (labelled as weather service — not sensor) ───────
        "weather": {
            "temperature_celsius": weather_temperature,  # weather service
            "humidity_percent":    weather_humidity,     # weather service
            "rain_probability_pct": rain_probability,
            "rainfall_mm":         rainfall_mm,
            "wind_speed_kmh":      wind_speed,
            "source":              "Open-Meteo weather service",
            "available":           weather_available,
        },

        # ── Historical trends (populated when enough data exists) ─────────
        "historical": historical_trend or {
            "soil_moisture_trend": None,     # future: "stable" / "declining" / "rising"
            "temperature_trend":   None,
            "note": "Historical trend analysis requires accumulated sensor data.",
        },

        # ── NDVI placeholder (until Google Earth Engine integration) ──────
        "satellite": ndvi or {
            "ndvi_current":  None,
            "ndvi_previous": None,
            "ndvi_change":   None,
            "note": (
                "Satellite NDVI data is not yet available. "
                "Google Earth Engine integration is planned for a future release."
            ),
        },

        # ── Rule-based analysis results ───────────────────────────────────
        "analysis": {
            "soil_moisture_status": sm_status,
            "weather_status":       weather_status,
            "overall_status":       overall,
            "recommendation":       soil_assessment["recommendation"],
            "method":               "rule-based",    # NOT ML, NOT AI
            "thresholds_used": {
                "rain_probability_low_pct":  settings.RAIN_PROBABILITY_LOW_THRESHOLD,
                "note": (
                    "Thresholds are configurable engineering defaults. "
                    "Adjust RAIN_PROBABILITY_LOW_THRESHOLD in .env for your "
                    "specific crop, soil, and climate conditions."
                ),
            },
        },

        # ── AI-ready summary (deterministic until LLM layer added) ────────
        "ai_summary": {
            "text":   summary,
            "source": "deterministic-rule-based",  # will change to "gemini" / "openai" etc.
        },
    }


# ── Deterministic summary builder ──────────────────────────────────────────────

def _build_deterministic_summary(
    *,
    soil_status_digital: Optional[str],
    rain_probability: Optional[float],
    sensor_temperature: Optional[float],
    weather_available: bool,
) -> str:
    """
    Build a human-readable field summary from rule-based logic.

    This placeholder will be replaced by a Generative AI call when the
    AI layer (POST /ai/analyze-field) is implemented.
    The text is intentionally conservative and factual.
    """
    parts: List[str] = []

    # Soil moisture statement
    if soil_status_digital is None:
        parts.append("Sensor data is currently unavailable.")
    elif soil_status_digital.upper() == "WET":
        parts.append("The soil moisture sensor reports WET conditions.")
    else:
        parts.append("The soil moisture sensor reports DRY conditions.")

    # Rain probability statement
    if not weather_available:
        parts.append("Weather service data is temporarily unavailable.")
    elif rain_probability is not None:
        if rain_probability >= 70:
            parts.append(f"Rain probability from the weather service is high ({rain_probability:.0f}%).")
        elif rain_probability < settings.RAIN_PROBABILITY_LOW_THRESHOLD:
            parts.append(
                f"The weather service indicates a low probability of rain ({rain_probability:.0f}%). "
                "Soil moisture should be monitored closely."
            )
        else:
            parts.append(
                f"Rain probability is moderate ({rain_probability:.0f}%) according to the weather service."
            )

    # Temperature note (sensor vs weather)
    if sensor_temperature is not None:
        parts.append(
            f"Ground sensor temperature is {sensor_temperature:.1f}°C. "
            "Compare with the weather-service temperature to identify local micro-climate differences."
        )

    # Future note
    parts.append(
        "This summary is generated by rule-based logic. "
        "A Generative AI explanation layer is planned for a future release."
    )

    return " ".join(parts)
