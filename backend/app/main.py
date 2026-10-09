from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.documents import router as documents_router
from app.utils.file_manager import file_manager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Clean up any stale files on startup
    file_manager.cleanup_old_files()
    yield

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="API for automated official ACM SVNIT document generation",
    version=settings.VERSION,
    lifespan=lifespan,
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers
app.include_router(documents_router, prefix="/api")


@app.get("/")
def root():
    return {
        "message": "Smart Document Generator API is running",
        "version": settings.VERSION,
        "docs_url": "/docs"
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME
    }