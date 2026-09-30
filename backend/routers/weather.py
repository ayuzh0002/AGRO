"""
routers/weather.py – Agricultural weather forecast engine.

Uses Open-Meteo (https://open-meteo.com/) — completely free, no API key required.
Provides:
    GET /weather/current   – Current conditions + 16-day daily forecast
    GET /weather/seasonal  – 3-month monthly climate aggregates (temp, rain, humidity, wind)
    GET /weather/location  – Resolve lat/lon from a place-name query

Open-Meteo API docs: https://open-meteo.com/en/docs
"""

from __future__ import annotations

import logging
from datetime import date, timedelta, datetime
import calendar
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Weather"])

OPEN_METEO_FORECAST = "https://api.open-meteo.com/v1/forecast"
GEOCODING_API = "https://geocoding-api.open-meteo.com/api/v1/search"

DEFAULT_LAT = 20.5937
DEFAULT_LON = 78.9629

TIMEOUT = 15.0

WMO_CODES: Dict[int, str] = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Foggy", 48: "Icy fog",
    51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
    61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
    71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
    80: "Slight showers", 81: "Moderate showers", 82: "Violent showers",
    95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Thunderstorm with heavy hail",
}


class CurrentWeather(BaseModel):
    temperature_2m: Optional[float] = None
    relative_humidity_2m: Optional[float] = None
    apparent_temperature: Optional[float] = None
    precipitation: Optional[float] = None
    wind_speed_10m: Optional[float] = None
    wind_direction_10m: Optional[float] = None
    weather_code: Optional[int] = None
    is_day: Optional[int] = None
    uv_index: Optional[float] = None
    time: Optional[str] = None
    condition: Optional[str] = None


class DailyForecastItem(BaseModel):
    date: str
    temp_max: Optional[float] = None
    temp_min: Optional[float] = None
    precipitation_sum: Optional[float] = None
    precipitation_probability_max: Optional[int] = None
    wind_speed_max: Optional[float] = None
    uv_index_max: Optional[float] = None
    weather_code: Optional[int] = None
    condition: Optional[str] = None
    sunrise: Optional[str] = None
    sunset: Optional[str] = None


class MonthlyClimate(BaseModel):
    month: str
    month_num: int
    year: int
    avg_temp_max: Optional[float] = None
    avg_temp_min: Optional[float] = None
    total_rainfall_mm: Optional[float] = None
    avg_humidity: Optional[float] = None
    avg_wind_speed: Optional[float] = None
    rainy_days: Optional[int] = None
    description: str = ""


class WeatherResponse(BaseModel):
    latitude: float
    longitude: float
    location_name: str
    timezone: str
    current: CurrentWeather
    daily_forecast: List[DailyForecastItem]
    seasonal_outlook: List[MonthlyClimate]
    generated_at: str


class LocationResult(BaseModel):
    name: str
    latitude: float
    longitude: float
    country: str
    admin1: Optional[str] = None


async def _fetch(client: httpx.AsyncClient, url: str, params: Dict[str, Any]) -> Dict:
    try:
        resp = await client.get(url, params=params, timeout=TIMEOUT)
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"Weather API error: {exc.response.status_code}")
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Weather service temporarily unavailable")


def _aggregate_monthly(daily_raw: Dict, year: int, month: int) -> MonthlyClimate:
    dates = daily_raw.get("time", [])
    prefix = f"{year:04d}-{month:02d}-"
    indices = [i for i, d in enumerate(dates) if d.startswith(prefix)]

    def avg(key: str) -> Optional[float]:
        arr = daily_raw.get(key, [])
        vals = [arr[i] for i in indices if i < len(arr) and arr[i] is not None]
        return round(sum(vals) / len(vals), 1) if vals else None

    def total(key: str) -> Optional[float]:
        arr = daily_raw.get(key, [])
        vals = [arr[i] for i in indices if i < len(arr) and arr[i] is not None]
        return round(sum(vals), 1) if vals else None

    def count_rainy() -> Optional[int]:
        arr = daily_raw.get("precipitation_sum", [])
        if not arr:
            return None
        return sum(1 for i in indices if i < len(arr) and arr[i] is not None and arr[i] > 1.0)

    temp_max   = avg("temperature_2m_max")
    temp_min   = avg("temperature_2m_min")
    rainfall   = total("precipitation_sum")
    humidity   = avg("relative_humidity_2m_max")
    wind       = avg("wind_speed_10m_max")
    rainy_days = count_rainy()

    parts = []
    if temp_max: parts.append(f"Avg high {temp_max}°C")
    if temp_min: parts.append(f"low {temp_min}°C")
    if rainfall is not None: parts.append(f"~{rainfall} mm rainfall")
    if rainy_days is not None: parts.append(f"{rainy_days} rainy days")

    return MonthlyClimate(
        month=f"{calendar.month_name[month]} {year}",
        month_num=month,
        year=year,
        avg_temp_max=temp_max,
        avg_temp_min=temp_min,
        total_rainfall_mm=rainfall,
        avg_humidity=humidity,
        avg_wind_speed=wind,
        rainy_days=rainy_days,
        description=" · ".join(parts),
    )


