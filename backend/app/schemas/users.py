from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

USERNAME_PATTERN = r"^[A-Za-z0-9_]{3,24}$"


class RegisterRequest(BaseModel):
    username: str = Field(..., pattern=USERNAME_PATTERN, description="3-24 letters, digits or underscores")
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def _lower_email(cls, value: str) -> str:
        return value.lower()


class LoginRequest(BaseModel):
    login: str = Field(..., min_length=1, max_length=254, description="Username or email")
    password: str = Field(..., min_length=1, max_length=128)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: str
    created_at: datetime


class PublicUser(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str


class UserStatistics(BaseModel):
    competitions_played: int
    competitions_won: int
    submissions_total: int
    submissions_accepted: int
    questions_solved: int
    acceptance_rate: float
