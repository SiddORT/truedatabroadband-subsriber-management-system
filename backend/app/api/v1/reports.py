"""Reports & Exports API endpoints."""

from __future__ import annotations

import math
from datetime import date
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.dependencies.auth import require_permission
from app.models.audit_log import ACTION_REPORT_EXPORTED, ACTION_REPORT_VIEWED
from app.models.user import User
from app.repositories.audit_log import AuditLogRepository
from app.repositories.reports import ReportsRepository

router = APIRouter(prefix="/reports", tags=["reports"])


def _audit(request: Request, db: Session, user: User, action: str, **extra) -> None:
    AuditLogRepository(db).log(
        action,
        user_id=user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )


# ---------------------------------------------------------------------------
# Customer Report
# ---------------------------------------------------------------------------

@router.get("/customers")
def report_customers(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=500),
    search: str = Query(""),
    sort_by: str = Query("created_at"),
    sort_order: str = Query("desc"),
    status: str | None = Query(None),
    customer_type: str | None = Query(None),
    city: str | None = Query(None),
    reference_source: str | None = Query(None),
    sales_person: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "view")),
):
    repo = ReportsRepository(db)
    items, total, summary = repo.customers_report(
        page=page, page_size=page_size, search=search,
        sort_by=sort_by, sort_order=sort_order,
        status_filter=status, customer_type_filter=customer_type,
        city_filter=city, reference_source_filter=reference_source,
        sales_person_filter=sales_person, date_from=date_from, date_to=date_to,
    )
    _audit(request, db, current_user, ACTION_REPORT_VIEWED)
    return {
        "items": items, "total": total, "page": page, "page_size": page_size,
        "total_pages": math.ceil(total / page_size) if page_size else 1,
        "summary": summary,
    }


# ---------------------------------------------------------------------------
# Subscription Report
# ---------------------------------------------------------------------------

@router.get("/subscriptions")
def report_subscriptions(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=500),
    search: str = Query(""),
    sort_by: str = Query("expiry_date"),
    sort_order: str = Query("asc"),
    status: str | None = Query(None),
    customer: str | None = Query(None),
    plan: str | None = Query(None),
    sub_date_from: date | None = Query(None),
    sub_date_to: date | None = Query(None),
    expiry_date_from: date | None = Query(None),
    expiry_date_to: date | None = Query(None),
    quick_filter: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "view")),
):
    repo = ReportsRepository(db)
    items, total, summary = repo.subscriptions_report(
        page=page, page_size=page_size, search=search,
        sort_by=sort_by, sort_order=sort_order,
        status_filter=status, customer_filter=customer, plan_filter=plan,
        sub_date_from=sub_date_from, sub_date_to=sub_date_to,
        expiry_date_from=expiry_date_from, expiry_date_to=expiry_date_to,
        quick_filter=quick_filter,
    )
    _audit(request, db, current_user, ACTION_REPORT_VIEWED)
    return {
        "items": items, "total": total, "page": page, "page_size": page_size,
        "total_pages": math.ceil(total / page_size) if page_size else 1,
        "summary": summary,
    }


# ---------------------------------------------------------------------------
# Invoice Report
# ---------------------------------------------------------------------------

@router.get("/invoices")
def report_invoices(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=500),
    search: str = Query(""),
    sort_by: str = Query("created_at"),
    sort_order: str = Query("desc"),
    status: str | None = Query(None),
    customer: str | None = Query(None),
    plan: str | None = Query(None),
    invoice_date_from: date | None = Query(None),
    invoice_date_to: date | None = Query(None),
    due_date_from: date | None = Query(None),
    due_date_to: date | None = Query(None),
    quick_filter: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "view")),
):
    repo = ReportsRepository(db)
    items, total, summary = repo.invoices_report(
        page=page, page_size=page_size, search=search,
        sort_by=sort_by, sort_order=sort_order,
        status_filter=status, customer_filter=customer, plan_filter=plan,
        invoice_date_from=invoice_date_from, invoice_date_to=invoice_date_to,
        due_date_from=due_date_from, due_date_to=due_date_to,
        quick_filter=quick_filter,
    )
    _audit(request, db, current_user, ACTION_REPORT_VIEWED)
    return {
        "items": items, "total": total, "page": page, "page_size": page_size,
        "total_pages": math.ceil(total / page_size) if page_size else 1,
        "summary": summary,
    }


