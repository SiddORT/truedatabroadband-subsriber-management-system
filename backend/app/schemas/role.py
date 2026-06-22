"""Pydantic schemas for Roles."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, field_validator

from app.models.role import DATA_SCOPE_ALL, DATA_SCOPE_ASSIGNED, DATA_SCOPE_REFERENCE, PERMISSION_MODULES

VALID_SCOPES = {DATA_SCOPE_ALL, DATA_SCOPE_ASSIGNED, DATA_SCOPE_REFERENCE}
VALID_ACTIONS = {"view", "add", "edit", "delete"}


class RolePermissions(BaseModel):
    view: bool = False
    add: bool = False
    edit: bool = False
    delete: bool = False


class RoleCreate(BaseModel):
    name: str
    description: str | None = None
    data_scope: str = DATA_SCOPE_ALL
    permissions: dict[str, Any] | None = None
    is_active: bool = True

    @field_validator("data_scope")
    @classmethod
    def validate_scope(cls, v: str) -> str:
        if v not in VALID_SCOPES:
            raise ValueError(f"data_scope must be one of {sorted(VALID_SCOPES)}")
        return v

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("name cannot be empty")
        return v


class RoleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    data_scope: str | None = None
    permissions: dict[str, Any] | None = None
    is_active: bool | None = None

    @field_validator("data_scope")
    @classmethod
    def validate_scope(cls, v: str | None) -> str | None:
        if v is not None and v not in VALID_SCOPES:
            raise ValueError(f"data_scope must be one of {sorted(VALID_SCOPES)}")
        return v


class RoleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None
    data_scope: str
    permissions: dict[str, Any] | None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    user_count: int = 0


class RoleListResponse(BaseModel):
    items: list[RoleOut]
    total: int
