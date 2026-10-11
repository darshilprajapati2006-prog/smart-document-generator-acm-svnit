from dotenv import load_dotenv
load_dotenv()

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.documents import router as documents_router
from app.api.auth import router as auth_router
from app.db.seed import seed_database

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize SQLite database and seed default data
    seed_database()
    # Generated PDFs/DOCX files are referenced by persisted document versions.
    # Do not delete them on startup; that would break history and approved downloads.
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
app.include_router(auth_router, prefix="/api")
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
