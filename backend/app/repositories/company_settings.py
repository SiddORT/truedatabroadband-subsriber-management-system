"""Repository for the singleton CompanySettings record."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.company_settings import CompanySettings
from app.schemas.company_settings import CompanySettingsUpdate


class CompanySettingsRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self) -> CompanySettings | None:
        return self.db.query(CompanySettings).first()

    def create(self, company_name: str = "True Data Broadband Pvt. Ltd.") -> CompanySettings:
        existing = self.get()
        if existing is not None:
            raise ValueError("Company settings already exist — only one record allowed.")
        record = CompanySettings(
            company_name=company_name,
            country="India",
            invoice_prefix="TDB-INV",
            invoice_due_days=7,
            default_gst_percentage="18.00",
            invoice_footer_text=(
                "Thank you for choosing True Data Broadband Services Pvt. Ltd.\n\nPowered by ORT"
            ),
            terms_and_conditions=(
                "- Payments are due within the specified due date.\n"
                "- Services may be suspended for unpaid invoices.\n"
                "- Taxes are applied as per government regulations."
            ),
        )
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)
        return record

    def get_or_create(self) -> CompanySettings:
        record = self.get()
        if record is None:
            record = self.create()
        return record

    def update(
        self, record: CompanySettings, payload: CompanySettingsUpdate
    ) -> CompanySettings:
        data = payload.model_dump(exclude_unset=True)
        for key, value in data.items():
            setattr(record, key, value)
        self.db.commit()
        self.db.refresh(record)
        return record

    def set_logo_path(
        self, record: CompanySettings, logo_path: str
    ) -> CompanySettings:
        record.logo_path = logo_path
        self.db.commit()
        self.db.refresh(record)
        return record
