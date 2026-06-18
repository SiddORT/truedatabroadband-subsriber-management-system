import secrets
import string
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.audit_log import (
    ACTION_CUSTOMER_CREATED,
    ACTION_CUSTOMER_DELETED,
    ACTION_CUSTOMER_PASSWORD_RESET,
    ACTION_CUSTOMER_STATUS_CHANGED,
    ACTION_CUSTOMER_UPDATED,
)
from app.models.customer import Customer, CustomerStatus
from app.models.subscription import Subscription
from app.models.user import User, UserRole
from app.repositories.audit_log import AuditLogRepository
from app.repositories.customer import CustomerRepository
from app.repositories.refresh_token import RefreshTokenRepository
from app.repositories.user import UserRepository
from app.schemas.customer import CustomerCreate, CustomerUpdate

# ---------------------------------------------------------------------------
# Password helper
# ---------------------------------------------------------------------------

_ALPHABET = string.ascii_letters + string.digits + "!@#$*"


def generate_temp_password() -> str:
    """
    Return a random 12-character password that satisfies the policy:
    uppercase, lowercase, digit, and special character.
    """
    while True:
        pw = "".join(secrets.choice(_ALPHABET) for _ in range(12))
        if (
            any(c.isupper() for c in pw)
            and any(c.islower() for c in pw)
            and any(c.isdigit() for c in pw)
            and any(c in "!@#$*" for c in pw)
        ):
            return pw


# ---------------------------------------------------------------------------
# Exception
# ---------------------------------------------------------------------------


class CustomerError(Exception):
    """Business-rule violation in the customer domain."""


