"""Pydantic schemas for Staff Users."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator

from app.schemas.role import RoleOut


class StaffUserInvite(BaseModel):
    email: str
    display_name: str
    role_id: uuid.UUID

    @field_validator("display_name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("display_name cannot be empty")
        return v

    @field_validator("email")
    @classmethod
    def lower_email(cls, v: str) -> str:
        return v.strip().lower()


class StaffUserUpdate(BaseModel):
    display_name: str | None = None
    email: str | None = None
    role_id: uuid.UUID | None = None
    is_active: bool | None = None

    @field_validator("email", mode="before")
    @classmethod
    def lower_email(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None
        return v.strip().lower()


class AcceptInviteRequest(BaseModel):
    token: str
    password: str
    confirm_password: str

    @field_validator("confirm_password")
    @classmethod
    def passwords_match(cls, v: str, info: object) -> str:
        data = getattr(info, "data", {})
        if "password" in data and v != data["password"]:
            raise ValueError("Passwords do not match")
        return v


class StaffUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    display_name: str | None
    role_id: uuid.UUID | None
    is_active: bool
    invite_status: str
    invite_accepted_at: datetime | None
    last_login_at: datetime | None
    created_at: datetime
    updated_at: datetime
    staff_role: RoleOut | None = None


class StaffUserListResponse(BaseModel):
    items: list[StaffUserOut]
    total: int
