"""OTP authentication endpoints — mobile-based login."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.otp_verification import OtpPurpose
from app.schemas.token import LoginResponse
from app.schemas.user import UserOut
from app.services.otp_service import OtpError, OtpRateLimitError, OtpService

router = APIRouter(prefix="/auth", tags=["auth"])

_EXPIRES_IN = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
_GENERIC_MSG = "If the mobile number is registered, an OTP has been sent."


class OtpRequestBody(BaseModel):
    mobile_number: str = Field(..., max_length=20)
    purpose: str = Field("LOGIN", max_length=20)


class OtpVerifyBody(BaseModel):
    mobile_number: str = Field(..., max_length=20)
    otp_code: str = Field(..., min_length=4, max_length=10)
    purpose: str = Field("LOGIN", max_length=20)


class OtpRequestResponse(BaseModel):
    message: str


@router.post("/request-otp", response_model=OtpRequestResponse, status_code=status.HTTP_200_OK)
def request_otp(
    payload: OtpRequestBody,
    request: Request,
    db: Session = Depends(get_db),
) -> OtpRequestResponse:
    """Request an OTP for the given mobile number.

    Always returns the generic message — never reveals whether the mobile
    number is registered in the system.
    """
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")

    svc = OtpService(db)
    try:
        otp_plain, message = svc.request_otp(
            mobile_number=payload.mobile_number,
            purpose=payload.purpose,
            ip_address=ip,
            user_agent=ua,
        )
        # Send OTP via notification service
        svc.send_otp_notification(
            mobile_number=payload.mobile_number,
            otp_plain=otp_plain,
            db=db,
        )
    except OtpRateLimitError as exc:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(exc))
    except OtpError:
        pass  # Swallow errors — always return generic message

    return OtpRequestResponse(message=_GENERIC_MSG)


@router.post("/verify-otp", response_model=LoginResponse, status_code=status.HTTP_200_OK)
def verify_otp(
    payload: OtpVerifyBody,
    request: Request,
    db: Session = Depends(get_db),
) -> LoginResponse:
    """Verify an OTP and issue JWT tokens on success."""
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")

    svc = OtpService(db)
    try:
        user, access_token, refresh_token = svc.verify_otp(
            mobile_number=payload.mobile_number,
            otp_code=payload.otp_code,
            purpose=payload.purpose,
            ip_address=ip,
            user_agent=ua,
        )
    except OtpError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))

    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=_EXPIRES_IN,
        user=UserOut.model_validate(user),
    )
