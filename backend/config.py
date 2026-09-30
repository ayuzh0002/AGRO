"""
config.py – Application settings loaded from environment variables or a .env file.

Add a .env file at the project root (next to backend/) with your real values.
See .env.example for the full list.  Never commit .env to Git.
"""

from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Database ──────────────────────────────────────────────────────────
    DATABASE_URL: str = "sqlite:///./agro_in.db"
    SQL_ECHO: bool = False                 # set True for verbose SQL logging

    # ── API ───────────────────────────────────────────────────────────────
    APP_TITLE: str = "AgroIn Agricultural Monitoring API"
    APP_VERSION: str = "0.2.0"
    APP_DESCRIPTION: str = (
        "AI-based agricultural land monitoring system. "
        "ESP32 sensors push real-time soil/atmospheric data; "
        "Open-Meteo provides weather forecasts; "
        "Google Maps shows satellite imagery and farm boundaries."
    )
    DEBUG: bool = False

    # ── Upload storage ────────────────────────────────────────────────────
    UPLOAD_DIR: str = "uploads"            # relative to where uvicorn is run

    # ── Disease Diagnosis Backend (Gemini / Local Fine-Tuned Model) ────────
    DIAGNOSIS_BACKEND: str = "gemini"      # "gemini" or "local"
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash"
    LOCAL_MODEL_ENDPOINT: str = "http://localhost:8080/v1/diagnose"
    KVK_CONFIDENCE_THRESHOLD: float = 0.70

    # ── Farm / Field Configuration ────────────────────────────────────────
    # Replace these placeholders with your actual farm coordinates.
    # Obtain precise coordinates from Google Earth / Google Maps.
    # Do NOT hard-code real coordinates here; use .env instead.
    FARM_NAME: str = "FIELD_01"
    FARM_LATITUDE: float = 22.0         # placeholder — set in .env
    FARM_LONGITUDE: float = 88.0        # placeholder — set in .env

    # Farm boundary polygon (JSON string of [{lat, lng}] objects).
    # Leave empty to disable polygon overlay.
    # Example value in .env:
    #   FARM_BOUNDARY_JSON=[{"lat":22.001,"lng":88.001},{"lat":22.002,"lng":88.002},{"lat":22.001,"lng":88.003}]
    FARM_BOUNDARY_JSON: str = ""

    # ── Google Maps ───────────────────────────────────────────────────────
    # Obtain from Google Cloud Console → Maps JavaScript API.
    # Restrict the key to your domain in production.
    GOOGLE_MAPS_API_KEY: str = ""       # set in .env — never commit the real key

    # ── Weather Caching ───────────────────────────────────────────────────
    # How many seconds to cache a weather response before re-fetching.
    # Open-Meteo free tier updates hourly, so 10-30 min is reasonable.
    WEATHER_CACHE_TTL_SECONDS: int = 600   # 10 minutes

    # ── Agricultural Analysis Thresholds ─────────────────────────────────
    # Rule-based thresholds for soil-moisture status.
    # These are configurable engineering defaults — adjust for crop/soil type.
    SOIL_MOISTURE_LOW_THRESHOLD: float = 30.0       # below this → LOW
    SOIL_MOISTURE_MODERATE_THRESHOLD: float = 60.0  # below this → MODERATE; above → GOOD

    # Rain probability threshold (%) below which irrigation may be needed
    RAIN_PROBABILITY_LOW_THRESHOLD: float = 30.0


settings = Settings()

