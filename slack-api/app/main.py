# Main entrypoint for slack-api service
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers.trips import router as trips_router
from app.routers.bookings import router as bookings_router
from app.routers.disruptions import router as disruptions_router
from app.routers.members import router as members_router
from app.routers.core import router as core_router

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
app.include_router(trips_router)
app.include_router(bookings_router)
app.include_router(disruptions_router)
app.include_router(members_router)
app.include_router(core_router)
@app.get("/health")
def health_check():
    return {"status": "ok", "service": "slack-api"}
