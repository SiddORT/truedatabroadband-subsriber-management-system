"""Invoice API — SuperAdmin only (+ client read-only endpoints)."""

from __future__ import annotations

import math
import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.auth import require_client, require_superadmin
from app.models.user import User
from app.repositories.invoice import InvoiceRepository
from app.repositories.payment import PaymentRepository
from app.schemas.invoice import (
    ConsolidatedInvoiceCreate,
    InvoiceCreate,
    InvoiceListResponse,
    InvoiceOut,
    InvoiceStatusUpdate,
    InvoiceUpdate,
)
from app.services.invoice import (
    DuplicateInvoiceError,
    InvoiceError,
    InvoiceService,
    OverlappingBillingPeriodError,
)

router = APIRouter(prefix="/invoices", tags=["invoices"])


def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")


def _to_out(invoice, base_url: str = "") -> InvoiceOut:
    out = InvoiceOut.model_validate(invoice)
    if invoice.pdf_path:
        out.pdf_url = f"/api/v1/invoices/{invoice.id}/pdf"
    return out


# ── Admin: list ──────────────────────────────────────────────────────────────

@router.get("", response_model=InvoiceListResponse)
def list_invoices(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    search: str = Query(""),
    sort_by: str = Query("created_at"),
    sort_order: str = Query("desc"),
    status_filter: str | None = Query(None, alias="status"),
    customer_filter: str | None = Query(None),
    plan_filter: str | None = Query(None),
    invoice_date_from: date | None = Query(None),
    invoice_date_to: date | None = Query(None),
    due_date_from: date | None = Query(None),
    due_date_to: date | None = Query(None),
    quick_filter: str | None = Query(None),
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> InvoiceListResponse:
    repo = InvoiceRepository(db)
    items, total = repo.list_paginated(
        page=page,
        page_size=page_size,
        search=search,
        sort_by=sort_by,
        sort_order=sort_order,
        status_filter=status_filter,
        customer_filter=customer_filter,
        plan_filter=plan_filter,
        invoice_date_from=invoice_date_from,
        invoice_date_to=invoice_date_to,
        due_date_from=due_date_from,
        due_date_to=due_date_to,
        quick_filter=quick_filter,
    )
    return InvoiceListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total / page_size) if total else 0,
    )


# ── Admin: create single ───────────────────────────────────────────────────────

