from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.auth import get_current_active_user
from app.models.user import User
from app.schemas.auth import LoginRequest, LogoutRequest, MessageResponse
from app.schemas.token import AccessToken, RefreshRequest, TokenPair
from app.schemas.user import UserOut
from app.services.auth import AuthError, AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenPair)
def login(
    request: Request,
    payload: LoginRequest,
    db: Session = Depends(get_db),
) -> TokenPair:
    service = AuthService(db)
    try:
        user = service.authenticate(payload.email, payload.password)
    except AuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        )
    access_token, refresh_token = service.issue_tokens(
        user,
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None,
    )
    return TokenPair(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=AccessToken)
def refresh(
    payload: RefreshRequest,
    db: Session = Depends(get_db),
) -> AccessToken:
    service = AuthService(db)
    try:
        access_token = service.refresh_access_token(payload.refresh_token)
    except AuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        )
    return AccessToken(access_token=access_token)


@router.post("/logout", response_model=MessageResponse)
def logout(
    payload: LogoutRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> MessageResponse:
    """
    Revoke the caller's refresh-token session.

    - Provide ``refresh_token`` to revoke that specific device session.
    - Omit it to revoke **all** sessions for this user account.
    """
    AuthService(db).logout(current_user.id, payload.refresh_token)
    return MessageResponse(message="Logged out successfully")


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_active_user)) -> User:
    return current_user
