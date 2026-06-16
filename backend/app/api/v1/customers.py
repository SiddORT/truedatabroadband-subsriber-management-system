import math
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.auth import require_superadmin
from app.models.customer import Customer, CustomerStatus
from app.models.user import User
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
from app.services.customer import CustomerError, CustomerService

router = APIRouter(prefix="/customers", tags=["customers"])


# ---------------------------------------------------------------------------
# Helper: Customer ORM → CustomerOut (includes denormalised user fields)
# ---------------------------------------------------------------------------


def _to_out(customer: Customer) -> CustomerOut:
    return CustomerOut(
        id=customer.id,
        customer_code=customer.customer_code,
        user_id=customer.user_id,
        full_name=customer.full_name,
        mobile_number=customer.mobile_number,
        alternate_mobile_number=customer.alternate_mobile_number,
        email=customer.email,
        installation_address=customer.installation_address,
        city=customer.city,
        state=customer.state,
        pincode=customer.pincode,
        status=customer.status,
        notes=customer.notes,
        is_active=customer.user.is_active,
        must_change_password=customer.user.must_change_password,
        created_at=customer.created_at,
        updated_at=customer.updated_at,
    )


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
    page_size: int = Query(10, ge=1, le=100),
    search: str = Query(""),
    sort_by: str = Query("created_at"),
    sort_order: str = Query("desc"),
    status: CustomerStatus | None = Query(None),
    _: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> CustomerListResponse:
    repo = CustomerRepository(db)
    items, total = repo.list_paginated(
        page=page,
        page_size=page_size,
        search=search,
        sort_by=sort_by,
        sort_order=sort_order,
        status_filter=status,
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
