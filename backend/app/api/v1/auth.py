import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import (
    REFRESH_TOKEN_TYPE,
    JWTError,
    create_access_token,
    decode_token,
)
from app.core.database import get_db
from app.dependencies.auth import get_current_active_user
from app.models.user import User
from app.repositories.user import UserRepository
from app.schemas.auth import LoginRequest, MessageResponse
from app.schemas.token import AccessToken, RefreshRequest, TokenPair
from app.schemas.user import UserOut
from app.services.auth import AuthError, AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenPair)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenPair:
    service = AuthService(db)
    try:
        user = service.authenticate(payload.email, payload.password)
    except AuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        )
    access_token, refresh_token = service.issue_tokens(user)
    return TokenPair(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=AccessToken)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)) -> AccessToken:
    invalid = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid refresh token",
    )
    try:
        decoded = decode_token(payload.refresh_token)
    except JWTError:
        raise invalid

    if decoded.get("type") != REFRESH_TOKEN_TYPE:
        raise invalid

    subject = decoded.get("sub")
    if subject is None:
        raise invalid

    try:
        user_id = uuid.UUID(subject)
    except (ValueError, TypeError):
        raise invalid

    user = UserRepository(db).get(user_id)
    if user is None or not user.is_active:
        raise invalid

    return AccessToken(access_token=create_access_token(str(user.id)))


@router.post("/logout", response_model=MessageResponse)
def logout(
    current_user: User = Depends(get_current_active_user),
) -> MessageResponse:
    # Placeholder: stateless JWTs are discarded client-side. Token
    # blacklisting can be added here in a future phase.
    return MessageResponse(message="Logged out successfully")


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_active_user)) -> User:
    return current_user
