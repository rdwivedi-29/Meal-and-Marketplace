from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import date, datetime
from enum import Enum

class OfferStatus(str, Enum):
    active = "active"
    accepted = "accepted"
    cancelled = "cancelled"

class AuthSignup(BaseModel):
    email: EmailStr
    password: str
    university: str
    total_meals: int
    expires_on: date
    # New fields for meal plan configuration
    meal_distribution: str = "semester"  # "semester" or "weekly"
    weekly_meals: Optional[int] = None

class AuthLogin(BaseModel):
    email: EmailStr
    password: str
    remember: bool = False

class UserOut(BaseModel):
    id: int
    email: EmailStr
    university: str
    total_meals: int
    expires_on: date
    meal_distribution: str
    weekly_meals: int
    class Config:
        from_attributes = True

class MealOfferIn(BaseModel):
    meals: int
    location: str
    price: float
    # The type of meal ("breakfast", "lunch", "dinner")
    meal_type: str

class MealOfferOut(BaseModel):
    id: int
    seller: str
    meals: int
    location: str
    price: float
    meal_type: str
    status: OfferStatus
    accepted_by: Optional[str] = None
    created_at: datetime
    class Config:
        from_attributes = True

class ItemOfferIn(BaseModel):
    name: str
    category: str
    price: float
    img_data_url: Optional[str] = None
    baseline: Optional[float] = 0

class ItemOfferOut(BaseModel):
    id: int
    seller: str
    name: str
    category: str
    price: float
    discount: int
    img: Optional[str] = None
    status: OfferStatus
    accepted_by: Optional[str] = None
    created_at: datetime
    class Config:
        from_attributes = True

class AcceptIn(BaseModel):
    message: Optional[str] = ""

class ThreadOut(BaseModel):
    id: int
    kind: str
    other_party: str
    last_body: Optional[str] = None
    unread: int

class MessageIn(BaseModel):
    body: str

class MessageOut(BaseModel):
    from_email: str
    body: str
    when: datetime

class UsageAdjustIn(BaseModel):
    meals_used_delta: int
    note: Optional[str] = None


# Comment submission schema
class CommentIn(BaseModel):
    body: str
    university: Optional[str] = None


# Comment return schema
class CommentOut(BaseModel):
    id: int
    user_id: Optional[int]
    university: Optional[str]
    body: str
    created_at: datetime
    class Config:
        from_attributes = True


# Meal price management
class MealPriceIn(BaseModel):
    university: str
    meal_type: str
    price: float

class MealPriceOut(BaseModel):
    id: int
    university: str
    meal_type: str
    price: float
    created_at: datetime
    class Config:
        from_attributes = True

class StatsOut(BaseModel):
    remaining: int
    used_total: int
    used_this_week: int
    used_last_week: int
    trend_pct: int
    waste_pct: int
    days_left: int
