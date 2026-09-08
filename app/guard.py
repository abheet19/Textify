"""Small, dependency-free guardrails for Textify's paid endpoints."""
from __future__ import annotations

import hashlib
import hmac
import os
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from threading import Lock

from fastapi import HTTPException, Request


@dataclass(frozen=True)
class Budget:
    limit: int
    window_seconds: int


class RequestBudget:
    """Process-local burst control. Production access code is the hard public gate."""

    def __init__(self) -> None:
        self._events: dict[tuple[str, str], deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def consume(self, key: str, operation: str, budget: Budget) -> None:
        now = time.monotonic()
        bucket = (key, operation)
        with self._lock:
            events = self._events[bucket]
            cutoff = now - budget.window_seconds
            while events and events[0] <= cutoff:
                events.popleft()
            if len(events) >= budget.limit:
                retry_after = max(1, int(events[0] + budget.window_seconds - now))
                raise HTTPException(
                    429,
                    "Request budget reached. Try again later.",
                    headers={"Retry-After": str(retry_after)},
                )
            events.append(now)


budget = RequestBudget()
UPLOAD_BUDGET = Budget(limit=3, window_seconds=60 * 60)
ASK_BUDGET = Budget(limit=12, window_seconds=60 * 60)


def client_key(request: Request) -> str:
    # Fly injects this value at its trusted proxy. Do not let a public caller
    # choose its own rate-limit bucket with a spoofed forwarded header.
    fly_client_ip = request.headers.get("fly-client-ip", "").strip()
    return fly_client_ip or (request.client.host if request.client else "unknown")


def require_access_code(request: Request) -> None:
    """Protect a single-user workspace and fail closed in public deployment."""
    required = os.getenv("TEXTIFY_ACCESS_CODE", "")
    production = os.getenv("TEXTIFY_REQUIRE_ACCESS_CODE", "").lower() in {"1", "true"} or bool(os.getenv("FLY_APP_NAME"))
    if production and not required:
        raise HTTPException(503, "Textify is not enabled for public requests.")
    if required:
        supplied = request.headers.get("x-textify-access-code", "")
        if not hmac.compare_digest(supplied, required):
            raise HTTPException(401, "A valid Textify access code is required.")


def require_paid_access(request: Request, operation: str) -> None:
    """Protect paid work with access control and a small per-client budget."""
    require_access_code(request)
    budget.consume(client_key(request), operation, UPLOAD_BUDGET if operation == "upload" else ASK_BUDGET)


def content_fingerprint(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:12]

