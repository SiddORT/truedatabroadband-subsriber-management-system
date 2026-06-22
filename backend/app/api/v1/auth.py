from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.dependencies.auth import get_current_active_user
from app.models.audit_log import ACTION_LOGIN, ACTION_LOGOUT, ACTION_PASSWORD_CHANGE
from app.models.user import User
from app.repositories.audit_log import AuditLogRepository
from app.schemas.auth import LoginRequest, LogoutRequest, MessageResponse
from app.schemas.password import ChangePasswordRequest
from app.schemas.staff_user import AcceptInviteRequest
from app.schemas.token import LoginResponse, RefreshRequest, TokenPair
from app.schemas.user import UserOut
from app.services.auth import AuthError, AuthService, PasswordPolicyError
from app.services.staff_user import StaffUserError, StaffUserService

router = APIRouter(prefix="/auth", tags=["auth"])

_EXPIRES_IN = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _audit(
    db: Session,
    action: str,
    request: Request,
    user_id: object = None,
) -> None:
    AuditLogRepository(db).log(
        action,
        user_id=user_id,  # type: ignore[arg-type]
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post("/login", response_model=LoginResponse)
def login(
    request: Request,
    payload: LoginRequest,
    db: Session = Depends(get_db),
) -> LoginResponse:
    service = AuthService(db)
    try:
        user = service.authenticate(payload.email, payload.password)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))

    access_token, refresh_token = service.issue_tokens(
        user,
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None,
    )
    _audit(db, ACTION_LOGIN, request, user_id=user.id)

    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=_EXPIRES_IN,
        user=UserOut.model_validate(user),
    )


@router.post("/refresh", response_model=TokenPair)
def refresh(
    payload: RefreshRequest,
    db: Session = Depends(get_db),
) -> TokenPair:
    """Rotate the refresh token and issue a fresh access token."""
    service = AuthService(db)
    try:
        access_token, refresh_token = service.refresh_tokens(payload.refresh_token)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))
    return TokenPair(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=_EXPIRES_IN,
    )


@router.post("/logout", response_model=MessageResponse)
def logout(
    request: Request,
    payload: LogoutRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> MessageResponse:
    """
    Revoke the caller's refresh-token session.

    - Provide ``refresh_token`` to revoke that specific device session.
    - Omit it to revoke **all** sessions for this account.
    """
    AuthService(db).logout(current_user.id, payload.refresh_token)
    _audit(db, ACTION_LOGOUT, request, user_id=current_user.id)
    return MessageResponse(message="Logged out successfully")


@router.post("/change-password", response_model=MessageResponse)
def change_password(
    request: Request,
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> MessageResponse:
    """
    Change the authenticated user's password.

    Enforces the full password policy. On success, clears
    ``must_change_password`` and revokes all existing sessions.
    """
    service = AuthService(db)
    try:
        service.change_password(
            current_user, payload.old_password, payload.new_password
        )
    except PasswordPolicyError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": "Password does not meet policy", "violations": exc.violations},
        )
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    _audit(db, ACTION_PASSWORD_CHANGE, request, user_id=current_user.id)
    return MessageResponse(message="Password changed successfully")


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_active_user)) -> User:
    return current_user


@router.post("/accept-invite", response_model=MessageResponse)
def accept_invite(
    payload: AcceptInviteRequest,
    db: Session = Depends(get_db),
) -> MessageResponse:
    """
    Public endpoint — no auth required.
    Validates the invite token and sets the user's password.
    """
    svc = StaffUserService(db)
    try:
        svc.accept_invite(payload.token, payload.password)
    except StaffUserError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except PasswordPolicyError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": "Password does not meet policy", "violations": exc.violations},
        )
    return MessageResponse(message="Password set successfully. You can now log in.")
