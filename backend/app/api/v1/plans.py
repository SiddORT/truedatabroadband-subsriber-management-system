import math
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.auth import require_superadmin
from app.models.plan import Plan, PlanPricing
from app.models.user import User
from app.repositories.plan import PlanRepository
from app.schemas.plan import (
    PlanCreate,
    PlanListResponse,
    PlanOut,
    PlanStatusUpdate,
    PlanUpdate,
    PricingCreate,
    PricingOut,
    PricingUpdate,
)
from app.services.plan import PlanError, PlanService

router = APIRouter(prefix="/plans", tags=["plans"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _to_out(plan: Plan, active_subscription_count: int = 0) -> PlanOut:
    active_pricing = [p for p in plan.pricing if p.deleted_at is None]
    out = PlanOut.model_validate(plan)
    out.pricing = [PricingOut.model_validate(p) for p in active_pricing]
    out.active_pricing_count = sum(1 for p in active_pricing if p.is_active)
    out.active_subscription_count = active_subscription_count
    return out


def _get_plan_or_404(plan_id: uuid.UUID, db: Session) -> Plan:
    plan = PlanRepository(db).get(plan_id)
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
    return plan


def _get_pricing_or_404(plan_id: uuid.UUID, pricing_id: uuid.UUID, db: Session) -> PlanPricing:
    pricing = PlanRepository(db).get_pricing(plan_id, pricing_id)
    if pricing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Pricing row not found"
        )
    return pricing


# ---------------------------------------------------------------------------
# Plan routes
# ---------------------------------------------------------------------------


@router.get("", response_model=PlanListResponse)
def list_plans(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    search: str = Query(""),
    sort_by: str = Query("created_at"),
    sort_order: str = Query("desc"),
    data_policy: str | None = Query(None),
    speed_min: int | None = Query(None, ge=0),
    speed_max: int | None = Query(None, ge=0),
    is_active: bool | None = Query(None),
    _: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> PlanListResponse:
    from app.models.plan import DataPolicy as DP
    dp_filter = None
    if data_policy:
        try:
            dp_filter = DP(data_policy)
        except ValueError:
            pass
    repo = PlanRepository(db)
    items, total = repo.list_paginated(
        page=page,
        page_size=page_size,
        search=search,
        sort_by=sort_by,
        sort_order=sort_order,
        data_policy=dp_filter,
        speed_min=speed_min,
        speed_max=speed_max,
        is_active=is_active,
    )
    total_pages = math.ceil(total / page_size) if total > 0 else 0
    # Batch fetch active subscription counts
    plan_ids = [p.id for p in items]
    counts = repo.get_active_subscription_counts(plan_ids)
    return PlanListResponse(
        items=[_to_out(p, counts.get(p.id, 0)) for p in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.post("", response_model=PlanOut, status_code=status.HTTP_201_CREATED)
def create_plan(
    request: Request,
    payload: PlanCreate,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> PlanOut:
    svc = PlanService(db)
    try:
        plan = svc.create(
            payload,
            actor_id=current_user.id,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    except PlanError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    return _to_out(plan)


@router.get("/{plan_id}", response_model=PlanOut)
def get_plan(
    plan_id: uuid.UUID,
    _: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> PlanOut:
    return _to_out(_get_plan_or_404(plan_id, db))


@router.put("/{plan_id}", response_model=PlanOut)
def update_plan(
    request: Request,
    plan_id: uuid.UUID,
    payload: PlanUpdate,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> PlanOut:
    plan = _get_plan_or_404(plan_id, db)
    updated = PlanService(db).update(
        plan,
        payload,
        actor_id=current_user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    return _to_out(updated)


@router.patch("/{plan_id}/status", response_model=PlanOut)
def update_plan_status(
    request: Request,
    plan_id: uuid.UUID,
    payload: PlanStatusUpdate,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> PlanOut:
    plan = _get_plan_or_404(plan_id, db)
    updated = PlanService(db).set_status(
        plan,
        payload.is_active,
        actor_id=current_user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    return _to_out(updated)


# ---------------------------------------------------------------------------
# Pricing routes
# ---------------------------------------------------------------------------


@router.post("/{plan_id}/pricing", response_model=PricingOut, status_code=status.HTTP_201_CREATED)
def add_pricing(
    request: Request,
    plan_id: uuid.UUID,
    payload: PricingCreate,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> PricingOut:
    plan = _get_plan_or_404(plan_id, db)
    svc = PlanService(db)
    try:
        pricing = svc.add_pricing(
            plan,
            payload,
            actor_id=current_user.id,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    except PlanError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    return PricingOut.model_validate(pricing)


@router.put("/{plan_id}/pricing/{pricing_id}", response_model=PricingOut)
def update_pricing(
    request: Request,
    plan_id: uuid.UUID,
    pricing_id: uuid.UUID,
    payload: PricingUpdate,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> PricingOut:
    pricing = _get_pricing_or_404(plan_id, pricing_id, db)
    updated = PlanService(db).update_pricing(
        pricing,
        payload,
        actor_id=current_user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    return PricingOut.model_validate(updated)


@router.delete("/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_plan(
    request: Request,
    plan_id: uuid.UUID,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> None:
    plan = _get_plan_or_404(plan_id, db)
    PlanService(db).delete(
        plan,
        actor_id=current_user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )


@router.delete("/{plan_id}/pricing/{pricing_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_pricing(
    request: Request,
    plan_id: uuid.UUID,
    pricing_id: uuid.UUID,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> None:
    pricing = _get_pricing_or_404(plan_id, pricing_id, db)
    PlanService(db).delete_pricing(
        pricing,
        actor_id=current_user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
