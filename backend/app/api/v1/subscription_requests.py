import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.auth import require_superadmin
from app.models.customer import Customer
from app.models.plan import Plan, PlanPricing
from app.models.plan_change_request import PlanChangeRequest, PlanChangeRequestStatus
from app.models.renewal_request import RenewalRequest, RenewalRequestStatus
from app.models.subscription import Subscription
from app.models.user import User
from app.schemas.subscription import SubscriptionChangePlan, SubscriptionCreate
from app.services.notifications.notification_service import NotificationService, Recipient
from app.services.subscription import SubscriptionError, SubscriptionService

router = APIRouter(prefix="/subscription-requests", tags=["subscription-requests"])


class ReviewPayload(BaseModel):
    review_notes: str | None = None


class ApproveRenewalPayload(ReviewPayload):
    start_date: date | None = None
    connection_name: str | None = None
    installation_address: str | None = None
    remarks: str | None = None


class RenewalPreviewOut(BaseModel):
    plan_name: str
    billing_cycle: str
    total_price: Decimal
    start_date: date
    connection_name: str | None
    installation_address: str | None
    remarks: str | None
    current_expiry_date: date


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
    new_subscription_code: str | None = None
    renewal_start_date: date | None = None
    renewal_end_date: date | None = None


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


def _build_renewal_out(
    req: RenewalRequest,
    sub: Subscription,
    cust: Customer,
    new_sub: Subscription | None = None,
) -> RenewalRequestOut:
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
        new_subscription_code=new_sub.subscription_code if new_sub else None,
        renewal_start_date=new_sub.start_date if new_sub else None,
        renewal_end_date=new_sub.expiry_date if new_sub else None,
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


def _get_renewal_pricing(
    db: Session,
    sub: Subscription,
    requested_billing_cycle: str,
) -> PlanPricing:
    pricing = (
        db.query(PlanPricing)
        .filter(
            PlanPricing.plan_id == sub.plan_id,
            PlanPricing.billing_cycle == requested_billing_cycle,
            PlanPricing.deleted_at.is_(None),
            PlanPricing.is_active.is_(True),
        )
        .first()
    )
    if pricing is None:
        raise HTTPException(
            status_code=409,
            detail=f"No active pricing found for billing cycle '{requested_billing_cycle}' on the current plan.",
        )
    return pricing


@router.get("/renewal/{request_id}/preview", response_model=RenewalPreviewOut)
def preview_renewal(
    request_id: uuid.UUID,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> RenewalPreviewOut:
    req = db.get(RenewalRequest, request_id)
    if not req or req.deleted_at:
        raise HTTPException(status_code=404, detail="Request not found.")
    if req.status != RenewalRequestStatus.PENDING:
        raise HTTPException(status_code=409, detail="Only PENDING requests can be previewed.")

    sub = db.get(Subscription, req.subscription_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found.")

    pricing = _get_renewal_pricing(db, sub, req.requested_billing_cycle)
    plan = db.get(Plan, sub.plan_id)

    return RenewalPreviewOut(
        plan_name=plan.name if plan else sub.plan_name_snapshot,
        billing_cycle=req.requested_billing_cycle,
        total_price=pricing.total_price,
        start_date=sub.expiry_date + timedelta(days=1),
        connection_name=sub.connection_name,
        installation_address=sub.installation_address,
        remarks=sub.remarks,
        current_expiry_date=sub.expiry_date,
    )


@router.post("/renewal/{request_id}/approve", response_model=RenewalRequestOut)
def approve_renewal(
    request_id: uuid.UUID,
    payload: ApproveRenewalPayload,
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

    pricing = _get_renewal_pricing(db, sub, req.requested_billing_cycle)

    # Allow admin overrides; fall back to values from the expiring subscription
    new_start = payload.start_date if payload.start_date else sub.expiry_date + timedelta(days=1)
    create_payload = SubscriptionCreate(
        customer_id=req.customer_id,
        plan_pricing_id=pricing.id,
        start_date=new_start,
        connection_name=payload.connection_name if payload.connection_name is not None else sub.connection_name,
        installation_address=payload.installation_address if payload.installation_address is not None else sub.installation_address,
        remarks=payload.remarks if payload.remarks is not None else sub.remarks,
    )
    try:
        new_sub = SubscriptionService(db).create(
            create_payload,
            actor_id=current_user.id,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            force=True,
        )
    except SubscriptionError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    req.status = RenewalRequestStatus.APPROVED
    req.reviewed_by_user_id = current_user.id
    req.review_notes = payload.review_notes
    req.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(req)
    return _build_renewal_out(req, sub, cust, new_sub)


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
    request: Request,
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

    # Find pricing for the requested plan matching the current subscription's billing cycle
    pricing = (
        db.query(PlanPricing)
        .filter(
            PlanPricing.plan_id == req.requested_plan_id,
            PlanPricing.billing_cycle == sub.billing_cycle_snapshot,
            PlanPricing.deleted_at.is_(None),
            PlanPricing.is_active.is_(True),
        )
        .first()
    )
    if pricing is None:
        # Fallback: any active pricing for the requested plan
        pricing = (
            db.query(PlanPricing)
            .filter(
                PlanPricing.plan_id == req.requested_plan_id,
                PlanPricing.deleted_at.is_(None),
                PlanPricing.is_active.is_(True),
            )
            .first()
        )
    if pricing is None:
        raise HTTPException(
            status_code=409,
            detail="No active pricing found for the requested plan. Cannot execute plan change.",
        )

    # Execute the plan change — cancels current sub and creates new one
    change_payload = SubscriptionChangePlan(
        plan_pricing_id=pricing.id,
        start_date=date.today(),
    )
    try:
        SubscriptionService(db).change_plan(
            sub,
            change_payload,
            actor_id=current_user.id,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    except SubscriptionError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    # Notify customer via PLAN_CHANGED template (fire-and-forget)
    try:
        NotificationService(db).send(
            template_key="PLAN_CHANGED",
            recipient=Recipient(email=cust.email),
            variables={
                "customer_name": cust.full_name,
                "old_plan_name": current_plan.name if current_plan else sub.plan_name_snapshot,
                "new_plan_name": requested_plan.name if requested_plan else "New Plan",
            },
            customer_id=cust.id,
        )
    except Exception:
        pass

    req.status = PlanChangeRequestStatus.APPROVED
    req.reviewed_by_user_id = current_user.id
    req.review_notes = payload.review_notes
    req.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(req)
    # sub is now cancelled; return request info with the recorded plan names
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
