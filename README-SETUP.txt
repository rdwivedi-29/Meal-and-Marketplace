Local Run
1) Backend
   cd backend
   python -m venv .venv && . .venv/bin/activate   # Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   uvicorn app:app --reload --port 8000

2) Frontend
   cd ../frontend
   python -m http.server 5500
   Open http://127.0.0.1:5500

Docker + Postgres
cd backend
docker compose -f docker-compose.postgres.yml up --build
