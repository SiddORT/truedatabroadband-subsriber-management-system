"""Staff user invite & management API."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.auth import require_superadmin
from app.models.user import User
from app.schemas.staff_user import StaffUserInvite, StaffUserListResponse, StaffUserOut, StaffUserUpdate
from app.services.staff_user import StaffUserError, StaffUserService
from app.utils.portal import build_portal_url

router = APIRouter(prefix="/staff-users", tags=["staff-users"])


def _to_out(user: User) -> StaffUserOut:
    return StaffUserOut.model_validate(user)


def _get_or_404(user_id: uuid.UUID, db: Session) -> User:
    from app.models.user import UserRole
    from sqlalchemy import select
    user = db.scalars(
        select(User)
        .where(User.id == user_id)
        .where(User.role == UserRole.STAFF)
        .where(User.deleted_at.is_(None))
    ).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff user not found")
    return user


@router.get("", response_model=StaffUserListResponse)
def list_staff_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    search: str | None = Query(None),
    role_id: uuid.UUID | None = Query(None),
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> StaffUserListResponse:
    svc = StaffUserService(db)
    items, total = svc.list_staff(skip=skip, limit=limit, search=search, role_id=role_id)
    return StaffUserListResponse(items=[_to_out(u) for u in items], total=total)


@router.post("", response_model=StaffUserOut, status_code=status.HTTP_201_CREATED)
def invite_staff_user(
    request: Request,
    payload: StaffUserInvite,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> StaffUserOut:
    svc = StaffUserService(db)
    try:
        user = svc.invite(payload, actor_id=current_user.id, base_url=build_portal_url(request))
    except StaffUserError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    return _to_out(user)


@router.get("/{user_id}", response_model=StaffUserOut)
def get_staff_user(
    user_id: uuid.UUID,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> StaffUserOut:
    user = _get_or_404(user_id, db)
    return _to_out(user)


@router.patch("/{user_id}", response_model=StaffUserOut)
def update_staff_user(
    user_id: uuid.UUID,
    payload: StaffUserUpdate,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> StaffUserOut:
    _get_or_404(user_id, db)
    svc = StaffUserService(db)
    try:
        user = svc.update(user_id, payload, actor_id=current_user.id)
    except StaffUserError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return _to_out(user)


@router.post("/{user_id}/resend-invite", response_model=StaffUserOut)
def resend_invite(
    request: Request,
    user_id: uuid.UUID,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> StaffUserOut:
    _get_or_404(user_id, db)
    svc = StaffUserService(db)
    try:
        user = svc.resend_invite(user_id, actor_id=current_user.id, base_url=build_portal_url(request))
    except StaffUserError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return _to_out(user)
