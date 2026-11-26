import json
import logging
from collections.abc import AsyncGenerator
from pathlib import Path
from typing import Any

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import settings

logger = logging.getLogger("railpulse.database")

# Async Engine Setup
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=(settings.LOG_LEVEL.upper() == "DEBUG"),
    pool_size=10,
    max_overflow=5,
    pool_pre_ping=True,
    connect_args={"timeout": 3.0},
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_db_session() -> AsyncGenerator[AsyncSession]:
    """FastAPI dependency for obtaining an asynchronous database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception as exc:
            await session.rollback()
            logger.error("DB Session rollback on exception: %s", exc)
            raise
        finally:
            await session.close()


AVAILABLE_CORRIDORS: dict[str, dict[str, Any]] = {
    "ECoR_BHC_PURI": {
        "id": "ECoR_BHC_PURI",
        "name": "East Coast Trunk Line",
        "section": "Bhadrak – Cuttack – Bhubaneswar – Puri",
        "length_km": 206.0,
        "stations_count": 9,
        "path": Path("data/seed_ecor_topology.json"),
        "primary_highway": "NH-16 Expressway",
        "region": "Odisha",
    },
    "SER_HWH_KGP": {
        "id": "SER_HWH_KGP",
        "name": "Kolkata Trunk Line",
        "section": "Howrah – Santragachi – Mecheda – Kharagpur",
        "length_km": 115.0,
        "stations_count": 8,
        "path": Path("data/seed_ser_topology.json"),
        "primary_highway": "Kona Expressway & NH-16",
        "region": "West Bengal",
    },
}


class LocalTopologyFallback:
    """Thread-safe zero-dependency JSON loader supporting multiple railway corridors."""

    _cached_data: dict[str, Any] | None = None
    _cached_by_corridor: dict[str, dict[str, Any]] = {}
    _active_corridor_id: str = "ECoR_BHC_PURI"

    @classmethod
    def list_corridors(cls) -> list[dict[str, Any]]:
        return [
            {
                "id": c["id"],
                "name": c["name"],
                "section": c["section"],
                "length_km": c["length_km"],
                "stations_count": c["stations_count"],
                "primary_highway": c["primary_highway"],
                "region": c["region"],
                "is_active": (c["id"] == cls._active_corridor_id),
            }
            for c in AVAILABLE_CORRIDORS.values()
        ]

    @classmethod
    def set_active_corridor(cls, corridor_id: str) -> None:
        if corridor_id not in AVAILABLE_CORRIDORS:
            raise ValueError(f"Unknown corridor ID: {corridor_id}. Available: {list(AVAILABLE_CORRIDORS.keys())}")
        cls._active_corridor_id = corridor_id

    @classmethod
    def get_active_corridor_id(cls) -> str:
        return cls._active_corridor_id

    @classmethod
    def load_topology(cls, path: Path | None = None, corridor_id: str | None = None) -> dict[str, Any]:
        cid = corridor_id or cls._active_corridor_id
        if path is None and cid in cls._cached_by_corridor:
            return cls._cached_by_corridor[cid]

        if path:
            target_path = path
        elif cid in AVAILABLE_CORRIDORS:
            target_path = AVAILABLE_CORRIDORS[cid]["path"]
        else:
            target_path = settings.SEED_TOPOLOGY_PATH

        if not target_path.exists():
            raise FileNotFoundError(f"Seed topology file not found at {target_path}")

        logger.info("Loading topology for corridor %s from %s", cid, target_path)
        with open(target_path, encoding="utf-8") as f:
            data = json.load(f)

        cls._cached_by_corridor[cid] = data
        cls._cached_data = data
        return data

    @classmethod
    def clear_cache(cls) -> None:
        cls._cached_data = None
        cls._cached_by_corridor.clear()


class LocalRoadMatrixFallback:
    """Zero-dependency JSON loader for road transfer cache."""

    _cached_matrix: dict[str, Any] | None = None

    @classmethod
    def clear_cache(cls) -> None:
        cls._cached_matrix = None

    @classmethod
    def load_matrix(cls, path: Path | None = None) -> dict[str, Any]:
        if cls._cached_matrix is not None:
            return cls._cached_matrix

        target_path = path or settings.SEED_OSRM_MATRIX_PATH
        if not target_path.exists():
            raise FileNotFoundError(f"Seed OSRM matrix file not found at {target_path}")

        with open(target_path, encoding="utf-8") as f:
            data = json.load(f)

        cls._cached_matrix = data
        return data

    @classmethod
    def get_route(cls, from_stn: str, to_stn: str) -> dict[str, Any] | None:
        matrix = cls.load_matrix()
        for route in matrix.get("routes", []):
            if route["from_station"] == from_stn and route["to_station"] == to_stn:
                return route
        return None
