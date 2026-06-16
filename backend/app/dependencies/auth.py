import uuid
from collections.abc import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import ACCESS_TOKEN_TYPE, JWTError, decode_token
from app.core.database import get_db
from app.models.user import User, UserRole
from app.repositories.user import UserRepository

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_PREFIX}/auth/login",
    auto_error=True,
)

_credentials_exc = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    try:
        payload = decode_token(token)
    except JWTError:
        raise _credentials_exc

    if payload.get("type") != ACCESS_TOKEN_TYPE:
        raise _credentials_exc

    subject = payload.get("sub")
    if subject is None:
        raise _credentials_exc

    try:
        user_id = uuid.UUID(subject)
    except (ValueError, TypeError):
        raise _credentials_exc

    user = UserRepository(db).get(user_id)
    if user is None:
        raise _credentials_exc
    return user


def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user",
        )
    return current_user


def require_roles(*roles: UserRole) -> Callable[[User], User]:
    """Dependency factory enforcing one of the given roles."""

    def _dependency(
        current_user: User = Depends(get_current_active_user),
    ) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return current_user

    return _dependency


require_superadmin = require_roles(UserRole.SUPERADMIN)
require_client = require_roles(UserRole.CLIENT)
