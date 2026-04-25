"""
phyphox sensor client.

Setup on iPhone:
  1. Open phyphox → pick the "Acceleration" experiment (includes gravity — needed for tilt).
  2. Tap ⋮ → Remote Access → enable it. Note the IP (e.g. 192.168.1.42).
  3. Set PHYPHOX_HOST=<that-ip> in your .env or shell before starting the backend.

Why "Acceleration" (with g) instead of "Attitude":
  Attitude/pitch requires the phone to be perfectly oriented for meaningful numbers,
  and it drifts. Gravity-inclusive accelerometer data lets us compute a stable tilt
  angle that auto-corrects to rest position via calibration.

Channel names phyphox exposes for the "Acceleration" experiment:
  acc_time, accX, accY, accZ  (m/s²  including ~9.8 gravity)

This client is intentionally a thin HTTP wrapper. To swap in a different sensor
(native iOS app, BLE IMU, UDP stream), replace this file only.
"""

import asyncio
import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# Supported phyphox experiment modes → channel names
EXPERIMENT_CHANNELS = {
    "acceleration": ["acc_time", "accX", "accY", "accZ"],
    "attitude": ["att_time", "roll", "pitch", "yaw"],
}


class PhyphoxClient:
    def __init__(
        self,
        host: str,
        port: int = 80,
        mode: str = "acceleration",
        timeout: float = 1.5,
        poll_interval: float = 0.05,  # 20 Hz
    ):
        self.host = host
        self.port = port
        self.mode = mode
        self.timeout = timeout
        self.poll_interval = poll_interval
        self.base_url = f"http://{host}:{port}"
        self._channels = EXPERIMENT_CHANNELS.get(mode, EXPERIMENT_CHANNELS["acceleration"])
        self._client: Optional[httpx.AsyncClient] = None
        self._consecutive_errors = 0

    async def __aenter__(self):
        self._client = httpx.AsyncClient(timeout=self.timeout)
        return self

    async def __aexit__(self, *_):
        if self._client:
            await self._client.aclose()

    def _query(self) -> str:
        return "&".join(f"{ch}=full" for ch in self._channels)

    async def fetch_latest(self) -> Optional[dict]:
        """
        Returns a dict of {channel: latest_value} or None on failure.
        Takes the last item from each channel's buffer (most recent sample).
        """
        if not self._client:
            raise RuntimeError("Use as async context manager")

        try:
            url = f"{self.base_url}/get?{self._query()}"
            resp = await self._client.get(url)
            resp.raise_for_status()
            data = resp.json()

            # phyphox status is a dict like {measuring: True, ...}, not a string
            status = data.get("status", {})
            if isinstance(status, dict) and not status.get("measuring", True):
                logger.debug("phyphox experiment not measuring")
                return None

            # channel buffers are nested under data["buffer"]
            buffers = data.get("buffer", data)

            result = {}
            for ch in self._channels:
                buf = buffers.get(ch, {}).get("buffer", [])
                if not buf:
                    return None  # experiment not running yet
                result[ch] = buf[-1]

            if self._consecutive_errors > 0:
                logger.info(f"phyphox reconnected after {self._consecutive_errors} errors")
            self._consecutive_errors = 0
            return result

        except httpx.TimeoutException:
            self._consecutive_errors += 1
            if self._consecutive_errors % 20 == 1:
                logger.warning(f"phyphox timeout ({self._consecutive_errors}x) — is the experiment running?")
            return None
        except httpx.RequestError as e:
            self._consecutive_errors += 1
            if self._consecutive_errors % 20 == 1:
                logger.warning(f"phyphox connection error: {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected phyphox error: {e}")
            return None

    async def stream(self, callback):
        """Poll forever, calling async callback(reading) for each valid sample."""
        logger.info(f"Streaming from phyphox at {self.base_url} mode={self.mode}")
        async with self:
            while True:
                t0 = asyncio.get_event_loop().time()
                reading = await self.fetch_latest()
                if reading is not None:
                    await callback(reading)
                elapsed = asyncio.get_event_loop().time() - t0
                await asyncio.sleep(max(0.0, self.poll_interval - elapsed))
