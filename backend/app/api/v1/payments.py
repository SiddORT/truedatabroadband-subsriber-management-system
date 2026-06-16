"""Payments API — SuperAdmin only + client read-only."""

from __future__ import annotations

import math
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.auth import require_client, require_superadmin
from app.models.user import User
from app.repositories.payment import PaymentRepository
from app.schemas.payment import PaymentCreate, PaymentListResponse, PaymentOut
from app.services.payment import PaymentError, PaymentService

router = APIRouter(prefix="/payments", tags=["payments"])


# ── Admin: list ───────────────────────────────────────────────────────────────

@router.get("", response_model=PaymentListResponse)
def list_payments(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    search: str = Query(""),
    sort_by: str = Query("payment_date"),
    sort_order: str = Query("desc"),
    invoice_id: uuid.UUID | None = Query(None),
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> PaymentListResponse:
    repo = PaymentRepository(db)
    items, total = repo.list_paginated(
        page=page,
        page_size=page_size,
        search=search,
        sort_by=sort_by,
        sort_order=sort_order,
        invoice_id=invoice_id,
    )
    return PaymentListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total / page_size) if total else 0,
    )


# ── Admin: create ─────────────────────────────────────────────────────────────

@router.post("", response_model=PaymentOut, status_code=status.HTTP_201_CREATED)
def record_payment(
    payload: PaymentCreate,
    request: Request,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> PaymentOut:
    svc = PaymentService(db)
    try:
        payment = svc.record(
            payload,
            actor_id=current_user.id,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    except PaymentError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return PaymentOut.model_validate(payment)


# ── Admin: get ────────────────────────────────────────────────────────────────

@router.get("/{payment_id}", response_model=PaymentOut)
def get_payment(
    payment_id: uuid.UUID,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> PaymentOut:
    payment = PaymentRepository(db).get(payment_id)
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
    return PaymentOut.model_validate(payment)


# ── Client: list own payments ─────────────────────────────────────────────────

@router.get("/client/my", response_model=PaymentListResponse)
def client_list_payments(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    current_user: User = Depends(require_client),
    db: Session = Depends(get_db),
) -> PaymentListResponse:
    repo = PaymentRepository(db)
    items, total = repo.list_paginated_by_user(current_user.id, page=page, page_size=page_size)
    return PaymentListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total / page_size) if total else 0,
    )
