import os
from datetime import date, timedelta
from typing import List
from fastapi import FastAPI, Depends, HTTPException, Header, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from db import SessionLocal, Base, engine
from models import User, MealOffer, ItemOffer, OfferStatus, Transaction, Thread, Message, UsageAdjustment, MealPrice, Comment, Activity
from schemas import *
from auth import hash_password, verify_password, make_token, parse_token
from ws import hub

Base.metadata.create_all(bind=engine)

def create_admin_user():
    from auth import hash_password
    session = SessionLocal()
    try:
        # Check if admin user already exists
        admin_user = session.query(User).filter_by(email="admin@dinemarketplace.com").first()
        if not admin_user:
            admin_user = User(
                email="admin@dinemarketplace.com",
                password_hash=hash_password("admin123"),
                university="Admin",
                total_meals=0,
                expires_on=date.today(),
                meal_distribution="semester",
                weekly_meals=0
            )
            session.add(admin_user)
            session.commit()
            print("Admin user created successfully")
    except Exception as e:
        print(f"Error creating admin user: {e}")
        session.rollback()
    finally:
        session.close()

# Call this function after database creation
create_admin_user()

app = FastAPI()

origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:5500,http://127.0.0.1:5500").split(",")
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

def db():
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()

def authed(authorization: str = Header(None), session: Session = Depends(db)) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ", 1)[1].strip()
    try:
        email = parse_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = session.query(User).filter_by(email=email).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

def admin_required(user: User = Depends(authed)):
    """Check if user is admin"""
    if user.email != "admin@dinemarketplace.com":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

@app.post("/auth/signup", response_model=UserOut)
def signup(p: AuthSignup, session: Session = Depends(db)):
    if session.query(User).filter_by(email=p.email).first():
        raise HTTPException(400, "Email exists")
    # On sign‑up capture meal distribution and optional weekly meals.
    # For weekly plans, if weekly_meals isn't provided, default to evenly dividing total meals across the term (16 weeks).
    meal_dist = p.meal_distribution or "semester"
    weekly = p.weekly_meals if p.weekly_meals is not None else 0
    if meal_dist == "weekly" and not weekly:
        # Default weekly allotment: total meals divided by 16 weeks (approx. 112 days / 7)
        weekly = max(0, round(p.total_meals / 16))
    u = User(email=p.email, password_hash=hash_password(p.password), university=p.university,
             total_meals=p.total_meals, expires_on=p.expires_on,
             meal_distribution=meal_dist, weekly_meals=weekly)
    session.add(u)
    session.commit()
    session.refresh(u)
    return u

@app.post("/auth/login")
def login(p: AuthLogin, session: Session = Depends(db)):
    u = session.query(User).filter_by(email=p.email).first()
    if not u or not verify_password(p.password, u.password_hash):
        raise HTTPException(401, "Invalid credentials")
    token = make_token(u.email, p.remember)
    return {"token": token}

@app.get("/me", response_model=UserOut)
def me(user: User = Depends(authed)):
    return user

