from abc import ABC, abstractmethod
from typing import Any


class CorridorDataProvider(ABC):
    """Abstract Base Class for Corridor Data Ingestion Providers."""

    @abstractmethod
    async def get_corridor_snapshot(self) -> dict[str, Any]:
        """Returns the latest normalized corridor state snapshot."""

    @abstractmethod
    async def set_speed_multiplier(self, multiplier: float) -> None:
        """Sets the simulation speed multiplier (1.0, 10.0, 30.0)."""

    @abstractmethod
    async def inject_delay(self, train_no: str, additional_mins: float) -> None:
        """Injects artificial delay onto an active train for judge 'What-If' scenarios."""

    @abstractmethod
    async def inject_freight(self, block_id: str, confidence: float, duration_mins: float) -> None:
        """Injects an implied or manual freight shadow onto a track block."""
