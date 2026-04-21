from __future__ import annotations

import threading

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import events, ingest, model, session
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.database import init_db
from app.services.bootstrap import run_startup_bootstrap

configure_logging()
settings = get_settings()

app = FastAPI(title=settings.app_name, version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    settings.ensure_directories()
    init_db()
    if settings.bootstrap_on_startup:
        threading.Thread(target=run_startup_bootstrap, name="fastf1-bootstrap", daemon=True).start()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": settings.app_name}


app.include_router(events.router, prefix=settings.api_prefix)
app.include_router(ingest.router, prefix=settings.api_prefix)
app.include_router(session.router, prefix=settings.api_prefix)
app.include_router(model.router, prefix=settings.api_prefix)