@app.get("/stats", response_model=StatsOut)
def stats(user: User = Depends(authed), session: Session = Depends(db)):
    # Determine number of days left in the current term and compute usage accordingly.
    dleft = max(0, (user.expires_on - date.today()).days)
    # Base metrics depend on whether meals are distributed for the semester or weekly.
    if user.meal_distribution == "weekly":
        # For weekly plans, remaining refers to current week's balance; used_total is sum of meals used this week.
        # Determine start of current week (Monday)
        today = date.today()
        week_start = today.fromisocalendar(today.isocalendar().year, today.isocalendar().week, 1)
        week_end = week_start + timedelta(days=7)
        # Total allowed meals this week
        weekly_total = user.weekly_meals
        # Sum adjustments within current week (negative deltas represent meals used)
        adj = session.query(UsageAdjustment).filter(UsageAdjustment.user_id == user.id, UsageAdjustment.at >= week_start, UsageAdjustment.at < week_end).all()
        used_total = -sum(a.meals_used_delta for a in adj if a.meals_used_delta < 0)
        remaining = max(0, weekly_total - used_total)
        # For weekly plan, usage trend compares this week's used meals vs last week's used meals
        last_week_start = week_start - timedelta(days=7)
        last_week_end = week_start
        adj_last = session.query(UsageAdjustment).filter(UsageAdjustment.user_id == user.id, UsageAdjustment.at >= last_week_start, UsageAdjustment.at < last_week_end).all()
        used_last_week = -sum(a.meals_used_delta for a in adj_last if a.meals_used_delta < 0)
        this_week = used_total
        last_week = used_last_week
        trend = 0 if last_week == 0 else round(((this_week - last_week) / last_week) * 100)
        # Waste forecast for weekly plan can be computed as how many meals might go unused at week's end
        days_remaining_this_week = max(0, (week_end - today).days)
        waste = 0 if days_remaining_this_week <= 0 else max(0, min(100, round((remaining / max(1, days_remaining_this_week)) * 8)))
        return {"remaining": remaining, "used_total": used_total, "used_this_week": this_week, "used_last_week": last_week, "trend_pct": trend, "waste_pct": waste, "days_left": dleft}
    else:
        # Semester plan: existing behaviour
        term_days = 112
        used_total = 0
        if user.total_meals > 0 and dleft >= 0:
            elapsed = min(term_days, max(0, term_days - dleft))
            used_total = round(user.total_meals * (elapsed / term_days))
        adj = session.query(UsageAdjustment).filter_by(user_id=user.id).all()
        adj_used = sum(a.meals_used_delta for a in adj)
        used_total = max(0, used_total + adj_used)
        remaining = max(0, user.total_meals - used_total)
        avg_per_day = user.total_meals / term_days if user.total_meals > 0 else 0
        this_week = max(0, round(avg_per_day * 7))
        last_week = max(0, this_week + 1 - 2)
        trend = 0 if last_week == 0 else round(((this_week - last_week) / last_week) * 100)
        waste = 0 if dleft <= 0 else max(0, min(100, round((remaining / max(1, dleft)) * 8)))
        return {"remaining": remaining, "used_total": used_total, "used_this_week": this_week, "used_last_week": last_week, "trend_pct": trend, "waste_pct": waste, "days_left": dleft}

@app.post("/usage/adjust")
def usage_adjust(p: UsageAdjustIn, user: User = Depends(authed), session: Session = Depends(db)):
    r = UsageAdjustment(user_id=user.id, meals_used_delta=p.meals_used_delta, note=p.note or "")
    session.add(r)
    session.commit()
    return {"ok": True}

# Comments API
@app.post("/comments", response_model=CommentOut)
def create_comment(p: CommentIn, user: User = Depends(authed), session: Session = Depends(db)):
    """Allow an authenticated user to post a comment. Comments can optionally specify a university."""
    from .models import Comment
    comment = Comment(user_id=user.id, university=p.university or user.university, body=p.body)
    session.add(comment)
    session.commit()
    session.refresh(comment)
    return comment

@app.get("/comments", response_model=List[CommentOut])
def list_comments(university: str | None = None, session: Session = Depends(db)):
    """Return latest 100 comments. Optionally filter by university."""
    from .models import Comment
    query = session.query(Comment)
    if university:
        query = query.filter(Comment.university == university)
    rows = query.order_by(Comment.created_at.desc()).limit(100).all()
    return rows

# Admin endpoints
@app.get("/admin/users")
def admin_users(user: User = Depends(admin_required), session: Session = Depends(db)):
    """Return basic information about all users."""
    rows = session.query(User).all()
    return [{
        "id": u.id,
        "email": u.email,
        "university": u.university,
        "total_meals": u.total_meals,
        "meal_distribution": u.meal_distribution,
        "weekly_meals": u.weekly_meals,
        "expires_on": u.expires_on,
        "created_at": u.created_at
    } for u in rows]

@app.get("/admin/offers/meals")
def admin_meal_offers(user: User = Depends(admin_required), session: Session = Depends(db)):
    """Return all meal offers."""
    rows = session.query(MealOffer).all()
    out = []
    for o in rows:
        out.append({
            "id": o.id,
            "seller_id": o.seller_id,
            "meals": o.meals,
            "location": o.location,
            "price": o.price,
            "meal_type": o.meal_type,
            "status": o.status.value,
            "accepted_by_id": o.accepted_by_id,
            "created_at": o.created_at
        })
    return out

