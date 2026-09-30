"""
routers/sensors.py – ESP32 IoT sensor data ingestion and retrieval.

Sensors supported:
    - DHT11         : temperature (°C) and humidity (%RH)   → temperature, humidity fields
    - MG-811        : analog CO₂ sensor (ppm)               → co2 field
    - Soil Moisture : capacitive/resistive analog sensor     → soil_status ("WET"/"DRY")

Endpoints:
    POST /sensor-data          — ESP32 pushes sensor readings
    GET  /sensor-data          — React frontend polls for the latest reading
    GET  /sensor-data/history  — Historical readings for charts (paginated)
"""

from datetime import datetime, timezone
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from backend.database import engine, get_db
from backend.models import SensorReading
from backend.schemas import SensorDataIn, SensorDataOut, SensorReadingHistoryItem

logger = logging.getLogger(__name__)
router = APIRouter(tags=["IoT Sensors"])


# ── Schema helpers ─────────────────────────────────────────────────────────────

# Sentinel / error values the ESP32 might send when a sensor read fails.
# Any value outside a physically plausible range is treated as a failed read.

def _valid_temperature(v: Optional[float]) -> Optional[float]:
    """Return None if temperature is outside -40 … 85 °C (DHT11 operating range)."""
    if v is None:
        return None
    return v if -40.0 <= v <= 85.0 else None


def _valid_humidity(v: Optional[float]) -> Optional[float]:
    """Return None if relative humidity is outside 0 … 100 %."""
    if v is None:
        return None
    return v if 0.0 <= v <= 100.0 else None


def _valid_co2(v: Optional[float]) -> Optional[float]:
    """Return None if CO₂ reading is outside 350 … 10 000 ppm (MG-811 range)."""
    if v is None:
        return None
    return v if 350.0 <= v <= 10_000.0 else None


# ── Table migration helper ─────────────────────────────────────────────────────

def _ensure_sensor_columns():
    """
    Ensure all sensor columns exist in the sensor_readings SQLite table.
    Safe to call multiple times — only adds missing columns, never drops them.
    """
    required_columns = ["temperature", "humidity", "co2", "nitrogen", "phosphorus", "potassium"]
    column_types = {
        "temperature": "FLOAT",
        "humidity":    "FLOAT",
        "co2":         "FLOAT",
        "nitrogen":    "FLOAT",
        "phosphorus":  "FLOAT",
        "potassium":   "FLOAT",
    }

    try:
        inspector = inspect(engine)
        if "sensor_readings" not in inspector.get_table_names():
            return  # Table not yet created — SQLAlchemy will create it on first run

        existing = {c["name"] for c in inspector.get_columns("sensor_readings")}

        with engine.connect() as conn:
            for col in required_columns:
                if col not in existing:
                    dtype = column_types[col]
                    conn.execute(text(f"ALTER TABLE sensor_readings ADD COLUMN {col} {dtype}"))
                    logger.info("Added missing column '%s' to sensor_readings.", col)
            conn.commit()

    except Exception as exc:
        logger.warning("Could not verify sensor_readings table columns: %s", exc)


# Run column verification on startup / import
_ensure_sensor_columns()


# ── POST /sensor-data ──────────────────────────────────────────────────────────

