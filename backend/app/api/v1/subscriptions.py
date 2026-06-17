import math
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.auth import require_client, require_superadmin
from app.models.subscription import Subscription
from app.models.user import User
from app.repositories.subscription import SubscriptionRepository
from app.schemas.subscription import (
    SubscriptionChangePlan,
    SubscriptionCreate,
    SubscriptionListResponse,
    SubscriptionOut,
    SubscriptionStatusUpdate,
    SubscriptionUpdate,
)
from app.services.subscription import DuplicateAddressWarning, SubscriptionError, SubscriptionService

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _to_out(sub: Subscription) -> SubscriptionOut:
    out = SubscriptionOut.model_validate(sub)
    out.customer_code = sub.customer.customer_code
    out.customer_name = sub.customer.full_name
    out.customer_email = sub.customer.email
    out.customer_mobile = sub.customer.mobile_number
    out.customer_status = sub.customer.status.value
    return out


def _get_sub_or_404(sub_id: uuid.UUID, db: Session) -> Subscription:
    sub = SubscriptionRepository(db).get(sub_id)
    if sub is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subscription not found",
        )
    return sub


# ---------------------------------------------------------------------------
# SuperAdmin routes
# ---------------------------------------------------------------------------


@router.get("", response_model=SubscriptionListResponse)
def list_subscriptions(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    search: str = Query(""),
    sort_by: str = Query("created_at"),
    sort_order: str = Query("desc"),
    status_filter: str = Query(""),
    _: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> SubscriptionListResponse:
    repo = SubscriptionRepository(db)
    items, total = repo.list_paginated(
        page=page,
        page_size=page_size,
        search=search,
        sort_by=sort_by,
        sort_order=sort_order,
        status_filter=status_filter or None,
    )
    total_pages = math.ceil(total / page_size) if total > 0 else 0
    return SubscriptionListResponse(
        items=[_to_out(s) for s in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.post("", response_model=SubscriptionOut, status_code=status.HTTP_201_CREATED)
def create_subscription(
    request: Request,
    payload: SubscriptionCreate,
    force: bool = Query(False, description="Skip duplicate-address warning and create anyway"),
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> SubscriptionOut:
    svc = SubscriptionService(db)
    try:
        sub = svc.create(
            payload,
            actor_id=current_user.id,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            force=force,
        )
    except DuplicateAddressWarning as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"warning": str(exc), "existing_code": exc.existing_code},
        )
    except SubscriptionError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    return _to_out(sub)


@router.get("/customer/{customer_id}", response_model=list[SubscriptionOut])
def list_customer_subscriptions(
    customer_id: uuid.UUID,
    _: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> list[SubscriptionOut]:
    """All subscriptions for a specific customer (newest first)."""
    subs = SubscriptionRepository(db).list_by_customer(customer_id)
    return [_to_out(s) for s in subs]


@router.get("/mine", response_model=SubscriptionOut)
def get_my_subscription(
    current_user: User = Depends(require_client),
    db: Session = Depends(get_db),
) -> SubscriptionOut:
    """Client portal — returns the caller's active subscription."""
    repo = SubscriptionRepository(db)
    sub = repo.get_by_customer_user(current_user.id)
    if sub is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active subscription found",
        )
    return _to_out(sub)


@router.get("/{sub_id}", response_model=SubscriptionOut)
def get_subscription(
    sub_id: uuid.UUID,
    _: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> SubscriptionOut:
    return _to_out(_get_sub_or_404(sub_id, db))


@router.put("/{sub_id}", response_model=SubscriptionOut)
def update_subscription(
    request: Request,
    sub_id: uuid.UUID,
    payload: SubscriptionUpdate,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> SubscriptionOut:
    sub = _get_sub_or_404(sub_id, db)
    updated = SubscriptionService(db).update(
        sub,
        connection_name=payload.connection_name,
        installation_address=payload.installation_address,
        remarks=payload.remarks,
        actor_id=current_user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    return _to_out(updated)


@router.post("/{sub_id}/renew", response_model=SubscriptionOut)
def renew_subscription(
    request: Request,
    sub_id: uuid.UUID,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> SubscriptionOut:
    sub = _get_sub_or_404(sub_id, db)
    svc = SubscriptionService(db)
    try:
        updated = svc.renew(
            sub,
            actor_id=current_user.id,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    except SubscriptionError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    return _to_out(updated)


@router.patch("/{sub_id}/status", response_model=SubscriptionOut)
def update_subscription_status(
    request: Request,
    sub_id: uuid.UUID,
    payload: SubscriptionStatusUpdate,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> SubscriptionOut:
    sub = _get_sub_or_404(sub_id, db)
    updated = SubscriptionService(db).set_status(
        sub,
        payload.status,
        actor_id=current_user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    return _to_out(updated)


@router.post(
    "/{sub_id}/change-plan",
    response_model=SubscriptionOut,
    status_code=status.HTTP_201_CREATED,
)
def change_plan(
    request: Request,
    sub_id: uuid.UUID,
    payload: SubscriptionChangePlan,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> SubscriptionOut:
    sub = _get_sub_or_404(sub_id, db)
    svc = SubscriptionService(db)
    try:
        new_sub = svc.change_plan(
            sub,
            payload,
            actor_id=current_user.id,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    except SubscriptionError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    return _to_out(new_sub)