@app.get("/admin/offers/items")
def admin_item_offers(user: User = Depends(admin_required), session: Session = Depends(db)):
    """Return all item offers."""
    rows = session.query(ItemOffer).all()
    out = []
    for it in rows:
        discount = 0 if not it.baseline else max(0, round((1 - it.price / it.baseline) * 100))
        out.append({
            "id": it.id,
            "seller_id": it.seller_id,
            "name": it.name,
            "category": it.category,
            "price": it.price,
            "discount": discount,
            "status": it.status.value,
            "accepted_by_id": it.accepted_by_id,
            "created_at": it.created_at
        })
    return out

@app.get("/admin/comments")
def admin_comments(user: User = Depends(admin_required), session: Session = Depends(db)):
    """Return all comments."""
    from .models import Comment
    rows = session.query(Comment).order_by(Comment.created_at.desc()).limit(500).all()
    return [{
        "id": c.id,
        "user_id": c.user_id,
        "university": c.university,
        "body": c.body,
        "created_at": c.created_at
    } for c in rows]

# Admin transactions endpoint
@app.get("/admin/transactions")
def admin_transactions(user: User = Depends(admin_required), session: Session = Depends(db)):
    """Return all transactions."""
    rows = session.query(Transaction).order_by(Transaction.created_at.desc()).all()
    out = []
    for t in rows:
        out.append({
            "id": t.id,
            "kind": t.kind,
            "listing_id": t.listing_id,
            "seller_id": t.seller_id,
            "buyer_id": t.buyer_id,
            "created_at": t.created_at
        })
    return out

# Admin messages endpoint
@app.get("/admin/messages")
def admin_messages(user: User = Depends(admin_required), session: Session = Depends(db)):
    """Return all messages with sender email and thread info."""
    rows = session.query(Message, User.email, Thread.kind, Thread.listing_id).join(User, Message.sender_id == User.id).join(Thread, Message.thread_id == Thread.id).order_by(Message.created_at.desc()).limit(1000).all()
    out = []
    for m, email, kind, listing_id in rows:
        out.append({
            "id": m.id,
            "thread_id": m.thread_id,
            "from_email": email or "",
            "kind": kind,
            "listing_id": listing_id,
            "body": m.body,
            "created_at": m.created_at
        })
    return out

# Usage adjustments for admins
@app.get("/admin/usage-adjustments")
def admin_usage_adjustments(user: User = Depends(admin_required), session: Session = Depends(db)):
    """
    Return all meal usage adjustments recorded by users. Each record includes the user, amount of meals
    deducted (negative values indicate usage), optional note, and timestamp. This allows administrators
    to audit meal deduction logs and monitor usage trends.
    """
    rows = session.query(UsageAdjustment).order_by(UsageAdjustment.at.desc()).all()
    out = []
    for ua in rows:
        out.append({
            "id": ua.id,
            "user_id": ua.user_id,
            "meals_used_delta": ua.meals_used_delta,
            "note": ua.note,
            "created_at": ua.at
        })
    return out

# Meal Prices APIs

@app.get("/mealprices", response_model=List[MealPriceOut])
def get_meal_prices(university: str | None = None, session: Session = Depends(db)):
    """
    Return meal price definitions. If a university is provided, only prices for that campus are returned.
    This endpoint does not require admin privileges.
    """
    q = session.query(MealPrice)
    if university:
        q = q.filter(MealPrice.university == university)
    return q.all()

@app.get("/admin/mealprices")
def admin_meal_prices(user: User = Depends(admin_required), university: str | None = None, session: Session = Depends(db)):
    """
    List meal prices for all campuses or a single campus. Accessible to authed admins.
    """
    q = session.query(MealPrice)
    if university:
        q = q.filter(MealPrice.university == university)
    rows = q.order_by(MealPrice.university.asc(), MealPrice.meal_type.asc()).all()
    return [{
        "id": mp.id,
        "university": mp.university,
        "meal_type": mp.meal_type,
        "price": mp.price,
        "created_at": mp.created_at
    } for mp in rows]

@app.post("/admin/mealprices", response_model=MealPriceOut)
def upsert_meal_price(p: MealPriceIn, user: User = Depends(admin_required), session: Session = Depends(db)):
    """
    Create or update a meal price definition. An existing entry with the same university and meal_type
    will be updated; otherwise a new one is created.
    """
    mp = session.query(MealPrice).filter_by(university=p.university, meal_type=p.meal_type).first()
    if mp:
        mp.price = p.price
    else:
        mp = MealPrice(university=p.university, meal_type=p.meal_type, price=p.price)
        session.add(mp)
    session.commit()
    session.refresh(mp)
    return mp

