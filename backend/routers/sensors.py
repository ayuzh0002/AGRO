"""
routers/sensors.py – ESP32 IoT sensor data ingestion and retrieval.

Endpoints:
    POST /sensor-data   — ESP32 pushes sensor readings (soil_status, co2, NPK…)
    GET  /sensor-data   — React frontend polls for the latest reading
    GET  /sensor-data/history — Historical readings for charts (paginated)
"""

from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import SensorReading
from backend.schemas import SensorDataIn, SensorDataOut, SensorReadingHistoryItem

router = APIRouter(tags=["IoT Sensors"])


# ── POST /sensor-data ──────────────────────────────────────────────────────

@router.post(
    "/sensor-data",
    response_model=SensorDataOut,
    summary="Receive sensor data from ESP32",
    description=(
        "Called by the ESP32 via HTTP POST. "
        "Stores the reading in the database and returns the saved values. "
        "Only `soil_status` is required; all other fields are optional."
    ),
)
def receive_sensor_data(
    payload: SensorDataIn,
    db: Session = Depends(get_db),
) -> SensorDataOut:
    """Persist an ESP32 sensor packet and echo it back."""
    reading = SensorReading(
        soil_status = payload.soil_status,
        co2         = payload.co2,
        nitrogen    = payload.nitrogen,
        phosphorus  = payload.phosphorus,
        potassium   = payload.potassium,
        timestamp   = datetime.now(timezone.utc),
    )
    db.add(reading)
    db.commit()
    db.refresh(reading)

    return SensorDataOut(
        reading_id   = reading.id,
        soil_status  = reading.soil_status,
        co2          = reading.co2,
        nitrogen     = reading.nitrogen,
        phosphorus   = reading.phosphorus,
        potassium    = reading.potassium,
        last_updated = reading.timestamp,
    )


# ── GET /sensor-data ───────────────────────────────────────────────────────

@router.get(
    "/sensor-data",
    response_model=SensorDataOut,
    summary="Get the latest sensor reading",
    description=(
        "Returns the most recent ESP32 reading. "
        "Called by the React frontend every second (polling). "
        "Returns an empty object if no data has been received yet."
    ),
)
def get_latest_sensor_data(db: Session = Depends(get_db)) -> SensorDataOut:
    """Return the most recent row in sensor_readings, or an empty payload."""
    reading: Optional[SensorReading] = (
        db.query(SensorReading)
        .order_by(SensorReading.timestamp.desc())
        .first()
    )

    if reading is None:
        return SensorDataOut()   # all None — React shows "Waiting for sensor data…"

    return SensorDataOut(
        reading_id   = reading.id,
        soil_status  = reading.soil_status,
        co2          = reading.co2,
        nitrogen     = reading.nitrogen,
        phosphorus   = reading.phosphorus,
        potassium    = reading.potassium,
        last_updated = reading.timestamp,
    )


# ── GET /sensor-data/history ───────────────────────────────────────────────

@router.get(
    "/sensor-data/history",
    response_model=List[SensorReadingHistoryItem],
    summary="Historical sensor readings (for charts)",
    description=(
        "Returns up to `limit` readings ordered newest-first. "
        "Use `skip` for pagination. "
        "Intended for the React charting components."
    ),
)
def get_sensor_history(
    skip:  int = Query(0,   ge=0),
    limit: int = Query(100, ge=1, le=1000),
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
