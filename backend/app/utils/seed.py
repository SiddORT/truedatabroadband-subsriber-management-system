from app.core.config import settings
from app.core.database import SessionLocal
from app.core.logging import get_logger
from app.core.security import hash_password
from app.models.user import User, UserRole
from app.repositories.user import UserRepository

logger = get_logger(__name__)


def seed_superadmin() -> None:
    """Create the default SUPERADMIN user if it does not already exist."""
    db = SessionLocal()
    try:
        users = UserRepository(db)
        email = settings.SEED_ADMIN_EMAIL.lower()
        existing = users.get_by_email(email, include_deleted=True)
        if existing is not None:
            logger.info("seed.superadmin.exists", email=email)
            return

        user = User(
            email=email,
            password_hash=hash_password(settings.SEED_ADMIN_PASSWORD),
            role=UserRole.SUPERADMIN,
            is_active=True,
            must_change_password=False,
        )
        users.add(user)
        logger.info("seed.superadmin.created", email=email)
    finally:
        db.close()


if __name__ == "__main__":
    seed_superadmin()
