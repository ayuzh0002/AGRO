"""
ai/ai_service.py – Placeholder AI service layer.

Architecture
-----------
Sensor data + Weather + Historical data + Satellite data
    ↓
Data processing (this module validates and structures input)
    ↓
Machine Learning (future: predict_soil_moisture, etc.)
    ↓
Generative AI (future: LLM produces human-readable explanation)
    ↓
Response to frontend

IMPORTANT: This module currently produces DETERMINISTIC rule-based output.
No LLM is called here yet.  The structure is forward-compatible with Gemini,
OpenAI, or any other LLM API when the key is added.

When integrating a real LLM:
1. Add GEMINI_API_KEY (or OPENAI_API_KEY) to .env and config.py.
2. Replace _generate_deterministic_response() with an actual LLM call.
3. Always pass VALIDATED data to the LLM — never raw ESP32 bytes.
4. Use the system prompt constant SYSTEM_PROMPT_FIELD_ANALYSIS to anchor the LLM.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# ── System prompt (used when real LLM is connected) ────────────────────────────
SYSTEM_PROMPT_FIELD_ANALYSIS = """
You are an agricultural field monitoring assistant.

You will receive structured data about a farm field including:
- Ground sensor readings (ESP32)
- Weather service data (Open-Meteo)
- Historical sensor trends
- Satellite NDVI data (when available)

Your task:
1. Summarise the current field condition clearly and factually.
2. Identify observations based ONLY on the provided data.
3. Flag possible risks for investigation — do NOT make unsupported diagnoses.
4. Suggest specific checks or actions based on the data.

STRICT RULES:
- Use ONLY the data supplied in the request. Do NOT invent measurements.
- If data is missing or null, say it is unavailable. Do NOT estimate missing values.
- Do NOT claim that Google Earth predicts weather.
- Do NOT present rule-based thresholds as universal agronomic truth.
- Do NOT call rule-based output "machine learning" or "AI prediction".
- A low NDVI may have many causes (crop stage, water stress, harvest, cloud cover, soil).
  Flag it for investigation; do NOT automatically diagnose disease.
