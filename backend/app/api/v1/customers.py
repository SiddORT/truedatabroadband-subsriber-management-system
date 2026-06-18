import io
import math
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.logging import get_logger
from app.dependencies.auth import require_superadmin
from app.models.customer import Customer, CustomerStatus
from app.models.notification import TemplateKey
from app.models.user import User
from app.repositories.company_settings import CompanySettingsRepository
from app.repositories.customer import CustomerRepository
from app.schemas.customer import (
    CustomerCreate,
    CustomerCreateResponse,
    CustomerListResponse,
    CustomerOut,
    CustomerPasswordResetResponse,
    CustomerStatusUpdate,
    CustomerUpdate,
)
from app.services.customer import CustomerError, CustomerHasSubscriptionsError, CustomerService
from app.services.notifications.notification_service import NotificationService, Recipient
from app.storage import get_storage_service

logger = get_logger(__name__)

router = APIRouter(prefix="/customers", tags=["customers"])

# Document type → model field mapping
_DOC_FIELD = {
    "profile_photo": "profile_photo_path",
    "kyc_document": "kyc_document_path",
    "agreement_document": "agreement_document_path",
}

# Allowed MIME types per document slot
_DOC_ALLOWED_MIME = {
    "profile_photo": {"image/jpeg", "image/png", "image/webp", "image/gif"},
    "kyc_document": {"image/jpeg", "image/png", "image/webp", "application/pdf"},
    "agreement_document": {"image/jpeg", "image/png", "image/webp", "application/pdf"},
}

_MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB


# ---------------------------------------------------------------------------
# Helper: Customer ORM → CustomerOut
# ---------------------------------------------------------------------------

def _to_out(customer: Customer) -> CustomerOut:
    out = CustomerOut.model_validate(customer)
    out.is_active = customer.user.is_active
    out.must_change_password = customer.user.must_change_password
    return out