@app.get("/offers/meals", response_model=List[MealOfferOut])
def meals_list(user: User = Depends(authed), session: Session = Depends(db)):
    rows = session.query(MealOffer, User.email).join(User, MealOffer.seller_id == User.id).order_by(MealOffer.created_at.desc()).all()
    out = []
    for o, email in rows:
        out.append({
            "id": o.id,
            "seller": email,
            "meals": o.meals,
            "location": o.location,
            "price": o.price,
            "meal_type": o.meal_type,
            "status": o.status.value,
            "accepted_by": None,
            "created_at": o.created_at,
        })
    return out

@app.post("/offers/meals", response_model=MealOfferOut)
def meals_create(p: MealOfferIn, user: User = Depends(authed), session: Session = Depends(db)):
    # Persist new meal offer with explicit meal type. Default to lunch if none provided.
    o = MealOffer(
        seller_id=user.id,
        meals=p.meals,
        location=p.location,
        price=p.price,
        meal_type=p.meal_type or "lunch"
    )
    session.add(o)
    session.commit()
    session.refresh(o)
    return {
        "id": o.id,
        "seller": user.email,
        "meals": o.meals,
        "location": o.location,
        "price": o.price,
        "meal_type": o.meal_type,
        "status": o.status.value,
        "accepted_by": None,
        "created_at": o.created_at,
    }

@app.post("/offers/meals/{offer_id}/accept")
def meals_accept(offer_id: int, p: AcceptIn, user: User = Depends(authed), session: Session = Depends(db)):
    o = session.query(MealOffer).filter_by(id=offer_id).first()
    if not o or o.status != OfferStatus.active:
        raise HTTPException(400, "Unavailable")
    o.status = OfferStatus.accepted
    o.accepted_by_id = user.id
    o.buyer_message = p.message or ""
    t = Transaction(kind="meal", listing_id=o.id, seller_id=o.seller_id, buyer_id=user.id)
    session.add(t)
    th = session.query(Thread).filter_by(kind="meal", listing_id=o.id).first()
    if not th:
        th = Thread(kind="meal", listing_id=o.id, seller_id=o.seller_id, buyer_id=user.id, open=True)
        session.add(th)
        session.flush()
    m = Message(thread_id=th.id, sender_id=user.id, body=o.buyer_message or "Accepted")
    session.add(m)
    session.commit()
    return {"ok": True}

@app.delete("/offers/meals/{offer_id}")
def meals_cancel(offer_id: int, user: User = Depends(authed), session: Session = Depends(db)):
    o = session.query(MealOffer).filter_by(id=offer_id, seller_id=user.id).first()
    if not o or o.status != OfferStatus.active:
        raise HTTPException(404, "Not found")
    o.status = OfferStatus.cancelled
    session.commit()
    return {"ok": True}

@app.get("/offers/items", response_model=List[ItemOfferOut])
def items_list(user: User = Depends(authed), session: Session = Depends(db)):
    rows = session.query(ItemOffer, User.email).join(User, ItemOffer.seller_id == User.id).order_by(ItemOffer.created_at.desc()).all()
    out = []
    for it, email in rows:
        discount = 0 if not it.baseline else max(0, round((1 - it.price / it.baseline) * 100))
        out.append({"id": it.id, "seller": email, "name": it.name, "category": it.category, "price": it.price, "discount": discount, "img": it.img_data_url or None, "status": it.status.value, "accepted_by": None, "created_at": it.created_at})
    return out

@app.post("/offers/items", response_model=ItemOfferOut)
def items_create(p: ItemOfferIn, user: User = Depends(authed), session: Session = Depends(db)):
    it = ItemOffer(seller_id=user.id, name=p.name, category=p.category, price=p.price, img_data_url=p.img_data_url or None, baseline=p.baseline or 0)
    session.add(it)
    session.commit()
    session.refresh(it)
    discount = 0 if not it.baseline else max(0, round((1 - it.price / it.baseline) * 100))
    return {"id": it.id, "seller": user.email, "name": it.name, "category": it.category, "price": it.price, "discount": discount, "img": it.img_data_url or None, "status": it.status.value, "accepted_by": None, "created_at": it.created_at}