"""


# ── Analysis input schema (validated before reaching the AI layer) ─────────────

class FieldAnalysisInput:
    """
    Structured input for the AI analysis endpoint.

    All fields are optional so the system degrades gracefully when
    sensors or weather data are temporarily unavailable.
    """

    def __init__(
        self,
        field: Dict[str, Any],
        sensor: Optional[Dict[str, Any]] = None,
        weather: Optional[Dict[str, Any]] = None,
        historical: Optional[Dict[str, Any]] = None,
        satellite: Optional[Dict[str, Any]] = None,
    ):
        self.field      = field
        self.sensor     = sensor or {}
        self.weather    = weather or {}
        self.historical = historical or {}
        self.satellite  = satellite or {}

    def to_prompt_context(self) -> str:
        """
        Serialise the validated input into a structured context string
        suitable for inclusion in an LLM prompt.
        """
        lines: List[str] = ["=== FIELD DATA ==="]

        lines.append(f"Field: {self.field.get('name', 'Unknown')} "
                     f"(lat={self.field.get('latitude')}, lon={self.field.get('longitude')})")

        if self.sensor:
            lines.append("\n--- Ground Sensor (ESP32) ---")
            lines.append(f"Soil Status: {self.sensor.get('soil_status', 'unavailable')}")
            lines.append(f"Sensor Temperature: {self.sensor.get('temperature_celsius', 'unavailable')} °C")
            lines.append(f"Sensor Humidity: {self.sensor.get('humidity_percent', 'unavailable')} %")
            lines.append(f"CO₂: {self.sensor.get('co2_ppm', 'unavailable')} ppm")
        else:
            lines.append("\n--- Ground Sensor: DATA UNAVAILABLE ---")

        if self.weather and self.weather.get("available"):
            lines.append("\n--- Weather Service (Open-Meteo) ---")
            lines.append(f"Weather Temperature: {self.weather.get('temperature_celsius', 'unavailable')} °C")
            lines.append(f"Weather Humidity: {self.weather.get('humidity_percent', 'unavailable')} %")
            lines.append(f"Rain Probability: {self.weather.get('rain_probability_pct', 'unavailable')} %")
            lines.append(f"Rainfall: {self.weather.get('rainfall_mm', 'unavailable')} mm")
            lines.append(f"Wind Speed: {self.weather.get('wind_speed_kmh', 'unavailable')} km/h")
        else:
            lines.append("\n--- Weather Service: DATA UNAVAILABLE ---")

        if self.historical:
            lines.append("\n--- Historical Trends ---")
            lines.append(f"Soil Moisture Trend: {self.historical.get('soil_moisture_trend', 'not yet available')}")
            lines.append(f"Temperature Trend: {self.historical.get('temperature_trend', 'not yet available')}")

        if self.satellite:
            ndvi_current  = self.satellite.get("ndvi_current")
            ndvi_previous = self.satellite.get("ndvi_previous")
            ndvi_change   = self.satellite.get("ndvi_change")
            if ndvi_current is not None:
                lines.append("\n--- Satellite NDVI ---")
                lines.append(f"Current NDVI: {ndvi_current}")
                lines.append(f"Previous NDVI: {ndvi_previous}")
                lines.append(f"NDVI Change: {ndvi_change}")
                lines.append(
                    "Note: NDVI changes may be caused by crop growth stage, water stress, "
                    "harvest, weather, soil conditions, or imagery quality. "
                    "Flag for investigation — do not diagnose disease automatically."
                )
            else:
                lines.append("\n--- Satellite NDVI: NOT YET AVAILABLE (GEE integration pending) ---")

        return "\n".join(lines)


# ── AI analysis function ────────────────────────────────────────────────────────

async def analyze_field(inp: FieldAnalysisInput) -> Dict[str, Any]:
    """
    Perform field analysis and return a structured response.

    Currently uses deterministic rule-based logic.
    Replace the body of this function with an actual LLM call when ready.

    Future integration example (Gemini):
    ------------------------------------
        import google.generativeai as genai
        genai.configure(api_key=settings.GEMINI_API_KEY)
        model = genai.GenerativeModel("gemini-2.5-flash")
        prompt = SYSTEM_PROMPT_FIELD_ANALYSIS + "\\n" + inp.to_prompt_context()
        response = model.generate_content(prompt)
        # Parse and validate LLM output before returning it.
    """
    logger.info("AI field analysis requested for field: %s", inp.field.get("name"))

    # ── Placeholder: deterministic output until LLM is connected ─────────
    return _generate_deterministic_response(inp)


def _generate_deterministic_response(inp: FieldAnalysisInput) -> Dict[str, Any]:
    """
    Produce a structured analysis using deterministic rules.

    This is NOT machine learning. This is NOT a Generative AI response.
    It is a placeholder until the LLM layer is connected.
    """
    observations:  List[str] = []
    possible_risks: List[str] = []
    recommended_checks: List[str] = []

    # ── Soil observations ─────────────────────────────────────────────────
    soil_status = inp.sensor.get("soil_status")
    if soil_status == "WET":
        observations.append("The ground sensor reports WET soil conditions.")
    elif soil_status == "DRY":
        observations.append("The ground sensor reports DRY soil conditions.")
        possible_risks.append("Field may require irrigation if dry spell continues.")
        recommended_checks.append("Inspect soil at multiple field locations to confirm sensor reading.")
    elif not inp.sensor:
        observations.append("Ground sensor data is currently unavailable.")
        recommended_checks.append("Check ESP32 connectivity and Wi-Fi network.")

    # ── Weather observations ──────────────────────────────────────────────
    if inp.weather.get("available"):
        rain_prob = inp.weather.get("rain_probability_pct")
        if rain_prob is not None:
            if rain_prob >= 70:
                observations.append(
                    f"Weather service reports high rain probability ({rain_prob:.0f}%)."
                )
            elif rain_prob < 30:
                observations.append(
                    f"Weather service reports low rain probability ({rain_prob:.0f}%)."
                )
                if soil_status == "DRY":
                    possible_risks.append(
                        "Low rain probability combined with dry sensor reading — monitor for water stress."
                    )
    else:
        observations.append("Weather service data is temporarily unavailable.")
        recommended_checks.append("Retry weather fetch — Open-Meteo may be temporarily unreachable.")

    # ── Temperature comparison ────────────────────────────────────────────
    sensor_temp  = inp.sensor.get("temperature_celsius")
    weather_temp = inp.weather.get("temperature_celsius")
    if sensor_temp is not None and weather_temp is not None:
        diff = abs(sensor_temp - weather_temp)
        if diff > 5:
            observations.append(
                f"Notable difference between ground sensor temperature ({sensor_temp:.1f}°C) "
                f"and weather-service temperature ({weather_temp:.1f}°C). "
                "This may indicate a local micro-climate effect or sensor drift."
            )
            recommended_checks.append("Verify sensor calibration if temperature difference persists.")

    # ── NDVI observations ─────────────────────────────────────────────────
    ndvi_change = inp.satellite.get("ndvi_change")
    if ndvi_change is not None:
        if ndvi_change < -0.1:
            observations.append(
                f"NDVI has decreased by {abs(ndvi_change):.2f} since the last satellite pass."
            )
            possible_risks.append(
                "NDVI decline may indicate water stress, crop growth stage change, "
                "harvest activity, cloud cover artefact, or other environmental factors. "
                "Satellite imagery should be reviewed alongside ground observations."
            )
            recommended_checks.append("Conduct a field inspection to verify NDVI change cause.")

    # ── Build summary ─────────────────────────────────────────────────────
    if not observations:
        summary = (
            "Insufficient data to generate a field summary. "
            "Ensure the ESP32 sensor is connected and the weather service is reachable."
        )
    else:
        summary = " ".join(observations)

    return {
        "summary":           summary,
        "observations":      observations,
        "possible_risks":    possible_risks,
        "recommended_checks": recommended_checks,
        "source":            "deterministic-rule-based",
        "note": (
            "This analysis is produced by rule-based logic. "
            "A Generative AI layer (using Gemini or equivalent) is planned for a future release. "
            "The LLM will receive the same structured data and must not invent measurements."
        ),
    }
