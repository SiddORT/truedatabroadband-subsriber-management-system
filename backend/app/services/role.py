"""Role management service."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.models.audit_log import ACTION_ROLE_CREATED, ACTION_ROLE_DELETED, ACTION_ROLE_UPDATED
from app.models.role import Role, default_permissions
from app.repositories.audit_log import AuditLogRepository
from app.repositories.role import RoleRepository
from app.schemas.role import RoleCreate, RoleUpdate


class RoleError(Exception):
    pass


class RoleService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = RoleRepository(db)
        self.audit = AuditLogRepository(db)

    def create(self, payload: RoleCreate, *, actor_id: uuid.UUID) -> Role:
        if self.repo.get_by_name(payload.name):
            raise RoleError(f"A role named '{payload.name}' already exists")
        role = Role(
            name=payload.name.strip(),
            description=payload.description,
            data_scope=payload.data_scope,
            permissions=payload.permissions or default_permissions(),
            is_active=payload.is_active,
        )
        role = self.repo.add(role)
        self.audit.log(ACTION_ROLE_CREATED, user_id=actor_id)
        return role

    def update(self, role_id: uuid.UUID, payload: RoleUpdate, *, actor_id: uuid.UUID) -> Role:
        role = self.repo.get(role_id)
        if role is None:
            raise RoleError("Role not found")
        if payload.name is not None:
            existing = self.repo.get_by_name(payload.name.strip())
            if existing and existing.id != role_id:
                raise RoleError(f"A role named '{payload.name}' already exists")
            role.name = payload.name.strip()
        if payload.description is not None:
            role.description = payload.description
        if payload.data_scope is not None:
            role.data_scope = payload.data_scope
        if payload.permissions is not None:
            role.permissions = payload.permissions
        if payload.is_active is not None:
            role.is_active = payload.is_active
        role = self.repo.update(role)
        self.audit.log(ACTION_ROLE_UPDATED, user_id=actor_id)
        return role

    def delete(self, role_id: uuid.UUID, *, actor_id: uuid.UUID) -> None:
        role = self.repo.get(role_id)
        if role is None:
            raise RoleError("Role not found")
        if self.repo.count_users(role_id) > 0:
            raise RoleError("Cannot delete a role that has active staff users assigned")
        self.repo.soft_delete(role)
        self.audit.log(ACTION_ROLE_DELETED, user_id=actor_id)

    def get_or_404(self, role_id: uuid.UUID) -> Role:
        role = self.repo.get(role_id)
        if role is None:
            raise RoleError("Role not found")
        return role

    def list_all(self, *, include_inactive: bool = False) -> list[Role]:
        return self.repo.list_all(include_inactive=include_inactive)
