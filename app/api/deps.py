from typing import Any

from app.core.database import LocalTopologyFallback
from app.core.redis_client import RedisCircuitBreakerClient, redis_client
from app.core.state_store import CorridorStateStore, state_store
from app.ingestion.demo_provider import DemoSimulationProvider
from app.ingestion.live_poller import LiveFeedProvider
from app.ingestion.replay_provider import ReplayProvider

# Singleton providers
demo_provider = DemoSimulationProvider()
live_provider = LiveFeedProvider()
replay_provider = ReplayProvider()

def get_topology() -> dict[str, Any]:
    """Returns the topology dictionary for the currently active corridor."""
    return LocalTopologyFallback.load_topology()


def get_state_store() -> CorridorStateStore:
    """Dependency for in-process thread-safe state store."""
    return state_store


def get_redis_client() -> RedisCircuitBreakerClient:
    """Dependency for Redis circuit-breaker client."""
    return redis_client


def get_demo_provider() -> DemoSimulationProvider:
    """Dependency for demo simulation provider."""
    return demo_provider


def get_live_provider() -> LiveFeedProvider:
    """Dependency for live corridor poller provider."""
    return live_provider


def get_replay_provider() -> ReplayProvider:
    """Dependency for local replay provider."""
    return replay_provider

