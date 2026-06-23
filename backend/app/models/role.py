"""Role model — named permission sets for STAFF users."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import BaseModelMixin

# All modules that can have per-action permissions
PERMISSION_MODULES = [
    "customers",
    "subscriptions",
    "invoices",
    "payments",
    "plans",
    "reports",
    "support_tickets",
    "users",
    "settings",
    "logs",
    "communications",
    "notifications",
    "scheduled_jobs",
]

# Valid data_scope values
DATA_SCOPE_ALL = "ALL"
DATA_SCOPE_ASSIGNED = "ASSIGNED"
DATA_SCOPE_REFERENCE = "REFERENCE"


def default_permissions() -> dict:
    """Return a permissions dict with all actions set to False."""
    return {
        module: {"view": False, "add": False, "edit": False, "delete": False}
        for module in PERMISSION_MODULES
    }


class Role(Base, BaseModelMixin):
    """A named set of permissions assignable to STAFF users."""

    __tablename__ = "roles"

    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # "ALL" | "ASSIGNED" | "REFERENCE"
    data_scope: Mapped[str] = mapped_column(String(20), nullable=False, default=DATA_SCOPE_ALL)
    # {"customers": {"view": true, "add": true, "edit": false, "delete": false}, ...}
    permissions: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    users: Mapped[list["User"]] = relationship(  # type: ignore[name-defined]
        "User",
        back_populates="staff_role",
        foreign_keys="User.role_id",
        lazy="select",
    )

    def has_permission(self, module: str, action: str) -> bool:
        """Check if this role has a specific permission."""
        if not self.permissions:
            return False
        return bool(self.permissions.get(module, {}).get(action, False))

    def __repr__(self) -> str:
        return f"<Role {self.name} scope={self.data_scope}>"
