from __future__ import annotations

import os
import threading
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Iterable, Sequence

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send


@dataclass(frozen=True)
class RateLimitRule:
    name: str
    path_prefixes: tuple[str, ...]
    max_requests: int
    window_seconds: int


def _parse_int_env(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _parse_path_list(raw: str | None) -> tuple[str, ...]:
    if not raw:
        return ()
    return tuple(path.strip() for path in raw.split(",") if path.strip())


def default_rate_limit_rules() -> list[RateLimitRule]:
    predict_max = _parse_int_env("RATE_LIMIT_PREDICT_MAX", 30)
    data_api_max = _parse_int_env("RATE_LIMIT_DATA_API_MAX", 120)
    frontend_data_max = _parse_int_env("RATE_LIMIT_FRONTEND_DATA_MAX", 300)
    default_max = _parse_int_env("RATE_LIMIT_DEFAULT_MAX", 600)
    window_seconds = _parse_int_env("RATE_LIMIT_WINDOW_SECONDS", 60)

    return [
        RateLimitRule("predict", ("/predict/",), predict_max, window_seconds),
        RateLimitRule("frontend_data_api", ("/frontend-data-api/",), data_api_max, window_seconds),
        RateLimitRule("frontend_data", ("/frontend-data/",), frontend_data_max, window_seconds),
        RateLimitRule("default", ("/",), default_max, window_seconds),
    ]


class RateLimiter:
    def __init__(
        self,
        rules: Sequence[RateLimitRule] | None = None,
        exempt_paths: Iterable[str] | None = None,
        trust_forwarded_for: bool | None = None,
    ) -> None:
        self.rules = list(rules or default_rate_limit_rules())
        self.exempt_paths = set(exempt_paths or _parse_path_list(os.environ.get("RATE_LIMIT_EXEMPT_PATHS")))
        self.trust_forwarded_for = (
            trust_forwarded_for
            if trust_forwarded_for is not None
            else os.environ.get("RATE_LIMIT_TRUST_X_FORWARDED_FOR", "false").strip().lower() in {"1", "true", "yes", "on"}
        )
        self._buckets: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def _client_id(self, request: Request) -> str:
        if self.trust_forwarded_for:
            forwarded_for = request.headers.get("x-forwarded-for", "").strip()
            if forwarded_for:
                return forwarded_for.split(",")[0].strip() or "unknown"

        real_ip = request.headers.get("x-real-ip", "").strip()
        if real_ip:
            return real_ip

        if request.client and request.client.host:
            return request.client.host
        return "unknown"

    def _rule_for_path(self, path: str) -> RateLimitRule:
        for rule in self.rules:
            if any(path.startswith(prefix) for prefix in rule.path_prefixes):
                return rule
        return self.rules[-1]

    def _prune(self, bucket: deque[float], now: float, window_seconds: int) -> None:
        cutoff = now - window_seconds
        while bucket and bucket[0] <= cutoff:
            bucket.popleft()

    def _exempt(self, path: str) -> bool:
        if path in self.exempt_paths:
            return True
        return path in {"/docs", "/redoc", "/openapi.json", "/favicon.ico"}

    def check(self, request: Request) -> tuple[bool, RateLimitRule, int, int]:
        path = request.url.path
        rule = self._rule_for_path(path)
        if self._exempt(path) or rule.max_requests <= 0:
            return True, rule, rule.max_requests, 0

        client_id = self._client_id(request)
        bucket_key = f"{rule.name}:{client_id}"
        now = time.monotonic()

        with self._lock:
            bucket = self._buckets[bucket_key]
            self._prune(bucket, now, rule.window_seconds)

            if len(bucket) >= rule.max_requests:
                reset_after = max(1, int(rule.window_seconds - (now - bucket[0])))
                return False, rule, 0, reset_after

            bucket.append(now)
            remaining = max(0, rule.max_requests - len(bucket))
            return True, rule, remaining, rule.window_seconds


class RateLimitMiddleware:
    def __init__(self, app: ASGIApp, limiter: RateLimiter | None = None) -> None:
        self.app = app
        self.limiter = limiter or RateLimiter()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope, receive=receive)
        allowed, rule, remaining, reset_after = self.limiter.check(request)
        if not allowed:
            response = JSONResponse(
                status_code=429,
                content={
                    "detail": "Rate limit exceeded",
                    "limit": rule.max_requests,
                    "window_seconds": rule.window_seconds,
                    "rule": rule.name,
                },
                headers={
                    "Retry-After": str(reset_after),
                    "X-RateLimit-Limit": str(rule.max_requests),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(reset_after),
                },
            )
            await response(scope, receive, send)
            return

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                headers = message.setdefault("headers", [])
                headers.extend(
                    [
                        (b"x-ratelimit-limit", str(rule.max_requests).encode("ascii")),
                        (b"x-ratelimit-remaining", str(remaining).encode("ascii")),
                        (b"x-ratelimit-window-seconds", str(rule.window_seconds).encode("ascii")),
                    ]
                )
            await send(message)

        await self.app(scope, receive, send_with_headers)
