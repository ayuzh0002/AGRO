"""
backend/weather.py - Weather prediction & 3-month seasonal forecast engine.

Integrates with Open-Meteo & Google Earth geospatial coordinates for agricultural planning.
"""

from backend.routers.weather import router, get_weather, geocode_location, WeatherResponse, MonthlyClimate

__all__ = ["router", "get_weather", "geocode_location", "WeatherResponse", "MonthlyClimate"]
