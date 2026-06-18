from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.router import api_router
from app.core.config import settings
from app.core.logging import configure_logging, get_logger
from app.storage.service import init_storage

configure_logging()
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create the local storage folder structure on startup.
    init_storage()

    # Seed default data
    from app.utils.seed import seed_notification_templates
    seed_notification_templates()

    # Start centralized job scheduler (seeds defaults + registers all enabled jobs)
    from app.services.scheduler_service import get_scheduler
    scheduler = get_scheduler()
    scheduler.start()
    logger.info("app.startup", project=settings.PROJECT_NAME)
    yield
    scheduler.shutdown(wait=False)
    logger.info("app.shutdown")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="0.1.0",
    description="Phase 1 foundation — authentication & shared infrastructure.",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url=f"{settings.API_V1_PREFIX}/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_PREFIX)

_STATIC_DIR = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=str(_STATIC_DIR)), name="static")


@app.get("/", tags=["root"])
def root() -> dict[str, str]:
    return {
        "service": settings.PROJECT_NAME,
        "docs": "/docs",
        "health": f"{settings.API_V1_PREFIX}/health",
    }
