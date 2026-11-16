"""Conditional GET for the read-only store endpoints.

Every 200 response to ``GET /frontend-data-api/*`` gets a content-hash ETag and
``Cache-Control: no-cache``, so the browser keeps the body and revalidates it on each
request; an unchanged document then costs a 304 with no body instead of up to 1.3 MB.
The hash is taken from the body itself, so a rebuilt store or a refreshed game is never
served stale.
"""
from __future__ import annotations

import hashlib

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

DATA_PREFIX = "/frontend-data-api/"


class ETagMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        if request.method != "GET" or not request.url.path.startswith(DATA_PREFIX) or response.status_code != 200:
            return response
        body = b"".join([chunk async for chunk in response.body_iterator])
        etag = 'W/"' + hashlib.blake2b(body, digest_size=12).hexdigest() + '"'
        headers = {k: v for k, v in response.headers.items() if k.lower() != "content-length"}
        headers["ETag"] = etag
        headers.setdefault("Cache-Control", "no-cache")
        if etag in {tag.strip() for tag in request.headers.get("if-none-match", "").split(",")}:
            headers.pop("content-type", None)
            return Response(status_code=304, headers=headers)
        return Response(content=body, status_code=200, headers=headers, media_type=None)