def _get_customer_or_404(customer_id: uuid.UUID, db: Session) -> Customer:
    customer = CustomerRepository(db).get(customer_id)
    if customer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    return customer


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("", response_model=CustomerListResponse)
def list_customers(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=500),
    search: str = Query(""),
    sort_by: str = Query("created_at"),
    sort_order: str = Query("desc"),
    status: CustomerStatus | None = Query(None),
    customer_type: str | None = Query(None),
    city: str | None = Query(None),
    reference_source: str | None = Query(None),
    sales_person: str | None = Query(None),
    _: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> CustomerListResponse:
    from app.models.customer import CustomerType as CType
    customer_type_filter = None
    if customer_type:
        try:
            customer_type_filter = CType(customer_type)
        except ValueError:
            pass
    repo = CustomerRepository(db)
    items, total = repo.list_paginated(
        page=page,
        page_size=page_size,
        search=search,
        sort_by=sort_by,
        sort_order=sort_order,
        status_filter=status,
        customer_type_filter=customer_type_filter,
        city_filter=city,
        reference_source_filter=reference_source,
        sales_person_filter=sales_person,
    )
    total_pages = math.ceil(total / page_size) if total > 0 else 0
    return CustomerListResponse(
        items=[_to_out(c) for c in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.post("", response_model=CustomerCreateResponse, status_code=status.HTTP_201_CREATED)
def create_customer(
    request: Request,
    payload: CustomerCreate,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> CustomerCreateResponse:
    service = CustomerService(db)
    try:
        customer, temp_password = service.create(
            payload,
            actor_id=current_user.id,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    except CustomerError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except IntegrityError as exc:
        db.rollback()
        detail = str(exc.orig) if exc.orig else str(exc)
        if "mobile_number" in detail:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Mobile number is already registered to another customer.",
            )
        if "email" in detail or "users_email" in detail:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email address is already registered.",
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A customer with these details already exists.",
        )

    # Auto-send welcome email with portal link + initial password
    try:
        cs = CompanySettingsRepository(db).get_or_create()
        portal_url = f"{settings.SITE_URL}/client" if settings.SITE_URL else ""
        NotificationService(db).send(
            template_key=TemplateKey.WELCOME_CUSTOMER.value,
            recipient=Recipient(email=customer.email, mobile=customer.mobile_number),
            variables={
                "customer_name": customer.full_name,
                "customer_email": customer.email or "",
                "temp_password": temp_password,
                "plan_name": "",
                "portal_url": portal_url,
                "support_email": cs.support_email or "",
                "support_phone": cs.support_phone or "",
            },
            entity_type="CUSTOMER",
            entity_id=str(customer.id),
            customer_id=customer.id,
        )
    except Exception as exc:
        logger.warning("customers.welcome_notification.failed", customer_id=str(customer.id), error=str(exc))

    return CustomerCreateResponse(
        **_to_out(customer).model_dump(),
        temp_password=temp_password,
    )


@router.get("/{customer_id}", response_model=CustomerOut)
def get_customer(
    customer_id: uuid.UUID,
    _: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> CustomerOut:
    return _to_out(_get_customer_or_404(customer_id, db))


@router.put("/{customer_id}", response_model=CustomerOut)
def update_customer(
    request: Request,
    customer_id: uuid.UUID,
    payload: CustomerUpdate,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> CustomerOut:
    customer = _get_customer_or_404(customer_id, db)
    service = CustomerService(db)
    try:
        updated = service.update(
            customer,
            payload,
            actor_id=current_user.id,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    except CustomerError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    return _to_out(updated)


@router.patch("/{customer_id}/status", response_model=CustomerOut)
def update_customer_status(
    request: Request,
    customer_id: uuid.UUID,
    payload: CustomerStatusUpdate,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> CustomerOut:
    customer = _get_customer_or_404(customer_id, db)
    updated = CustomerService(db).update_status(
        customer,
        payload.status,
        actor_id=current_user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    return _to_out(updated)


@router.post("/{customer_id}/reset-password", response_model=CustomerPasswordResetResponse)
def reset_customer_password(
    request: Request,
    customer_id: uuid.UUID,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> CustomerPasswordResetResponse:
    customer = _get_customer_or_404(customer_id, db)
    temp_password = CustomerService(db).reset_password(
        customer,
        actor_id=current_user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    return CustomerPasswordResetResponse(temp_password=temp_password)


# ---------------------------------------------------------------------------
# Document upload / download
# ---------------------------------------------------------------------------


@router.post(
    "/{customer_id}/documents/{doc_type}",
    response_model=CustomerOut,
    summary="Upload a customer document (profile_photo | kyc_document | agreement_document)",
)
async def upload_document(
    customer_id: uuid.UUID,
    doc_type: str,
    file: UploadFile = File(...),
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> CustomerOut:
    if doc_type not in _DOC_FIELD:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown document type '{doc_type}'. Valid: {list(_DOC_FIELD)}",
        )

    content_type = file.content_type or ""
    allowed = _DOC_ALLOWED_MIME[doc_type]
    if content_type not in allowed:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"File type '{content_type}' not allowed for {doc_type}. Allowed: {sorted(allowed)}",
        )

    data = await file.read()
    if len(data) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File exceeds maximum allowed size of 10 MB",
        )

    customer = _get_customer_or_404(customer_id, db)

    ext = Path(file.filename or "file").suffix.lower() or _ext_for_mime(content_type)
    key = f"{customer.customer_code}/{doc_type}{ext}"

    storage = get_storage_service()
    storage.save("customers", key, io.BytesIO(data))

    setattr(customer, _DOC_FIELD[doc_type], key)
    db.commit()
    db.refresh(customer)
    return _to_out(customer)


@router.get(
    "/{customer_id}/documents/{doc_type}",
    summary="Download / view a customer document",
)
def download_document(
    customer_id: uuid.UUID,
    doc_type: str,
    _: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> FileResponse:
    if doc_type not in _DOC_FIELD:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown document type")

    customer = _get_customer_or_404(customer_id, db)
    key: str | None = getattr(customer, _DOC_FIELD[doc_type])

    if not key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not uploaded yet")

    storage = get_storage_service()
    abs_path = storage.url("customers", key)

    if not Path(abs_path).exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document file not found on disk",
        )

    return FileResponse(abs_path)


@router.delete("/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_customer(
    request: Request,
    customer_id: uuid.UUID,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> Response:
    customer = _get_customer_or_404(customer_id, db)
    try:
        CustomerService(db).delete(
            customer,
            actor_id=current_user.id,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    except CustomerHasSubscriptionsError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _ext_for_mime(content_type: str) -> str:
    mapping = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
        "application/pdf": ".pdf",
    }
    return mapping.get(content_type, ".bin")
