"""CRUD API for Roles."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.auth import require_superadmin
from app.models.user import User
from app.repositories.role import RoleRepository
from app.schemas.role import RoleCreate, RoleListResponse, RoleOut, RoleUpdate
from app.services.role import RoleError, RoleService

router = APIRouter(prefix="/roles", tags=["roles"])


def _to_out(role: object, db: Session) -> RoleOut:
    out = RoleOut.model_validate(role)
    out.user_count = RoleRepository(db).count_users(role.id)  # type: ignore[attr-defined]
    return out


def _get_or_404(role_id: uuid.UUID, db: Session) -> object:
    from app.models.role import Role
    from sqlalchemy import select
    role = db.scalars(select(Role).where(Role.id == role_id).where(Role.deleted_at.is_(None))).first()
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
    return role


@router.get("", response_model=RoleListResponse)
def list_roles(
    include_inactive: bool = False,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> RoleListResponse:
    svc = RoleService(db)
    roles = svc.list_all(include_inactive=include_inactive)
    items = [_to_out(r, db) for r in roles]
    return RoleListResponse(items=items, total=len(items))


@router.post("", response_model=RoleOut, status_code=status.HTTP_201_CREATED)
def create_role(
    payload: RoleCreate,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> RoleOut:
    svc = RoleService(db)
    try:
        role = svc.create(payload, actor_id=current_user.id)
    except RoleError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    return _to_out(role, db)


@router.get("/{role_id}", response_model=RoleOut)
def get_role(
    role_id: uuid.UUID,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> RoleOut:
    role = _get_or_404(role_id, db)
    return _to_out(role, db)


@router.patch("/{role_id}", response_model=RoleOut)
def update_role(
    role_id: uuid.UUID,
    payload: RoleUpdate,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> RoleOut:
    svc = RoleService(db)
    try:
        role = svc.update(role_id, payload, actor_id=current_user.id)
    except RoleError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    return _to_out(role, db)


@router.delete("/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_role(
    role_id: uuid.UUID,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> Response:
    svc = RoleService(db)
    try:
        svc.delete(role_id, actor_id=current_user.id)
    except RoleError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
