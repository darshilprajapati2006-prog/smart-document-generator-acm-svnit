import os
from pathlib import Path
from typing import List

class Settings:
    PROJECT_NAME: str = "Smart Document Generator — ACM SVNIT"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api"
    
    # Base directory paths
    BACKEND_DIR: Path = Path(__file__).resolve().parent.parent.parent
    PROJECT_ROOT: Path = BACKEND_DIR.parent
    ASSETS_DIR: Path = PROJECT_ROOT / "assets" / "branding"
    STORAGE_DIR: Path = BACKEND_DIR / "generated_docs"
    
    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://smart-document-generator-acm-svnit.vercel.app",
    ]
    
    # Custom CORS via env if set
    env_origins = os.getenv("ALLOWED_ORIGINS") or os.getenv("FRONTEND_URL")
    if env_origins:
        CORS_ORIGINS.extend([origin.strip() for origin in env_origins.split(",") if origin.strip()])

    def __init__(self):
        self.STORAGE_DIR.mkdir(parents=True, exist_ok=True)

settings = Settings()
