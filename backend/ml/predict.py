"""
ml/predict.py – Placeholder prediction interfaces.

These stubs define the function signatures that FastAPI routes and the
AI service layer will call.  Implement the bodies when sufficient
historical data is available.

How to use
----------
    from backend.ml.predict import predict_soil_moisture

    result = predict_soil_moisture(sensor_data, weather_data, historical_data)
    if result["available"]:
        # Pass to Generative AI for human-readable explanation
        ...
    else:
        # Fall back to rule-based analysis
        ...
"""

from __future__ import annotations

from typing import Any, Dict, Optional


# ── Placeholder prediction functions ───────────────────────────────────────────

def predict_soil_moisture(
    sensor_data: Optional[Dict[str, Any]] = None,
    weather_data: Optional[Dict[str, Any]] = None,
    historical_data: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Predict soil moisture level for the next 24 hours.

    Parameters
    ----------
    sensor_data : dict
        Latest ESP32 sensor readings (soil_status, temperature, humidity, co2).
    weather_data : dict
        Current and forecast weather from Open-Meteo.
    historical_data : dict
        Historical sensor readings aggregated for trend analysis.

    Returns
    -------
    dict with keys:
        available        – False until model is trained
        predicted_value  – Predicted soil moisture % (None until implemented)
        horizon_hours    – Prediction horizon (24)
        confidence       – Model confidence (None until implemented)
        model_type       – Type of model used
        note             – Human-readable status message
    """
    # TODO: Train a model on accumulated data, save with joblib, load here.
    #       Feature vector: [soil_status_encoded, sensor_temp, sensor_humidity,
    #                        weather_temp, rain_probability, rainfall_mm,
    #                        time_of_day, hour_since_last_rain, ...]
    return {
        "available":       False,
        "predicted_value": None,
        "horizon_hours":   24,
        "confidence":      None,
        "model_type":      "not_yet_trained",
        "note": (
            "Soil moisture prediction requires a trained model. "
            "Accumulate at least 7–14 days of sensor data before training. "
            "See ml/train.py for training instructions."
        ),
    }


def predict_water_stress(
    sensor_data: Optional[Dict[str, Any]] = None,
    weather_data: Optional[Dict[str, Any]] = None,
    ndvi_data: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Estimate the probability of water stress in the field.

    Future implementation will combine:
    - Soil moisture sensor reading
    - Weather forecast (rain probability, evapotranspiration proxy)
    - NDVI trend from Google Earth Engine
    """
    return {
        "available":          False,
        "stress_probability": None,
        "model_type":         "not_yet_trained",
        "note": (
            "Water stress prediction requires NDVI data from Google Earth Engine "
            "and a trained classification model. "
            "This feature is planned for a future release."
        ),
    }


def predict_field_condition(
    sensor_data: Optional[Dict[str, Any]] = None,
    weather_data: Optional[Dict[str, Any]] = None,
    historical_data: Optional[Dict[str, Any]] = None,
    ndvi_data: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Classify overall field condition into a risk category.

    Future model will output one of:
        OPTIMAL | MODERATE | STRESSED | CRITICAL

    Until the model is available, the rule-based analysis in analysis.py
    provides a deterministic equivalent.
    """
    return {
        "available":   False,
        "condition":   None,
        "model_type":  "not_yet_trained",
        "note": (
            "Field condition classification requires a trained model with "
            "labelled historical data. "
            "Currently using rule-based analysis as a transparent substitute."
        ),
    }
