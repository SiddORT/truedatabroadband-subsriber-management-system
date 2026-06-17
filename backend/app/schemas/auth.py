from pydantic import BaseModel


class LoginRequest(BaseModel):
    # Plain str (not EmailStr) so non-standard domains are accepted.
    email: str
    password: str


class LogoutRequest(BaseModel):
    # Providing the refresh token revokes only that session.
    # Omitting it revokes ALL sessions for the authenticated user.
    refresh_token: str | None = None


class MessageResponse(BaseModel):
    message: str
