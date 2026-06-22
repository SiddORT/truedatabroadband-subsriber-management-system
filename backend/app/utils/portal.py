"""Helper to build an absolute client-portal URL.

Resolution order:
1. ``settings.SITE_URL`` (set from REPLIT_DEV_DOMAIN or the SITE_URL env var)
2. ``X-Forwarded-Proto`` + ``X-Forwarded-Host`` headers from the incoming request
   (Replit's reverse proxy always injects these)
3. Empty string (email still sends; URL row is just blank)
"""
from __future__ import annotations

from fastapi import Request

from app.core.config import settings


def build_portal_url(request: Request | None = None, path: str = "/client") -> str:
    path = path.rstrip("/")

    if settings.SITE_URL:
        return f"{settings.SITE_URL.rstrip('/')}{path}"

    if request is not None:
        proto = request.headers.get("x-forwarded-proto", "https")
        host = (
            request.headers.get("x-forwarded-host")
            or request.headers.get("host", "")
        )
        if host:
            return f"{proto}://{host}{path}"

    return ""
