"""Line Item Masters API — manage reusable charge templates."""

from __future__ import annotations

import math
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.auth import require_permission
from app.models.user import User
from app.repositories.line_item_master import LineItemMasterRepository
from app.schemas.line_item_master import (
    LineItemMasterCreate,
    LineItemMasterListResponse,
    LineItemMasterOut,
    LineItemMasterUpdate,
)

router = APIRouter(prefix="/line-item-masters", tags=["line-item-masters"])


def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Line item not found")


@router.get("", response_model=LineItemMasterListResponse)
def list_line_items(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    search: str = Query(""),
    active_only: bool = Query(False),
    _: User = Depends(require_permission("settings", "view")),
    db: Session = Depends(get_db),
) -> LineItemMasterListResponse:
    repo = LineItemMasterRepository(db)
    items, total = repo.list_paginated(
        page=page, page_size=page_size, search=search, active_only=active_only
    )
    return LineItemMasterListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total / page_size) if total else 0,
    )


@router.post("", response_model=LineItemMasterOut, status_code=status.HTTP_201_CREATED)
def create_line_item(
    payload: LineItemMasterCreate,
    _: User = Depends(require_permission("settings", "add")),
    db: Session = Depends(get_db),
) -> LineItemMasterOut:
    repo = LineItemMasterRepository(db)
    item = repo.create(**payload.model_dump())
    db.commit()
    db.refresh(item)
    return item


@router.put("/{item_id}", response_model=LineItemMasterOut)
def update_line_item(
    item_id: uuid.UUID,
    payload: LineItemMasterUpdate,
    _: User = Depends(require_permission("settings", "edit")),
    db: Session = Depends(get_db),
) -> LineItemMasterOut:
    repo = LineItemMasterRepository(db)
    item = repo.get(item_id)
    if not item:
        raise _not_found()
    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None or k in ("hsn_sac_code", "description", "default_amount")}
    item = repo.update(item, **updates)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_line_item(
    item_id: uuid.UUID,
    _: User = Depends(require_permission("settings", "delete")),
    db: Session = Depends(get_db),
) -> Response:
    repo = LineItemMasterRepository(db)
    item = repo.get(item_id)
    if not item:
        raise _not_found()
    repo.soft_delete(item)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