class CustomerHasSubscriptionsError(CustomerError):
    """Raised when deletion is attempted on a customer that still has subscriptions."""


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class CustomerService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.users = UserRepository(db)
        self.customers = CustomerRepository(db)
        self.tokens = RefreshTokenRepository(db)
        self.audit = AuditLogRepository(db)

    # ------------------------------------------------------------------
    # Create
    # ------------------------------------------------------------------

    def create(
        self,
        payload: CustomerCreate,
        *,
        actor_id: uuid.UUID,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> tuple[Customer, str]:
        """Create a CLIENT user + linked customer. Returns ``(customer, temp_password)``."""
        email = payload.email

        if self.users.get_by_email(email):
            raise CustomerError("A user with this email already exists")
        if self.customers.get_by_email(email):
            raise CustomerError("A customer with this email already exists")
        if self.customers.get_by_mobile(payload.mobile_number):
            raise CustomerError("Mobile number is already registered")

        temp_password = generate_temp_password()

        # Create the linked CLIENT user
        user = User(
            email=email,
            password_hash=hash_password(temp_password),
            role=UserRole.CLIENT,
            is_active=True,
            must_change_password=True,
        )
        self.db.add(user)
        self.db.flush()  # populate user.id without committing

        # Generate unique customer code
        code = self.customers.generate_next_code()

        customer = Customer(
            user_id=user.id,
            customer_code=code,
            full_name=payload.full_name,
            mobile_number=payload.mobile_number,
            alternate_mobile_number=payload.alternate_mobile_number,
            email=email,
            installation_address=payload.installation_address,
            city=payload.city,
            state=payload.state,
            pincode=payload.pincode,
            customer_type=payload.customer_type,
            spokesperson_name=payload.spokesperson_name,
            spokesperson_mobile=payload.spokesperson_mobile,
            spokesperson_email=payload.spokesperson_email,
            spokesperson_designation=payload.spokesperson_designation,
            connection_date=payload.connection_date,
            reference_source=payload.reference_source,
            sales_person=payload.sales_person,
            notes=payload.notes,
            status=CustomerStatus.ACTIVE,
        )
        self.db.add(customer)
        self.db.commit()
        self.db.refresh(customer)

        self.audit.log(
            ACTION_CUSTOMER_CREATED,
            user_id=actor_id,
            ip_address=ip_address,
            user_agent=user_agent,
            entity_type="customer",
            entity_id=str(customer.id),
            entity_name=customer.full_name,
        )
        return customer, temp_password

    # ------------------------------------------------------------------
    # Update
    # ------------------------------------------------------------------

    def update(
        self,
        customer: Customer,
        payload: CustomerUpdate,
        *,
        actor_id: uuid.UUID,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> Customer:
        changes = payload.model_dump(exclude_unset=True)

        new_email = changes.get("email")
        if new_email and new_email != customer.email:
            if self.users.get_by_email(new_email):
                raise CustomerError("A user with this email already exists")
            if self.customers.get_by_email(new_email):
                raise CustomerError("A customer with this email already exists")
            # Mirror the change to the auth user record
            customer.user.email = new_email

        new_mobile = changes.get("mobile_number")
        if new_mobile and new_mobile != customer.mobile_number:
            if self.customers.get_by_mobile(new_mobile):
                raise CustomerError("Mobile number is already registered")

        for field, value in changes.items():
            setattr(customer, field, value)

        self.db.commit()
        self.db.refresh(customer)
        self.audit.log(
            ACTION_CUSTOMER_UPDATED,
            user_id=actor_id,
            ip_address=ip_address,
            user_agent=user_agent,
            entity_type="customer",
            entity_id=str(customer.id),
            entity_name=customer.full_name,
        )
        return customer

    # ------------------------------------------------------------------
    # Status change
    # ------------------------------------------------------------------

    def update_status(
        self,
        customer: Customer,
        new_status: CustomerStatus,
        *,
        actor_id: uuid.UUID,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> Customer:
        old_status = customer.status
        customer.status = new_status
        # Sync the linked user's active flag
        customer.user.is_active = new_status == CustomerStatus.ACTIVE
        self.db.commit()
        self.db.refresh(customer)
        self.audit.log(
            ACTION_CUSTOMER_STATUS_CHANGED,
            user_id=actor_id,
            ip_address=ip_address,
            user_agent=user_agent,
            entity_type="customer",
            entity_id=str(customer.id),
            entity_name=customer.full_name,
            old_values={"status": old_status.value},
            new_values={"status": new_status.value},
        )
        return customer

    # ------------------------------------------------------------------
    # Password reset
    # ------------------------------------------------------------------

    def reset_password(
        self,
        customer: Customer,
        *,
        actor_id: uuid.UUID,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> str:
        """Generate a new temp password, invalidate all sessions, return the password once."""
        temp_password = generate_temp_password()
        customer.user.password_hash = hash_password(temp_password)
        customer.user.must_change_password = True
        self.db.commit()
        self.tokens.revoke_all_for_user(customer.user_id)
        self.audit.log(
            ACTION_CUSTOMER_PASSWORD_RESET,
            user_id=actor_id,
            ip_address=ip_address,
            user_agent=user_agent,
            entity_type="customer",
            entity_id=str(customer.id),
            entity_name=customer.full_name,
        )
        # Send password reset email (fire-and-forget)
        try:
            from app.services.notifications.notification_service import (
                NotificationService,
                Recipient,
            )
            notif_svc = NotificationService(self.db)
            notif_svc.send(
                template_key="PASSWORD_RESET",
                recipient=Recipient(
                    email=customer.user.email,
                    mobile=customer.mobile_number,
                ),
                variables={
                    "customer_name": customer.full_name,
                    "temp_password": temp_password,
                },
                customer_id=customer.id,
            )
        except Exception:
            pass  # Non-fatal — password is still reset
        return temp_password

    # ------------------------------------------------------------------
    # Delete (soft)
    # ------------------------------------------------------------------

    def delete(
        self,
        customer: Customer,
        *,
        actor_id: uuid.UUID,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> None:
        # Block deletion if any non-deleted subscriptions exist
        has_subs = self.customers.db.scalar(
            select(Subscription.id)
            .where(
                Subscription.customer_id == customer.id,
                Subscription.deleted_at.is_(None),
            )
            .limit(1)
        )
        if has_subs:
            raise CustomerHasSubscriptionsError(
                "Cannot delete a customer with subscriptions. "
                "Deactivate the customer instead."
            )

        # Soft-delete the linked auth user so it cannot log in
        customer.user.deleted_at = datetime.now(timezone.utc)
        self.customers.soft_delete(customer)  # sets customer.deleted_at + commits both
        self.audit.log(
            ACTION_CUSTOMER_DELETED,
            user_id=actor_id,
            ip_address=ip_address,
            user_agent=user_agent,
            entity_type="customer",
            entity_id=str(customer.id),
            entity_name=customer.full_name,
        )
