import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.auth import require_superadmin
from app.models.customer import Customer
from app.models.plan import Plan
from app.models.plan_change_request import PlanChangeRequest, PlanChangeRequestStatus
from app.models.renewal_request import RenewalRequest, RenewalRequestStatus
from app.models.subscription import Subscription
from app.models.user import User
from app.services.subscription import SubscriptionError, SubscriptionService

router = APIRouter(prefix="/subscription-requests", tags=["subscription-requests"])


class ReviewPayload(BaseModel):
    review_notes: str | None = None


class RenewalRequestOut(BaseModel):
    id: uuid.UUID
    status: RenewalRequestStatus
    subscription_id: uuid.UUID
    subscription_code: str
    connection_name: str | None
    customer_id: uuid.UUID
    customer_name: str
    customer_code: str
    requested_billing_cycle: str
    remarks: str | None
    review_notes: str | None
    reviewed_at: datetime | None
    created_at: datetime


class PlanChangeRequestOut(BaseModel):
    id: uuid.UUID
    status: PlanChangeRequestStatus
    subscription_id: uuid.UUID
    subscription_code: str
    connection_name: str | None
    customer_id: uuid.UUID
    customer_name: str
    customer_code: str
    current_plan_id: uuid.UUID
    current_plan_name: str
    requested_plan_id: uuid.UUID
    requested_plan_name: str
    remarks: str | None
    review_notes: str | None
    reviewed_at: datetime | None
    created_at: datetime


def _build_renewal_out(req: RenewalRequest, sub: Subscription, cust: Customer) -> RenewalRequestOut:
    return RenewalRequestOut(
        id=req.id,
        status=req.status,
        subscription_id=req.subscription_id,
        subscription_code=sub.subscription_code,
        connection_name=sub.connection_name,
        customer_id=req.customer_id,
        customer_name=cust.full_name,
        customer_code=cust.customer_code,
        requested_billing_cycle=req.requested_billing_cycle,
        remarks=req.remarks,
        review_notes=req.review_notes,
        reviewed_at=req.reviewed_at,
        created_at=req.created_at,
    )


def _build_plan_change_out(
    req: PlanChangeRequest,
    sub: Subscription,
    cust: Customer,
    current_plan: Plan | None,
    requested_plan: Plan | None,
) -> PlanChangeRequestOut:
    return PlanChangeRequestOut(
        id=req.id,
        status=req.status,
        subscription_id=req.subscription_id,
        subscription_code=sub.subscription_code,
        connection_name=sub.connection_name,
        customer_id=req.customer_id,
        customer_name=cust.full_name,
        customer_code=cust.customer_code,
        current_plan_id=req.current_plan_id,
        current_plan_name=current_plan.name if current_plan else "Unknown",
        requested_plan_id=req.requested_plan_id,
        requested_plan_name=requested_plan.name if requested_plan else "Unknown",
        remarks=req.remarks,
        review_notes=req.review_notes,
        reviewed_at=req.reviewed_at,
        created_at=req.created_at,
    )


# ── Renewal requests ──────────────────────────────────────────────────────────

