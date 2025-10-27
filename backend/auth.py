from datetime import datetime, timedelta, timezone
from passlib.context import CryptContext
from jose import jwt
import os

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
JWT_SECRET = os.getenv("JWT_SECRET", "change-me")
JWT_ISS = os.getenv("JWT_ISS", "meal-arb")
JWT_AUD = os.getenv("JWT_AUD", "meal-arb-web")
JWT_EXPIRE_MIN = int(os.getenv("JWT_EXPIRE_MIN", "43200"))

def hash_password(raw: str) -> str:
    return pwd.hash(raw)

def verify_password(raw: str, hashed: str) -> bool:
    return pwd.verify(raw, hashed)

def make_token(sub: str, remember: bool) -> str:
    exp_min = JWT_EXPIRE_MIN if remember else 120
    now = datetime.now(timezone.utc)
    payload = {"sub": sub, "iss": JWT_ISS, "aud": JWT_AUD, "iat": int(now.timestamp()), "exp": int((now + timedelta(minutes=exp_min)).timestamp())}
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")

def parse_token(token: str) -> str:
    data = jwt.decode(token, JWT_SECRET, algorithms=["HS256"], audience=JWT_AUD, issuer=JWT_ISS)
    return data["sub"]
