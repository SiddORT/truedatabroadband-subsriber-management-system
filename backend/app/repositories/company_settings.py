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

    def update_sms_settings(
        self,
        record: CompanySettings,
        *,
        is_enabled: bool,
        provider: str | None,
        api_base_url: str | None,
        status_api_url: str | None,
        api_key: str | None,
        client_id: str | None,
        sender_id: str | None,
        entity_id: str | None,
        replace_api_key: bool = False,
        replace_client_id: bool = False,
        replace_sender_id: bool = False,
        replace_entity_id: bool = False,
        test_template_id: str | None = None,
        test_message: str | None = None,
    ) -> CompanySettings:
        """Update SMS settings. Credentials only overwritten when replace_* = True AND new value provided."""
        record.sms_is_enabled = is_enabled
        record.sms_provider = provider
        record.sms_api_base_url = api_base_url
        record.sms_status_api_url = status_api_url
        if replace_api_key and api_key:
            record.sms_api_key_encrypted = api_key
        if replace_client_id and client_id:
            record.sms_client_id_encrypted = client_id
        if replace_sender_id and sender_id:
            record.sms_sender_id_encrypted = sender_id
        if replace_entity_id and entity_id:
            record.sms_entity_id_encrypted = entity_id
        record.sms_test_template_id = test_template_id
        record.sms_test_message = test_message
        self.db.commit()
        self.db.refresh(record)
        return record

    def update_email_settings(
        self,
        record: CompanySettings,
        *,
        is_enabled: bool,
        host: str | None,
        port: int | None,
        from_email: str | None,
        from_name: str | None,
        use_tls: bool,
        use_ssl: bool,
        username: str | None,
        password: str | None,
        replace_username: bool = False,
        replace_password: bool = False,
    ) -> CompanySettings:
        """Update email/SMTP settings. Credentials only overwritten when replace_* = True AND new value provided."""
        record.email_is_enabled = is_enabled
        record.smtp_host = host
        record.smtp_port = port
        record.smtp_from_email = from_email
        record.smtp_from_name = from_name
        record.smtp_use_tls = use_tls
        record.smtp_use_ssl = use_ssl
        if replace_username and username:
            record.smtp_username_encrypted = username
        if replace_password and password:
            record.smtp_password_encrypted = password
        self.db.commit()
        self.db.refresh(record)
        return record

    def get_sms_settings(self, record: CompanySettings) -> dict:
        """Return decrypted SMS settings dict for use in services."""
        return {
            "is_enabled": record.sms_is_enabled,
            "provider": record.sms_provider,
            "base_url": record.sms_api_base_url,
            "status_url": record.sms_status_api_url,
            "api_key": record.sms_api_key_encrypted,
            "client_id": record.sms_client_id_encrypted,
            "sender_id": record.sms_sender_id_encrypted,
            "entity_id": record.sms_entity_id_encrypted,
            "test_template_id": record.sms_test_template_id,
            "test_message": record.sms_test_message,
        }

    def get_smtp_settings(self, record: CompanySettings) -> dict:
        """Return decrypted SMTP settings dict for use in services."""
        return {
            "host": record.smtp_host,
            "port": record.smtp_port,
            "from_email": record.smtp_from_email,
            "from_name": record.smtp_from_name,
            "use_tls": record.smtp_use_tls,
            "use_ssl": record.smtp_use_ssl,
            "username": record.smtp_username_encrypted,
            "password": record.smtp_password_encrypted,
            "is_enabled": record.email_is_enabled,
        }

    def set_logo_path(
        self, record: CompanySettings, logo_path: str
    ) -> CompanySettings:
        record.logo_path = logo_path
        self.db.commit()
        self.db.refresh(record)
        return record
