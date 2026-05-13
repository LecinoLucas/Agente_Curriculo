from __future__ import annotations

from datetime import UTC, datetime
import time

APP_VERSION = "1.0.0"
PROCESS_STARTED_AT = datetime.now(UTC)
PROCESS_STARTED_MONOTONIC = time.monotonic()
