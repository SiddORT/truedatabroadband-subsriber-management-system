import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.user import UserRole


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    role: UserRole
    is_active: bool
    must_change_password: bool
    last_login_at: datetime | None
    created_at: datetime
    updated_at: datetime
    # Staff fields (null for SUPERADMIN / CLIENT)
    display_name: str | None = None
    role_id: uuid.UUID | None = None
    invite_status: str | None = None
