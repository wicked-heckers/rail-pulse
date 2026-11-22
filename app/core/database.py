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


class LocalTopologyFallback:
    """Thread-safe zero-dependency JSON loader when PostgreSQL is unavailable."""

    _cached_data: dict[str, Any] | None = None

    @classmethod
    def load_topology(cls, path: Path | None = None) -> dict[str, Any]:
        if cls._cached_data is not None:
            return cls._cached_data

        target_path = path or settings.SEED_TOPOLOGY_PATH
        if not target_path.exists():
            raise FileNotFoundError(f"Seed topology file not found at {target_path}")

        logger.info("Loading topology from local JSON fallback: %s", target_path)
        with open(target_path, encoding="utf-8") as f:
            data = json.load(f)

        cls._cached_data = data
        return data

    @classmethod
    def clear_cache(cls) -> None:
        cls._cached_data = None


class LocalRoadMatrixFallback:
    """Zero-dependency JSON loader for road transfer cache."""

    _cached_matrix: dict[str, Any] | None = None

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