@router.get("/renewal", response_model=list[RenewalRequestOut])
def list_renewal_requests(
    status_filter: str | None = Query(None, alias="status"),
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> list[RenewalRequestOut]:
    q = db.query(RenewalRequest).filter(RenewalRequest.deleted_at.is_(None))
    if status_filter:
        try:
            q = q.filter(RenewalRequest.status == RenewalRequestStatus(status_filter))
        except ValueError:
            pass
    rows = q.order_by(RenewalRequest.created_at.desc()).all()

    result = []
    for req in rows:
        sub = db.get(Subscription, req.subscription_id)
        cust = db.get(Customer, req.customer_id)
        if sub and cust:
            result.append(_build_renewal_out(req, sub, cust))
    return result


@router.post("/renewal/{request_id}/approve", response_model=RenewalRequestOut)
def approve_renewal(
    request_id: uuid.UUID,
    payload: ReviewPayload,
    request: Request,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> RenewalRequestOut:
    req = db.get(RenewalRequest, request_id)
    if not req or req.deleted_at:
        raise HTTPException(status_code=404, detail="Request not found.")
    if req.status != RenewalRequestStatus.PENDING:
        raise HTTPException(status_code=409, detail="Only PENDING requests can be approved.")

    sub = db.get(Subscription, req.subscription_id)
    cust = db.get(Customer, req.customer_id)
    if not sub or not cust:
        raise HTTPException(status_code=404, detail="Subscription or customer not found.")

    try:
        SubscriptionService(db).renew(
            sub,
            actor_id=current_user.id,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    except SubscriptionError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    req.status = RenewalRequestStatus.APPROVED
    req.reviewed_by_user_id = current_user.id
    req.review_notes = payload.review_notes
    req.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(req)
    db.refresh(sub)
    return _build_renewal_out(req, sub, cust)


@router.post("/renewal/{request_id}/reject", response_model=RenewalRequestOut)
def reject_renewal(
    request_id: uuid.UUID,
    payload: ReviewPayload,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> RenewalRequestOut:
    req = db.get(RenewalRequest, request_id)
    if not req or req.deleted_at:
        raise HTTPException(status_code=404, detail="Request not found.")
    if req.status != RenewalRequestStatus.PENDING:
        raise HTTPException(status_code=409, detail="Only PENDING requests can be rejected.")

    sub = db.get(Subscription, req.subscription_id)
    cust = db.get(Customer, req.customer_id)
    if not sub or not cust:
        raise HTTPException(status_code=404, detail="Subscription or customer not found.")

    req.status = RenewalRequestStatus.REJECTED
    req.reviewed_by_user_id = current_user.id
    req.review_notes = payload.review_notes
    req.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(req)
    return _build_renewal_out(req, sub, cust)


# ── Plan-change requests ──────────────────────────────────────────────────────

@router.get("/plan-change", response_model=list[PlanChangeRequestOut])
def list_plan_change_requests(
    status_filter: str | None = Query(None, alias="status"),
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> list[PlanChangeRequestOut]:
    q = db.query(PlanChangeRequest).filter(PlanChangeRequest.deleted_at.is_(None))
    if status_filter:
        try:
            q = q.filter(PlanChangeRequest.status == PlanChangeRequestStatus(status_filter))
        except ValueError:
            pass
    rows = q.order_by(PlanChangeRequest.created_at.desc()).all()

    result = []
    for req in rows:
        sub = db.get(Subscription, req.subscription_id)
        cust = db.get(Customer, req.customer_id)
        if sub and cust:
            current_plan = db.get(Plan, req.current_plan_id)
            requested_plan = db.get(Plan, req.requested_plan_id)
            result.append(_build_plan_change_out(req, sub, cust, current_plan, requested_plan))
    return result


@router.post("/plan-change/{request_id}/approve", response_model=PlanChangeRequestOut)
def approve_plan_change(
    request_id: uuid.UUID,
    payload: ReviewPayload,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> PlanChangeRequestOut:
    req = db.get(PlanChangeRequest, request_id)
    if not req or req.deleted_at:
        raise HTTPException(status_code=404, detail="Request not found.")
    if req.status != PlanChangeRequestStatus.PENDING:
        raise HTTPException(status_code=409, detail="Only PENDING requests can be approved.")

    sub = db.get(Subscription, req.subscription_id)
    cust = db.get(Customer, req.customer_id)
    if not sub or not cust:
        raise HTTPException(status_code=404, detail="Subscription or customer not found.")

    current_plan = db.get(Plan, req.current_plan_id)
    requested_plan = db.get(Plan, req.requested_plan_id)

    req.status = PlanChangeRequestStatus.APPROVED
    req.reviewed_by_user_id = current_user.id
    req.review_notes = payload.review_notes
    req.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(req)
    return _build_plan_change_out(req, sub, cust, current_plan, requested_plan)


@router.post("/plan-change/{request_id}/reject", response_model=PlanChangeRequestOut)
def reject_plan_change(
    request_id: uuid.UUID,
    payload: ReviewPayload,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> PlanChangeRequestOut:
    req = db.get(PlanChangeRequest, request_id)
    if not req or req.deleted_at:
        raise HTTPException(status_code=404, detail="Request not found.")
    if req.status != PlanChangeRequestStatus.PENDING:
        raise HTTPException(status_code=409, detail="Only PENDING requests can be rejected.")

    sub = db.get(Subscription, req.subscription_id)
    cust = db.get(Customer, req.customer_id)
    if not sub or not cust:
        raise HTTPException(status_code=404, detail="Subscription or customer not found.")

    current_plan = db.get(Plan, req.current_plan_id)
    requested_plan = db.get(Plan, req.requested_plan_id)

    req.status = PlanChangeRequestStatus.REJECTED
    req.reviewed_by_user_id = current_user.id
    req.review_notes = payload.review_notes
    req.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(req)
    return _build_plan_change_out(req, sub, cust, current_plan, requested_plan)
