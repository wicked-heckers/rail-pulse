from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    # Project Identity
    PROJECT_NAME: str = "RAIL-PULSE"
    VERSION: str = "1.0.0"
    ENVIRONMENT: Literal["development", "production", "test"] = "development"
    LOG_LEVEL: str = "INFO"

    # Server Configuration
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    WORKERS: int = 1  # Strictly 1 worker to prevent in-memory state split-brain

    # Databases
    DATABASE_URL: str = "postgresql+asyncpg://railpulse:railpulse_secret@localhost:5432/railpulse_db"
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_CIRCUIT_BREAKER_TIMEOUT: float = 1.0  # seconds

    # External APIs
    OPEN_METEO_BASE_URL: str = "https://api.open-meteo.com/v1/forecast"
    OSRM_BASE_URL: str = "https://router.project-osrm.org/route/v1/driving"
    OSRM_TIMEOUT_SECONDS: float = 2.0
    MAPBOX_ACCESS_TOKEN: str | None = None
    MAPBOX_DIRECTIONS_BASE_URL: str = "https://api.mapbox.com/directions/v5/mapbox/driving"
    ULIP_API_KEY: str = "railpulse-enterprise-ulip-key"

    # Ingestion & Simulation Controls
    DEFAULT_PROVIDER_MODE: Literal["DEMO_SIMULATION", "LIVE_POLLER", "REPLAY"] = "DEMO_SIMULATION"
    DEMO_SPEED_MULTIPLIER: float = 1.0  # 1x, 10x, 30x
    LIVE_POLL_INTERVAL_SECONDS: int = 120
    REDIS_SNAPSHOT_TTL_SECONDS: int = 300
    LIVE_TRAIN_API_URL: str | None = None

    # Corridor Linear Physics Bounds (Bhadrak to Puri)
    CORRIDOR_NAME: str = "ECoR_BHC_PURI"
    CORRIDOR_START_KM: float = 0.0      # Bhadrak (BHC)
    CORRIDOR_END_KM: float = 206.0      # Puri (PURI)
    
    # Signalling & Kinematic Rules
    MIN_HEADWAY_MINS: float = 10.0
    DEFAULT_LOOP_IN_PENALTY_MINS: float = 6.0
    DEFAULT_SIGNAL_CLEAR_PENALTY_MINS: float = 5.0
    STATION_EXIT_PENALTY_MINS: float = 12.0
    PEAK_HOUR_TRAFFIC_MULTIPLIER: float = 1.25

    # Freight Shadow Thresholds
    STR_FREIGHT_THRESHOLD: float = 1.50
    STR_WEATHER_DISCOUNT_THRESHOLD: float = 1.70
    RAIN_HEAVY_MM_HR: float = 15.0

    # Rescue & Liability Gates
    BAILOUT_TRIGGER_SURVIVAL_THRESHOLD: float = 0.40  # <40% triggers rescue search
    MIN_BAILOUT_REACTION_MINS: float = 12.0          # Train must be >=12m away from rescue junction
    MIN_TIME_SAVED_THRESHOLD_MINS: float = 5.0       # Road hop must save >=5 mins vs train P50

    # Local Fallback Data Paths
    SEED_TOPOLOGY_PATH: Path = BASE_DIR / "data" / "seed_ecor_topology.json"
    SEED_OSRM_MATRIX_PATH: Path = BASE_DIR / "data" / "seed_osrm_matrix.json"
    FALLBACK_SNAPSHOTS_PATH: Path = BASE_DIR / "data" / "fallback_snapshots.json"

    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )


settings = Settings()
