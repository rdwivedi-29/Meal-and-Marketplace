# Backend Deployment (FastAPI + Supabase Postgres)

## Environment
- Duplicate `.env.example` to `.env` on your hosting platform (Render/Railway/Fly).
- Fill `DATABASE_URL` with your Supabase URI **including** `?sslmode=require`.
- Set `JWT_SECRET` to a long random value.
- Set `CORS_ORIGINS` to include your Vercel domains.

## Run locally
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload

## Deploy command
Build: pip install -r requirements.txt
Start: uvicorn app:app --host 0.0.0.0 --port $PORT
