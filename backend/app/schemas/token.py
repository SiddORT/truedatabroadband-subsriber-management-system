from __future__ import annotations

from pydantic import BaseModel

from app.schemas.user import UserOut


class TokenPair(BaseModel):
    """Access + refresh token pair — returned on login and token rotation."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds until the access token expires


class LoginResponse(TokenPair):
    """Full login response that embeds the user profile."""

    user: UserOut


class RefreshRequest(BaseModel):
    refresh_token: str


class AccessToken(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
