"""
main.py – FastAPI application factory and entry point.

Run with:
    uvicorn main:app --reload --host 0.0.0.0 --port 8000

Or from the project root (Agro_in/):
    uvicorn backend.main:app --reload

Swagger UI → http://localhost:8000/docs
ReDoc      → http://localhost:8000/redoc
"""

import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.config import settings
from backend.database import Base, engine

# ── Routers ────────────────────────────────────────────────────────────────
from backend.routers import dashboard, diagnoses, farmers, rover, seeds, soil, sensors, weather, farm, crop_recommend

logging.basicConfig(level=logging.DEBUG if settings.DEBUG else logging.INFO)
logger = logging.getLogger(__name__)


# ── Lifespan (startup / shutdown) ──────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──
    logger.info("Creating database tables (if they don't exist) …")
    Base.metadata.create_all(bind=engine)

    upload_dir = os.path.join(settings.UPLOAD_DIR, "diagnoses")
    os.makedirs(upload_dir, exist_ok=True)
    logger.info(f"Upload directory ready at: {os.path.abspath(upload_dir)}")

    logger.info("AgroIn API is ready.")
    yield

    # ── Shutdown ──
    logger.info("AgroIn API shutting down.")


# ── Application ────────────────────────────────────────────────────────────

app = FastAPI(
    title       = settings.APP_TITLE,
    version     = settings.APP_VERSION,
    description = settings.APP_DESCRIPTION,
    docs_url    = "/docs",
    redoc_url   = "/redoc",
    lifespan    = lifespan,
)

# ── CORS ───────────────────────────────────────────────────────────────────
# Lock this down to your actual frontend origin in production.
app.add_middleware(
    CORSMiddleware,
    allow_origins     = ["*"],   # ← restrict in production
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

# ── Static file serving for uploaded images ────────────────────────────────
# Accessible at  GET /uploads/diagnoses/<filename>
app.mount(
    "/uploads",
    StaticFiles(directory=settings.UPLOAD_DIR, check_dir=False),
    name="uploads",
)

# ── Routers ────────────────────────────────────────────────────────────────
# API v1 prefix
app.include_router(farmers.router,   prefix="/api/v1")
app.include_router(rover.router,     prefix="/api/v1")
app.include_router(soil.router,      prefix="/api/v1")
app.include_router(diagnoses.router, prefix="/api/v1")
app.include_router(seeds.router,     prefix="/api/v1")
app.include_router(dashboard.router, prefix="/api/v1")
app.include_router(sensors.router,   prefix="/api/v1")
app.include_router(weather.router,   prefix="/api/v1")
app.include_router(farm.router,          prefix="/api/v1")
app.include_router(crop_recommend.router, prefix="/api/v1")

# Also mount at root level so endpoints like /weather work directly
app.include_router(sensors.router)
app.include_router(weather.router)
app.include_router(farm.router)            # /farm-weather, /agriculture-analysis, /ai/*
app.include_router(crop_recommend.router)  # /crop-recommendation

# Direct root-level mounts for convenience (/dashboard/{farmer_id}, /rover/..., /manual-upload)
app.include_router(dashboard.router, include_in_schema=False)

from backend.schemas import DiagnosisRead

# Direct root-level mounts for rover & manual-upload convenience
app.include_router(rover.router,     include_in_schema=False)
app.post(
    "/manual-upload",
    response_model=DiagnosisRead,
    status_code=status.HTTP_201_CREATED,
    tags=["Diagnoses"],
    summary="Farmer manual upload fallback (root alias)",
    include_in_schema=False,
)(diagnoses.manual_upload_diagnosis)



from fastapi.responses import FileResponse

WIREFRAMES_FILE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "wireframes.html"))


# ── Health check & Web UI ──────────────────────────────────────────────────

@app.get("/health", tags=["Meta"], summary="Health check")
def health():
    return {"status": "ok", "version": settings.APP_VERSION}


@app.get("/maps-config", tags=["Meta"], summary="Google Maps public config (no API key)")
def maps_config():
    """
    Returns the Google Maps API key for the frontend.

    SECURITY NOTE: This endpoint returns the Maps API key so the React
    frontend can load the Maps JavaScript API without baking the key into
    the Vite bundle.  Restrict the key to your domain in Google Cloud Console
    (Application Restrictions → HTTP referrers) so it cannot be misused even
    if someone reads it from the network tab.

    Never expose other secrets (database password, Gemini key, etc.) here.
    """
    import json
    boundary = []
    if settings.FARM_BOUNDARY_JSON.strip():
        try:
            boundary = json.loads(settings.FARM_BOUNDARY_JSON)
        except Exception:
            boundary = []
    return {
        "google_maps_api_key": settings.GOOGLE_MAPS_API_KEY or "",
        "farm_name":           settings.FARM_NAME,
        "latitude":            settings.FARM_LATITUDE,
        "longitude":           settings.FARM_LONGITUDE,
        "boundary":            boundary,
        "map_zoom":            17,
    }


@app.get("/", tags=["Web"], summary="AgroIn Web Interface")
def root():
    if os.path.isfile(WIREFRAMES_FILE):
        return FileResponse(WIREFRAMES_FILE)
    return {
        "message": "AgroIn API is running.",
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/wireframes", tags=["Web"], summary="AgroIn Wireframes")
def wireframes():
    if os.path.isfile(WIREFRAMES_FILE):
        return FileResponse(WIREFRAMES_FILE)
    return {"detail": "wireframes.html not found"}
