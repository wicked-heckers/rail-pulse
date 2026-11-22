from typing import Any

from app.core.database import LocalTopologyFallback
from app.core.redis_client import RedisCircuitBreakerClient, redis_client
from app.core.state_store import CorridorStateStore, state_store
from app.ingestion.demo_provider import DemoSimulationProvider

# Singleton demo provider for demo mode
demo_provider = DemoSimulationProvider()

# Cached corridor topology
_cached_topology: dict[str, Any] | None = None


def get_topology() -> dict[str, Any]:
    """Returns cached corridor topology dictionary."""
    global _cached_topology
    if _cached_topology is None:
        _cached_topology = LocalTopologyFallback.load_topology()
    return _cached_topology


def get_state_store() -> CorridorStateStore:
    """Dependency for in-process thread-safe state store."""
    return state_store


def get_redis_client() -> RedisCircuitBreakerClient:
    """Dependency for Redis circuit-breaker client."""
    return redis_client


def get_demo_provider() -> DemoSimulationProvider:
    """Dependency for demo simulation provider."""
    return demo_provider

