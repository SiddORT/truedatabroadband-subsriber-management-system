from fastapi import APIRouter, Depends

from app.dependencies.auth import require_client
from app.models.user import User

router = APIRouter(prefix="/client", tags=["client"])


@router.get("/test")
def client_test(current_user: User = Depends(require_client)) -> dict:
    """
    CLIENT-only test endpoint.

    Returns 200 for CLIENT; 403 for any other authenticated role;
    401 for unauthenticated requests.
    """
    return {
        "message": "Client access granted",
        "user_id": str(current_user.id),
        "email": current_user.email,
        "role": current_user.role,
    }
