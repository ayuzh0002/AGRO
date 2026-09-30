"""
geo.py – Geospatial calculations and nearest-field matching.

Uses the Haversine formula to compute great-circle distance between coordinates
on the Earth's surface.
"""

import math
from typing import Optional, Tuple
from sqlalchemy.orm import Session

from backend.models import FarmerProfile

# Mean radius of Earth in meters
EARTH_RADIUS_METERS = 6371000.0


def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Compute great-circle distance between two GPS coordinates in meters.
    """
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return EARTH_RADIUS_METERS * c


def find_nearest_farmer_field(
    db: Session,
    lat: float,
    lon: float,
) -> Tuple[Optional[FarmerProfile], Optional[float]]:
    """
    Given a rover GPS latitude and longitude, find the nearest active farmer whose field
    coordinates are registered.

    Returns:
        (nearest_farmer, distance_meters) or (None, None) if no active farmers exist.
    """
    active_farmers = db.query(FarmerProfile).filter(FarmerProfile.is_active == True).all()
    if not active_farmers:
        return None, None

    # Filter farmers with registered GPS coordinates
    farmers_with_coords = [
        f for f in active_farmers if f.field_lat is not None and f.field_lon is not None
    ]

    if not farmers_with_coords:
        # Fallback to the first active farmer if no farmers have explicit coordinates yet
        return active_farmers[0], None

    nearest_farmer = None
    min_dist = float("inf")

    for farmer in farmers_with_coords:
        dist = haversine_distance_meters(lat, lon, farmer.field_lat, farmer.field_lon)
        if dist < min_dist:
            min_dist = dist
            nearest_farmer = farmer

    return nearest_farmer, min_dist


def calculate_polygon_area_and_perimeter(
    coords: list[dict[str, float]]
) -> dict[str, float]:
    """
    Calculate area (sq meters, hectares, acres) and perimeter (meters)
    for a GPS polygon boundary [{lat, lng}, ...].
    """
    if not coords or len(coords) < 3:
        return {
            "area_sq_meters": 0.0,
            "area_hectares":  0.0,
            "area_acres":     0.0,
            "perimeter_m":    0.0,
            "center_lat":     0.0,
            "center_lon":     0.0,
        }

    # Centroid calculation
    avg_lat = sum(c.get("lat", 0.0) for c in coords) / len(coords)
    avg_lon = sum(c.get("lng", c.get("lon", 0.0)) for c in coords) / len(coords)

    # Project to local meter coordinates using equirectangular projection centered at avg_lat
    lat_rad = math.radians(avg_lat)
    meters_per_deg_lat = 111132.954 - 559.822 * math.cos(2 * lat_rad) + 1.175 * math.cos(4 * lat_rad)
    meters_per_deg_lon = 111412.84 * math.cos(lat_rad) - 93.5 * math.cos(3 * lat_rad)

    pts = []
    for c in coords:
        lat = c.get("lat", 0.0)
        lon = c.get("lng", c.get("lon", 0.0))
        x = (lon - avg_lon) * meters_per_deg_lon
        y = (lat - avg_lat) * meters_per_deg_lat
        pts.append((x, y))

    # Shoelace formula for area
    area = 0.0
    perimeter = 0.0
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        area += pts[i][0] * pts[j][1]
        area -= pts[j][0] * pts[i][1]

        # Perimeter
        dx = pts[j][0] - pts[i][0]
        dy = pts[j][1] - pts[i][1]
        perimeter += math.sqrt(dx * dx + dy * dy)

    area_sqm = abs(area) / 2.0
    area_hectares = area_sqm / 10000.0
    area_acres = area_sqm * 0.000247105

    return {
        "area_sq_meters": round(area_sqm, 2),
        "area_hectares":  round(area_hectares, 3),
        "area_acres":     round(area_acres, 3),
        "perimeter_m":    round(perimeter, 2),
        "center_lat":     round(avg_lat, 6),
        "center_lon":     round(avg_lon, 6),
    }