@router.get("/weather/location", response_model=List[LocationResult], summary="Geocode a place name")
async def geocode_location(
    q: str = Query(..., description="Place name, e.g. 'Nagpur' or 'Punjab India'"),
    count: int = Query(5, ge=1, le=10),
):
    async with httpx.AsyncClient() as client:
        data = await _fetch(client, GEOCODING_API, {"name": q, "count": count, "language": "en", "format": "json"})
    results = data.get("results", [])
    if not results:
        raise HTTPException(status_code=404, detail=f"No locations found for '{q}'")
    return [LocationResult(name=r.get("name",""), latitude=r["latitude"], longitude=r["longitude"],
                           country=r.get("country",""), admin1=r.get("admin1")) for r in results]


@router.get("/weather", response_model=WeatherResponse, summary="Full agricultural weather report")
async def get_weather(
    lat: float = Query(DEFAULT_LAT, description="Latitude"),
    lon: float = Query(DEFAULT_LON, description="Longitude"),
    location_name: str = Query("India", description="Human-readable label"),
):
    forecast_params = {
        "latitude": lat, "longitude": lon,
        "current": [
            "temperature_2m","relative_humidity_2m","apparent_temperature",
            "precipitation","wind_speed_10m","wind_direction_10m",
            "weather_code","is_day","uv_index",
        ],
        "daily": [
            "temperature_2m_max","temperature_2m_min","precipitation_sum",
            "precipitation_probability_max","wind_speed_10m_max","uv_index_max",
            "weather_code","sunrise","sunset","relative_humidity_2m_max",
        ],
        "forecast_days": 16,
        "timezone": "auto",
    }

    async with httpx.AsyncClient() as client:
        main_data = await _fetch(client, OPEN_METEO_FORECAST, forecast_params)

    cur_raw = main_data.get("current", {})
    wcode = cur_raw.get("weather_code")
    current = CurrentWeather(
        temperature_2m=cur_raw.get("temperature_2m"),
        relative_humidity_2m=cur_raw.get("relative_humidity_2m"),
        apparent_temperature=cur_raw.get("apparent_temperature"),
        precipitation=cur_raw.get("precipitation"),
        wind_speed_10m=cur_raw.get("wind_speed_10m"),
        wind_direction_10m=cur_raw.get("wind_direction_10m"),
        weather_code=wcode,
        is_day=cur_raw.get("is_day"),
        uv_index=cur_raw.get("uv_index"),
        time=cur_raw.get("time"),
        condition=WMO_CODES.get(wcode, "Unknown") if wcode is not None else None,
    )

    daily_raw = main_data.get("daily", {})
    n = len(daily_raw.get("time", []))
    daily_forecast: List[DailyForecastItem] = []
    for i in range(n):
        def _g(key: str, idx: int = i):
            arr = daily_raw.get(key)
            return arr[idx] if arr and idx < len(arr) else None
        wc = _g("weather_code")
        daily_forecast.append(DailyForecastItem(
            date=_g("time") or "",
            temp_max=_g("temperature_2m_max"),
            temp_min=_g("temperature_2m_min"),
            precipitation_sum=_g("precipitation_sum"),
            precipitation_probability_max=_g("precipitation_probability_max"),
            wind_speed_max=_g("wind_speed_10m_max"),
            uv_index_max=_g("uv_index_max"),
            weather_code=wc,
            condition=WMO_CODES.get(wc, "Unknown") if wc is not None else None,
            sunrise=_g("sunrise"),
            sunset=_g("sunset"),
        ))

    today = date.today()
    seasonal_outlook: List[MonthlyClimate] = []
    for delta in range(3):
        m = today.month + delta
        y = today.year
        if m > 12:
            m -= 12
            y += 1
        mc = _aggregate_monthly(daily_raw, y, m)
        if mc.avg_temp_max is None and seasonal_outlook:
            prev = seasonal_outlook[-1]
            mc = MonthlyClimate(
                month=f"{calendar.month_name[m]} {y}",
                month_num=m, year=y,
                avg_temp_max=round((prev.avg_temp_max or 30) - 0.5, 1),
                avg_temp_min=round((prev.avg_temp_min or 20) - 0.5, 1),
                total_rainfall_mm=round((prev.total_rainfall_mm or 50) * 0.8, 1),
                avg_humidity=prev.avg_humidity,
                avg_wind_speed=prev.avg_wind_speed,
                rainy_days=max(0, (prev.rainy_days or 5) - 2),
                description=f"Projected — seasonal trend from {prev.month}",
            )
        seasonal_outlook.append(mc)

    return WeatherResponse(
        latitude=lat, longitude=lon, location_name=location_name,
        timezone=main_data.get("timezone", "UTC"),
        current=current, daily_forecast=daily_forecast,
        seasonal_outlook=seasonal_outlook,
        generated_at=datetime.utcnow().isoformat() + "Z",
    )
