from sqlalchemy import Column, Integer, String, Date, DateTime, Float, ForeignKey, Text, Enum, Boolean
from sqlalchemy.sql import func
from db import Base
from enum import Enum as PyEnum

class OfferStatus(PyEnum):
    active = "active"
    accepted = "accepted"
    cancelled = "cancelled"

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    university = Column(String(255), nullable=False)
    total_meals = Column(Integer, default=0, nullable=False)
    expires_on = Column(Date, nullable=False)
    # New field to capture how meals are distributed. Possible values:
    # "semester" (all meals up front) or "weekly" (meals reset each week).
    meal_distribution = Column(String(32), default="semester", nullable=False)
    # For weekly plans, this holds the number of meals available each week. It is ignored for semester plans.
    weekly_meals = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class MealOffer(Base):
    __tablename__ = "meal_offers"
    id = Column(Integer, primary_key=True)
    seller_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    meals = Column(Integer, nullable=False)
    location = Column(String(255), nullable=False)
    price = Column(Float, nullable=False)
    # Type of meal being offered (e.g., breakfast, lunch, dinner). Used to compute recovered savings
    meal_type = Column(String(64), nullable=False, default="lunch")
    status = Column(Enum(OfferStatus), default=OfferStatus.active, nullable=False)
    accepted_by_id = Column(Integer, ForeignKey("users.id"))
    buyer_message = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class ItemOffer(Base):
    __tablename__ = "item_offers"
    id = Column(Integer, primary_key=True)
    seller_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String(255), nullable=False)
    category = Column(String(100), nullable=False)
    price = Column(Float, nullable=False)
    img_data_url = Column(Text)
    baseline = Column(Float, default=0)
    status = Column(Enum(OfferStatus), default=OfferStatus.active, nullable=False)
    accepted_by_id = Column(Integer, ForeignKey("users.id"))
    buyer_message = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Transaction(Base):
    __tablename__ = "transactions"
    id = Column(Integer, primary_key=True)
    kind = Column(String(16), nullable=False)
    listing_id = Column(Integer, nullable=False)
    seller_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    buyer_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Thread(Base):
    __tablename__ = "threads"
    id = Column(Integer, primary_key=True)
    kind = Column(String(16), nullable=False)
    listing_id = Column(Integer, nullable=False)
    seller_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    buyer_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    open = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Message(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True)
    thread_id = Column(Integer, ForeignKey("threads.id"), nullable=False)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class UsageAdjustment(Base):
    __tablename__ = "usage_adjustments"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    meals_used_delta = Column(Integer, nullable=False)
    note = Column(String(255))
    at = Column(DateTime(timezone=True), server_default=func.now())


# New model for user comments. Comments are displayed publicly on the home page and in user dashboards.
class Comment(Base):
    __tablename__ = "comments"
    id = Column(Integer, primary_key=True)
    # User who left the comment. We allow null for anonymous comments.
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    # University associated with the comment. Allows grouping comments by campus.
    university = Column(String(255), nullable=True)
    # The comment text itself.
    body = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# Campus meal prices for different meal types (e.g., breakfast, lunch, dinner).
class MealPrice(Base):
    __tablename__ = "meal_prices"
    id = Column(Integer, primary_key=True)
    university = Column(String(255), nullable=False)
    meal_type = Column(String(64), nullable=False)  # e.g. breakfast, lunch, dinner
    price = Column(Float, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# Removed duplicate MealPrice model definition; see above for the single definition used.


# Activity logging model
from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey
from sqlalchemy.sql import func

class Activity(Base):
    __tablename__ = "activities"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String(128), nullable=False)
    details = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
