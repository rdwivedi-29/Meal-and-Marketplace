from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
import os
import socket

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./app.db")

# 🧩 Force IPv4 resolution for Render → Supabase
if "supabase.co" in DATABASE_URL:
    try:
        # Resolve IPv4 address manually
        ipv4_addr = socket.gethostbyname("db.sjzmvdgqiywvayenhygc.supabase.co")
        os.environ["PGHOSTADDR"] = ipv4_addr
    except Exception as e:
        print("⚠️ Could not resolve IPv4 address:", e)

# For local SQLite fallback
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, pool_pre_ping=True, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()