# ---------------------------------------------------------------------------
# Payment Report
# ---------------------------------------------------------------------------

@router.get("/payments")
def report_payments(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=500),
    search: str = Query(""),
    sort_by: str = Query("payment_date"),
    sort_order: str = Query("desc"),
    customer: str | None = Query(None),
    payment_method: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "view")),
):
    repo = ReportsRepository(db)
    items, total, summary = repo.payments_report(
        page=page, page_size=page_size, search=search,
        sort_by=sort_by, sort_order=sort_order,
        customer_filter=customer, payment_method_filter=payment_method,
        date_from=date_from, date_to=date_to,
    )
    _audit(request, db, current_user, ACTION_REPORT_VIEWED)
    return {
        "items": items, "total": total, "page": page, "page_size": page_size,
        "total_pages": math.ceil(total / page_size) if page_size else 1,
        "summary": summary,
    }


# ---------------------------------------------------------------------------
# Revenue Report
# ---------------------------------------------------------------------------

@router.get("/revenue")
def report_revenue(
    request: Request,
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    plan: str | None = Query(None),
    customer_type: str | None = Query(None),
    city: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "view")),
):
    repo = ReportsRepository(db)
    data = repo.revenue_report(
        date_from=date_from, date_to=date_to,
        plan_filter=plan, customer_type_filter=customer_type, city_filter=city,
    )
    _audit(request, db, current_user, ACTION_REPORT_VIEWED)
    return data


# ---------------------------------------------------------------------------
# Outstanding Report
# ---------------------------------------------------------------------------

@router.get("/outstanding")
def report_outstanding(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=500),
    search: str = Query(""),
    sort_by: str = Query("days_overdue"),
    sort_order: str = Query("desc"),
    customer: str | None = Query(None),
    city: str | None = Query(None),
    plan: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "view")),
):
    repo = ReportsRepository(db)
    items, total, summary = repo.outstanding_report(
        page=page, page_size=page_size, search=search,
        sort_by=sort_by, sort_order=sort_order,
        customer_filter=customer, city_filter=city, plan_filter=plan,
    )
    _audit(request, db, current_user, ACTION_REPORT_VIEWED)
    return {
        "items": items, "total": total, "page": page, "page_size": page_size,
        "total_pages": math.ceil(total / page_size) if page_size else 1,
        "summary": summary,
    }


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

@router.post("/export")
def export_report(
    request: Request,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "add")),
):
    report_type = payload.get("report_type", "")
    filters = payload.get("filters", {})
    fmt = payload.get("format", "csv")

    valid_types = {"customers", "subscriptions", "invoices", "payments", "outstanding"}
    if report_type not in valid_types:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid report_type. Must be one of: {', '.join(valid_types)}",
        )
    if fmt not in {"csv", "xlsx"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="format must be 'csv' or 'xlsx'",
        )

    repo = ReportsRepository(db)
    filename, expires_at = repo.generate_export(
        report_type=report_type,
        filters=filters or {},
        fmt=fmt,
        storage_root=settings.STORAGE_ROOT,
    )

    _audit(request, db, current_user, ACTION_REPORT_EXPORTED)

    download_url = f"/api/v1/reports/download/{filename}"
    return {
        "download_url": download_url,
        "expires_at": expires_at.isoformat(),
        "filename": filename,
    }


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------

@router.get("/download/{filename}")
def download_export(
    filename: str,
    current_user: User = Depends(require_permission("reports", "view")),
):
    # Sanitise: no path traversal
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid filename")

    file_path = Path(settings.STORAGE_ROOT) / "exports" / filename
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found or has expired",
        )

    media_type = "text/csv" if filename.endswith(".csv") else (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    return FileResponse(path=str(file_path), filename=filename, media_type=media_type)
