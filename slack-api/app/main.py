# Main entrypoint for slack-api service
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routes import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Seed demo users on startup (idempotent — safe to call every time)."""
    try:
        from app.auth import hash_password
        from app.database import db_seed_demo_users
        db_seed_demo_users(hash_password)
    except Exception as e:
        print(f"[startup] Warning: Could not seed demo users: {e}")
    yield


app = FastAPI(
    title="Slack API",
    description="Backend service for Slack Travel Disruption Recovery Engine",
    version="0.1.0",
    lifespan=lifespan,
)

# Configure CORS — allow frontend origin explicitly (required for Authorization header)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routes
app.include_router(router)

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "slack-api"}