@router.post("", response_model=InvoiceOut, status_code=status.HTTP_201_CREATED)
def create_invoice(
    payload: InvoiceCreate,
    request: Request,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> InvoiceOut:
    svc = InvoiceService(db)
    try:
        invoice = svc.create(
            payload,
            actor_id=current_user.id,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    except DuplicateInvoiceError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except OverlappingBillingPeriodError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except InvoiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return _to_out(invoice)


# ── Admin: create consolidated ─────────────────────────────────────────────────

@router.post("/consolidated", response_model=InvoiceOut, status_code=status.HTTP_201_CREATED)
def create_consolidated_invoice(
    payload: ConsolidatedInvoiceCreate,
    request: Request,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> InvoiceOut:
    svc = InvoiceService(db)
    try:
        invoice = svc.create_consolidated(
            payload,
            actor_id=current_user.id,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    except InvoiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return _to_out(invoice)


# ── Admin: get detail ─────────────────────────────────────────────────────────

@router.get("/{invoice_id}", response_model=InvoiceOut)
def get_invoice(
    invoice_id: uuid.UUID,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> InvoiceOut:
    invoice = InvoiceRepository(db).get(invoice_id)
    if invoice is None:
        raise _not_found()
    return _to_out(invoice)


# ── Admin: edit ───────────────────────────────────────────────────────────────

@router.patch("/{invoice_id}", response_model=InvoiceOut)
def update_invoice(
    invoice_id: uuid.UUID,
    payload: InvoiceUpdate,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> InvoiceOut:
    repo = InvoiceRepository(db)
    invoice = repo.get(invoice_id)
    if invoice is None:
        raise _not_found()
    svc = InvoiceService(db)
    try:
        invoice = svc.update(invoice, payload, actor_id=current_user.id)
    except InvoiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return _to_out(invoice)


# ── Admin: status change ──────────────────────────────────────────────────────

@router.patch("/{invoice_id}/status", response_model=InvoiceOut)
def update_invoice_status(
    invoice_id: uuid.UUID,
    payload: InvoiceStatusUpdate,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> InvoiceOut:
    repo = InvoiceRepository(db)
    invoice = repo.get(invoice_id)
    if invoice is None:
        raise _not_found()
    svc = InvoiceService(db)
    try:
        invoice = svc.update_status(
            invoice, payload.status, payload.change_reason, actor_id=current_user.id
        )
    except InvoiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return _to_out(invoice)


# ── Admin: PDF download ───────────────────────────────────────────────────────

@router.get("/{invoice_id}/pdf")
def download_invoice_pdf(
    invoice_id: uuid.UUID,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    invoice = InvoiceRepository(db).get(invoice_id)
    if invoice is None:
        raise _not_found()
    svc = InvoiceService(db)
    try:
        path = svc.get_pdf_path(invoice)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"PDF generation failed: {exc}",
        )
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=f"{invoice.invoice_number}.pdf",
    )


# ── Admin: change history ─────────────────────────────────────────────────────

@router.get("/{invoice_id}/history")
def get_invoice_history(
    invoice_id: uuid.UUID,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    invoice = InvoiceRepository(db).get(invoice_id)
    if invoice is None:
        raise _not_found()
    from app.schemas.invoice import ChangeLogOut
    return [ChangeLogOut.model_validate(log) for log in invoice.change_logs]


# ── Admin: delete ─────────────────────────────────────────────────────────────

@router.delete("/{invoice_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_invoice(
    request: Request,
    invoice_id: uuid.UUID,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> Response:
    invoice = InvoiceRepository(db).get(invoice_id)
    if invoice is None:
        raise _not_found()
    payments = PaymentRepository(db).list_by_invoice(invoice_id)
    if payments:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot delete invoice: {len(payments)} payment(s) have been recorded. Delete the payments first.",
        )
    InvoiceService(db).delete(
        invoice,
        actor_id=current_user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Client: list own invoices ─────────────────────────────────────────────────

@router.get("/client/my", response_model=InvoiceListResponse)
def client_list_invoices(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    current_user: User = Depends(require_client),
    db: Session = Depends(get_db),
) -> InvoiceListResponse:
    repo = InvoiceRepository(db)
    items, total = repo.list_by_customer_user(current_user.id, page=page, page_size=page_size)
    return InvoiceListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total / page_size) if total else 0,
    )


# ── Client: get detail ────────────────────────────────────────────────────────

@router.get("/client/{invoice_id}", response_model=InvoiceOut)
def client_get_invoice(
    invoice_id: uuid.UUID,
    current_user: User = Depends(require_client),
    db: Session = Depends(get_db),
) -> InvoiceOut:
    from app.models.customer import Customer
    from app.models.subscription import Subscription

    invoice = InvoiceRepository(db).get(invoice_id)
    if invoice is None:
        raise _not_found()

    if invoice.invoice_type == "CONSOLIDATED":
        from app.models.customer import Customer as Cust
        cust = db.get(Cust, invoice.customer_id)
        if cust is None or cust.user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    else:
        sub = invoice.subscription
        customer = sub.customer if sub else None
        if customer is None or customer.user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    return _to_out(invoice)


# ── Client: PDF download ──────────────────────────────────────────────────────

@router.get("/client/{invoice_id}/pdf")
def client_download_pdf(
    invoice_id: uuid.UUID,
    current_user: User = Depends(require_client),
    db: Session = Depends(get_db),
):
    from app.models.customer import Customer

    invoice = InvoiceRepository(db).get(invoice_id)
    if invoice is None:
        raise _not_found()

    if invoice.invoice_type == "CONSOLIDATED":
        cust = db.get(Customer, invoice.customer_id)
        if cust is None or cust.user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    else:
        sub = invoice.subscription
        customer = sub.customer if sub else None
        if customer is None or customer.user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    svc = InvoiceService(db)
    path = svc.get_pdf_path(invoice)
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=f"{invoice.invoice_number}.pdf",
    )
