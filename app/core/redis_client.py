import json
import logging
import time
from typing import Any

from redis.asyncio import Redis, from_url
from redis.exceptions import RedisError

from app.config import settings

logger = logging.getLogger("railpulse.redis")


class RedisCircuitBreakerClient:
    """
    Resilient Redis client with an automatic circuit breaker.
    Guarantees that if Redis crashes or is offline, all calls degrade
    gracefully to local memory with ZERO 500 exceptions.
    """

    def __init__(self, redis_url: str | None = None) -> None:
        self.redis_url = redis_url or settings.REDIS_URL
        self._redis: Redis | None = None
        self._is_healthy: bool = True
        self._last_error_time: float = 0.0
        self._retry_interval_secs: float = 20.0

    async def get_client(self) -> Redis | None:
        """Returns active redis client or None if circuit breaker is open."""
        now = time.time()
        if not self._is_healthy and (now - self._last_error_time) < self._retry_interval_secs:
            return None

        if self._redis is None:
            try:
                self._redis = from_url(
                    self.redis_url,
                    decode_responses=True,
                    socket_timeout=settings.REDIS_CIRCUIT_BREAKER_TIMEOUT,
                    socket_connect_timeout=settings.REDIS_CIRCUIT_BREAKER_TIMEOUT,
                )
                await self._redis.ping()
                self._is_healthy = True
                logger.info("Connected to Redis successfully.")
            except (RedisError, OSError, TimeoutError) as e:
                self._is_healthy = False
                self._last_error_time = now
                logger.warning("Redis is offline / unreachable (Circuit Breaker OPEN): %s", e)
                return None

        return self._redis

    async def get_snapshot(self) -> dict[str, Any] | None:
        """Fetches the latest corridor snapshot from Redis."""
        client = await self.get_client()
        if not client:
            return None

        try:
            val = await client.get("corridor:ecor:snapshot:latest")
            return json.loads(val) if val else None
        except (RedisError, OSError, TimeoutError) as e:
            self._record_failure(e)
            return None

    async def set_snapshot(self, snapshot_data: dict[str, Any], ttl: int = 300) -> bool:
        """Stores corridor snapshot to Redis with TTL."""
        client = await self.get_client()
        if not client:
            return False

        try:
            await client.set("corridor:ecor:snapshot:latest", json.dumps(snapshot_data), ex=ttl)
            return True
        except (RedisError, OSError, TimeoutError) as e:
            self._record_failure(e)
            return False

    def _record_failure(self, exc: Exception) -> None:
        self._is_healthy = False
        self._last_error_time = time.time()
        self._redis = None
        logger.warning("Redis operation failed. Opening circuit breaker: %s", exc)

    async def close(self) -> None:
        if self._redis:
            await self._redis.aclose()

    async def is_healthy(self) -> bool:
        """Returns True if Redis is online and circuit breaker is closed."""
        client = await self.get_client()
        return client is not None and self._is_healthy



# Global Redis singleton
redis_client = RedisCircuitBreakerClient()
