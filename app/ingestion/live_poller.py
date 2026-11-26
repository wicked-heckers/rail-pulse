import logging
import time
from typing import Any

import httpx

from app.config import settings
from app.ingestion.base import CorridorDataProvider
from app.models.schemas import FreightInferenceResult, TrainKinematicState

logger = logging.getLogger("railpulse.live_poller")


class LiveFeedProvider(CorridorDataProvider):
    """
    Live Station Board and Open-Meteo Weather Poller.
    Polls upstream feeds on a 120s TTL cache to eliminate per-click API hits
    and stay well within rate-limit quotas.
    """

    def __init__(self, poll_interval_secs: int | None = None) -> None:
        self.poll_interval_secs: int = poll_interval_secs or settings.LIVE_POLL_INTERVAL_SECONDS
        self._last_poll_epoch: float = 0.0
        self._cached_snapshot: dict[str, Any] | None = None
        self.cached_weather: dict[str, Any] = {
            "rain_mm_hr": 0.0,
            "wind_speed_kmph": 10.0,
            "condition": "CLEAR",
        }

    async def fetch_weather_update(self) -> dict[str, Any]:
        """Queries Open-Meteo for corridor rainfall around Cuttack/Bhubaneswar (20.3N, 85.8E)."""
        url = f"{settings.OPEN_METEO_BASE_URL}?latitude=20.30&longitude=85.83&current=precipitation,wind_speed_10m"
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    data = resp.json()
                    curr = data.get("current", {})
                    rain = float(curr.get("precipitation", 0.0))
                    wind = float(curr.get("wind_speed_10m", 12.0))
                    cond = "HEAVY_RAIN" if rain > 15 else "DRIZZLE" if rain > 2 else "CLEAR"
                    self.cached_weather = {
                        "rain_mm_hr": rain,
                        "wind_speed_kmph": wind,
                        "condition": cond,
                    }
        except (httpx.HTTPError, ValueError, KeyError) as e:
            logger.warning("Open-Meteo live weather fetch failed (using cache): %s", e)

        return self.cached_weather

    async def fetch_live_trains(self) -> list[TrainKinematicState]:
        """
        Fetches active corridor trains from the configured upstream live feed.
        Raises RuntimeError if no upstream URL is configured or if the upstream
        feed is unreachable/empty so the caller can trigger automatic REPLAY failover.
        """
        if not settings.LIVE_TRAIN_API_URL:
            raise RuntimeError("LIVE_TRAIN_API_URL is not configured; upstream live train feed unavailable.")

        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(settings.LIVE_TRAIN_API_URL)
            resp.raise_for_status()
            payload = resp.json()

        raw_trains = payload.get("trains", payload if isinstance(payload, list) else [])
        if not raw_trains:
            raise RuntimeError("Upstream live train feed returned zero active trains.")

        now_epoch = int(time.time())
        trains: list[TrainKinematicState] = []
        for item in raw_trains:
            trains.append(
                TrainKinematicState(
                    train_no=str(item["train_no"]),
                    train_name=str(item.get("train_name", f"Train {item['train_no']}")),
                    direction=item["direction"],
                    priority_rank=int(item.get("priority_rank", 3)),
                    chainage_km=float(item["chainage_km"]),
                    lat=item.get("lat"),
                    lon=item.get("lon"),
                    speed_kmph=float(item.get("speed_kmph", 0.0)),
                    current_delay_mins=float(item.get("current_delay_mins", 0.0)),
                    current_station=item.get("current_station"),
                    next_station=item.get("next_station"),
                    last_updated_epoch=int(item.get("last_updated_epoch", now_epoch)),
                    status=str(item.get("status", "RUNNING_NORMAL")),
                )
            )
        return trains

    async def get_corridor_snapshot(self, force_refresh: bool = False) -> dict[str, Any]:
        """
        Returns cached live corridor snapshot if within the 120s TTL window,
        otherwise polls upstream train & weather feeds.
        """
        now = time.time()
        if (
            not force_refresh
            and self._cached_snapshot is not None
            and (now - self._last_poll_epoch) < self.poll_interval_secs
        ):
            return self._cached_snapshot

        trains = await self.fetch_live_trains()
        weather = await self.fetch_weather_update()
        snapshot: dict[str, Any] = {
            "tick_utc": int(now),
            "mode": "LIVE_POLLER",
            "trains": trains,
            "phantom_freights": [] if not trains else list[FreightInferenceResult](),
            "weather": weather,
        }
        self._cached_snapshot = snapshot
        self._last_poll_epoch = now
        return snapshot

    async def set_speed_multiplier(self, multiplier: float) -> None:
        pass

    async def inject_delay(self, train_no: str, additional_mins: float) -> None:
        pass

    async def inject_freight(self, block_id: str, confidence: float, duration_mins: float) -> None:
        pass
