from pydantic import BaseModel


class LoginRequest(BaseModel):
    # Plain str (not EmailStr) so internal domains like
    # admin@truedata.local are accepted.
    email: str
    password: str


class MessageResponse(BaseModel):
    message: str
