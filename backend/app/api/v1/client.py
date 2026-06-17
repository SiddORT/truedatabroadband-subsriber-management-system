"""Client self-service portal API — /api/v1/client/*

All endpoints require an authenticated CLIENT user.
Ownership is enforced at the query level (customer_id == current_user's customer).
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.auth import require_client
from app.models.audit_log import (
    ACTION_CLIENT_LOGOUT_ALL,
    ACTION_CLIENT_PROFILE_UPDATED,
    ACTION_CLIENT_SESSION_REVOKED,
    ACTION_CLIENT_UNAUTHORIZED_ACCESS,
)
from app.models.user import User
from app.repositories.audit_log import AuditLogRepository
from app.repositories.customer import CustomerRepository
from app.repositories.refresh_token import RefreshTokenRepository
from app.schemas.client import (
    ClientProfileOut,
    ClientProfileUpdate,
    RevokeSessionRequest,
    SessionOut,
)
from app.schemas.auth import MessageResponse

router = APIRouter(prefix="/client", tags=["client"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _audit(db: Session, action: str, request: Request, *, user_id: object = None) -> None:
    AuditLogRepository(db).log(
        action,
        user_id=user_id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )


def _get_customer_or_403(user: User, db: Session, request: Request):
    """Return the Customer linked to this CLIENT user, or raise 403."""
    customer = CustomerRepository(db).get_by_user_id(user.id)
    if customer is None:
        _audit(db, ACTION_CLIENT_UNAUTHORIZED_ACCESS, request, user_id=user.id)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No customer account is linked to this login.",
        )
    return customer


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------


@router.get("/profile", response_model=ClientProfileOut)
def get_profile(
    request: Request,
    current_user: User = Depends(require_client),
    db: Session = Depends(get_db),
) -> ClientProfileOut:
    customer = _get_customer_or_403(current_user, db, request)
    conn_date = customer.connection_date.isoformat() if customer.connection_date else None
    return ClientProfileOut(
        customer_code=customer.customer_code,
        full_name=customer.full_name,
        customer_type=customer.customer_type.value,
        email=customer.email,
        mobile_number=customer.mobile_number,
        alternate_mobile_number=customer.alternate_mobile_number,
        installation_address=customer.installation_address,
        city=customer.city,
        state=customer.state,
        pincode=customer.pincode,
        status=customer.status.value,
        connection_date=conn_date,
        created_at=customer.created_at,
    )


@router.put("/profile", response_model=ClientProfileOut)
def update_profile(
    payload: ClientProfileUpdate,
    request: Request,
    current_user: User = Depends(require_client),
    db: Session = Depends(get_db),
) -> ClientProfileOut:
    customer = _get_customer_or_403(current_user, db, request)

    changed: dict = {}
    if payload.alternate_mobile_number is not None:
        changed["alternate_mobile_number"] = payload.alternate_mobile_number
        customer.alternate_mobile_number = payload.alternate_mobile_number or None

    if changed:
        db.commit()
        db.refresh(customer)
        _audit(
            db,
            ACTION_CLIENT_PROFILE_UPDATED,
            request,
            user_id=current_user.id,
        )

    conn_date = customer.connection_date.isoformat() if customer.connection_date else None
    return ClientProfileOut(
        customer_code=customer.customer_code,
        full_name=customer.full_name,
        customer_type=customer.customer_type.value,
        email=customer.email,
        mobile_number=customer.mobile_number,
        alternate_mobile_number=customer.alternate_mobile_number,
        installation_address=customer.installation_address,
        city=customer.city,
        state=customer.state,
        pincode=customer.pincode,
        status=customer.status.value,
        connection_date=conn_date,
        created_at=customer.created_at,
    )


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------


def _parse_ua(ua: str | None) -> tuple[str, str]:
    """Very light UA parse — returns (browser_hint, os_hint)."""
    if not ua:
        return "Unknown browser", "Unknown OS"
    ua_lower = ua.lower()

    browser = "Unknown browser"
    for name, token in [
        ("Chrome", "chrome"),
        ("Firefox", "firefox"),
        ("Safari", "safari"),
        ("Edge", "edg"),
        ("Opera", "opr"),
    ]:
        if token in ua_lower:
            browser = name
            break

    os_name = "Unknown OS"
    for name, token in [
        ("Windows", "windows"),
        ("macOS", "mac os"),
        ("Linux", "linux"),
        ("Android", "android"),
        ("iOS", "iphone"),
        ("iOS", "ipad"),
    ]:
        if token in ua_lower:
            os_name = name
            break

    return browser, os_name


@router.get("/sessions", response_model=list[SessionOut])
def list_sessions(
    request: Request,
    current_user: User = Depends(require_client),
    db: Session = Depends(get_db),
) -> list[SessionOut]:
    _get_customer_or_403(current_user, db, request)

    repo = RefreshTokenRepository(db)
    tokens = repo.list_active_for_user(current_user.id)

    # Identify current session by matching the Bearer token's jti
    from app.core.security import decode_token
    try:
        auth_header = request.headers.get("authorization", "")
        raw_token = auth_header.removeprefix("Bearer ").strip()
        payload = decode_token(raw_token)
        current_jti = uuid.UUID(payload["jti"]) if "jti" in payload else None
    except Exception:
        current_jti = None

    out = []
    for t in tokens:
        out.append(
            SessionOut(
                id=t.id,
                jti=t.jti,
                user_agent=t.user_agent,
                ip_address=t.ip_address,
                created_at=t.created_at,
                expires_at=t.expires_at,
                is_current=(current_jti is not None and t.jti == current_jti),
            )
        )
    return out


@router.post("/logout-all", response_model=MessageResponse)
def logout_all(
    request: Request,
    current_user: User = Depends(require_client),
    db: Session = Depends(get_db),
) -> MessageResponse:
    _get_customer_or_403(current_user, db, request)
    RefreshTokenRepository(db).revoke_all_for_user(current_user.id)
    _audit(db, ACTION_CLIENT_LOGOUT_ALL, request, user_id=current_user.id)
    return MessageResponse(message="All sessions have been revoked.")


@router.post("/sessions/revoke", response_model=MessageResponse)
def revoke_session(
    payload: RevokeSessionRequest,
    request: Request,
    current_user: User = Depends(require_client),
    db: Session = Depends(get_db),
) -> MessageResponse:
    _get_customer_or_403(current_user, db, request)

    repo = RefreshTokenRepository(db)
    token = repo.get_by_jti(payload.jti)
    if token is None or token.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found.",
        )

    repo.revoke_by_jti(payload.jti)
    _audit(db, ACTION_CLIENT_SESSION_REVOKED, request, user_id=current_user.id)
    return MessageResponse(message="Session revoked successfully.")