@router.post(
    "/sensor-data",
    response_model=SensorDataOut,
    summary="Receive sensor data from ESP32",
    description=(
        "Called by the ESP32 node via HTTP POST. "
        "Accepts readings from DHT11 (temperature/humidity), "
        "MG-811 (CO₂ ppm), and a capacitive soil moisture sensor (soil_status). "
        "Out-of-range values are silently replaced with NULL rather than rejected, "
        "so intermittent sensor glitches do not drop the entire packet."
    ),
)
def receive_sensor_data(
    payload: SensorDataIn,
    db: Session = Depends(get_db),
) -> SensorDataOut:
    """Validate, persist, and echo back an ESP32 sensor packet."""

    # Sanitise each field — replace physically impossible values with None
    temperature = _valid_temperature(payload.temperature)
    humidity    = _valid_humidity(payload.humidity)
    co2         = _valid_co2(payload.co2)

    if temperature is None and payload.temperature is not None:
        logger.debug("DHT11 temperature out of range (%.1f) — stored as NULL.", payload.temperature)

    if humidity is None and payload.humidity is not None:
        logger.debug("DHT11 humidity out of range (%.1f) — stored as NULL.", payload.humidity)

    if co2 is None and payload.co2 is not None:
        logger.debug("MG-811 CO₂ out of range (%.1f ppm) — stored as NULL.", payload.co2)

    reading = SensorReading(
        soil_status = payload.soil_status,
        co2         = co2,
        temperature = temperature,
        humidity    = humidity,
        nitrogen    = payload.nitrogen,    # None unless NPK sensor added later
        phosphorus  = payload.phosphorus,
        potassium   = payload.potassium,
        timestamp   = datetime.now(timezone.utc),
    )
    db.add(reading)
    db.commit()
    db.refresh(reading)

    logger.info(
        "Sensor packet stored — id=%d soil=%s temp=%s hum=%s co2=%s",
        reading.id, reading.soil_status, temperature, humidity, co2,
    )

    return SensorDataOut(
        reading_id   = reading.id,
        soil_status  = reading.soil_status,
        co2          = reading.co2,
        temperature  = reading.temperature,
        humidity     = reading.humidity,
        nitrogen     = reading.nitrogen,
        phosphorus   = reading.phosphorus,
        potassium    = reading.potassium,
        last_updated = reading.timestamp,
    )


# ── GET /sensor-data ───────────────────────────────────────────────────────────

@router.get(
    "/sensor-data",
    response_model=SensorDataOut,
    summary="Get the latest sensor reading",
    description=(
        "Returns the most recent ESP32 reading. "
        "Called by the React frontend every few seconds (polling). "
        "If the latest packet has a NULL for temperature, humidity, or CO₂ "
        "(e.g. DHT11 glitch or MG-811 warm-up), the endpoint falls back to the "
        "most recent non-NULL value for that field so the UI cards stay stable. "
        "Returns an empty object if no data has been received yet."
    ),
)
def get_latest_sensor_data(db: Session = Depends(get_db)) -> SensorDataOut:
    """Return the most recent row with per-field fallback for transient read failures."""
    reading: Optional[SensorReading] = (
        db.query(SensorReading)
        .order_by(SensorReading.timestamp.desc())
        .first()
    )

    if reading is None:
        return SensorDataOut()   # All None — React shows "Waiting for sensor data…"

    temperature = reading.temperature
    humidity    = reading.humidity
    co2         = reading.co2

    # Per-field fallback: if latest packet had a failed read, use the last good value.
    # This prevents the UI from flickering to "—" on a single bad DHT11 read.

    if temperature is None:
        row = (
            db.query(SensorReading.temperature)
            .filter(SensorReading.temperature.isnot(None))
            .order_by(SensorReading.timestamp.desc())
            .first()
        )
        if row:
            temperature = row[0]

    if humidity is None:
        row = (
            db.query(SensorReading.humidity)
            .filter(SensorReading.humidity.isnot(None))
            .order_by(SensorReading.timestamp.desc())
            .first()
        )
        if row:
            humidity = row[0]

    if co2 is None:
        row = (
            db.query(SensorReading.co2)
            .filter(SensorReading.co2.isnot(None))
            .order_by(SensorReading.timestamp.desc())
            .first()
        )
        if row:
            co2 = row[0]

    return SensorDataOut(
        reading_id   = reading.id,
        soil_status  = reading.soil_status,
        co2          = co2,
        temperature  = temperature,
        humidity     = humidity,
        nitrogen     = reading.nitrogen,
        phosphorus   = reading.phosphorus,
        potassium    = reading.potassium,
        last_updated = reading.timestamp,
    )


# ── GET /sensor-data/history ───────────────────────────────────────────────────

@router.get(
    "/sensor-data/history",
    response_model=List[SensorReadingHistoryItem],
    summary="Historical sensor readings (for charts)",
    description=(
        "Returns up to `limit` readings ordered newest-first. "
        "Use `skip` for pagination. "
        "Intended for the React charting components (temperature trend, CO₂ trend, etc.)."
    ),
)
def get_sensor_history(
    skip:  int = Query(0,   ge=0,  description="Number of rows to skip (pagination offset)"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of rows to return"),
    db: Session = Depends(get_db),
) -> List[SensorReadingHistoryItem]:
    """Paginated historical sensor readings."""
    rows = (
        db.query(SensorReading)
        .order_by(SensorReading.timestamp.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return rows
