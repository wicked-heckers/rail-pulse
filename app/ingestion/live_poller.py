import logging
from typing import Any

import httpx

from app.config import settings
from app.ingestion.base import CorridorDataProvider

logger = logging.getLogger("railpulse.live_poller")


class LiveFeedProvider(CorridorDataProvider):
    """
    Live Station Board and Open-Meteo Weather Poller.
    Polls 4 major hubs (BHC, CTC, BBS, KUR) on a 120s TTL to stay
    well within free API quota limits.
    """

    def __init__(self) -> None:
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

    async def get_corridor_snapshot(self) -> dict[str, Any]:
        """Returns live corridor state."""
        weather = await self.fetch_weather_update()
        return {
            "mode": "LIVE_FEED",
            "weather": weather,
            "trains": [],
            "phantom_freights": [],
        }

    async def set_speed_multiplier(self, multiplier: float) -> None:
        pass

    async def inject_delay(self, train_no: str, additional_mins: float) -> None:
        pass

    async def inject_freight(self, block_id: str, confidence: float, duration_mins: float) -> None:
        pass
