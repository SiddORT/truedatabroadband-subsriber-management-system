from fastapi import APIRouter, Depends

from app.dependencies.auth import require_superadmin
from app.models.user import User

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/test")
def admin_test(current_user: User = Depends(require_superadmin)) -> dict:
    """
    SUPERADMIN-only test endpoint.

    Returns 200 for SUPERADMIN; 403 for any other authenticated role;
    401 for unauthenticated requests.
    """
    return {
        "message": "Admin access granted",
        "user_id": str(current_user.id),
        "email": current_user.email,
        "role": current_user.role,
    }