@app.post("/offers/items/{offer_id}/accept")
def items_accept(offer_id: int, p: AcceptIn, user: User = Depends(authed), session: Session = Depends(db)):
    it = session.query(ItemOffer).filter_by(id=offer_id).first()
    if not it or it.status != OfferStatus.active:
        raise HTTPException(400, "Unavailable")
    it.status = OfferStatus.accepted
    it.accepted_by_id = user.id
    it.buyer_message = p.message or ""
    t = Transaction(kind="item", listing_id=it.id, seller_id=it.seller_id, buyer_id=user.id)
    session.add(t)
    th = session.query(Thread).filter_by(kind="item", listing_id=it.id).first()
    if not th:
        th = Thread(kind="item", listing_id=it.id, seller_id=it.seller_id, buyer_id=user.id, open=True)
        session.add(th)
        session.flush()
    m = Message(thread_id=th.id, sender_id=user.id, body=it.buyer_message or "Accepted")
    session.add(m)
    session.commit()
    return {"ok": True}

@app.delete("/offers/items/{offer_id}")
def items_cancel(offer_id: int, user: User = Depends(authed), session: Session = Depends(db)):
    it = session.query(ItemOffer).filter_by(id=offer_id, seller_id=user.id).first()
    if not it or it.status != OfferStatus.active:
        raise HTTPException(404, "Not found")
    it.status = OfferStatus.cancelled
    session.commit()
    return {"ok": True}

@app.get("/inbox/threads", response_model=List[ThreadOut])
def threads(user: User = Depends(authed), session: Session = Depends(db)):
    ths = session.query(Thread).filter((Thread.seller_id == user.id) | (Thread.buyer_id == user.id)).order_by(Thread.created_at.desc()).all()
    out = []
    for t in ths:
        other_id = t.buyer_id if t.seller_id == user.id else t.seller_id
        other_email = session.query(User.email).filter(User.id == other_id).scalar()
        last = session.query(Message).filter_by(thread_id=t.id).order_by(Message.created_at.desc()).first()
        unread = 0
        out.append({"id": t.id, "kind": t.kind, "other_party": other_email or "", "last_body": last.body if last else None, "unread": unread})
    return out

@app.get("/inbox/threads/{thread_id}/messages", response_model=List[MessageOut])
def messages(thread_id: int, user: User = Depends(authed), session: Session = Depends(db)):
    t = session.query(Thread).filter_by(id=thread_id).first()
    if not t or (t.seller_id != user.id and t.buyer_id != user.id):
        raise HTTPException(404, "Not found")
    msgs = session.query(Message, User.email).join(User, Message.sender_id == User.id).filter(Message.thread_id == thread_id).order_by(Message.created_at.asc()).all()
    return [{"from_email": em, "body": m.body, "when": m.created_at} for m, em in msgs]

@app.post("/inbox/threads/{thread_id}/messages", response_model=MessageOut)
def send_message(thread_id: int, p: MessageIn, user: User = Depends(authed), session: Session = Depends(db)):
    t = session.query(Thread).filter_by(id=thread_id).first()
    if not t or (t.seller_id != user.id and t.buyer_id != user.id):
        raise HTTPException(404, "Not found")
    m = Message(thread_id=thread_id, sender_id=user.id, body=p.body)
    session.add(m)
    session.commit()
    em = session.query(User.email).filter(User.id == user.id).scalar() or ""
    return {"from_email": em, "body": m.body, "when": m.created_at}

@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    room = "global"
    await hub.join(room, ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        hub.leave(room, ws)

def log_activity(session, user_id, action, details=None):
    try:
        from .models import Activity
        a = Activity(user_id=user_id, action=action, details=details or "")
        session.add(a)
        session.commit()
    except Exception:
        session.rollback()

@app.get("/admin/activities")
def admin_activities(user: User = Depends(admin_required), session = Depends(db)):
    from .models import Activity
    rows = session.query(Activity).order_by(Activity.created_at.desc()).limit(200).all()
    return [{
        "id": r.id,
        "user_id": r.user_id,
        "action": r.action,
        "details": r.details,
        "created_at": r.created_at
    } for r in rows]

@app.post("/me/change-password")
def change_password(current_password: str, new_password: str, user: User = Depends(authed), session = Depends(db)):
    from .auth import verify_password, hash_password
    if not verify_password(current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password incorrect")
    user.password_hash = hash_password(new_password)
    session.add(user)
    session.commit()
    log_activity(session, user.id, "change_password", "User changed password")
    return {"ok": True}