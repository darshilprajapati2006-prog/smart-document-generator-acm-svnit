"""Firebase Admin token verification. Credentials come only from backend secrets."""
import json
import os
from functools import lru_cache
from typing import Any, Dict

import firebase_admin
from firebase_admin import auth, credentials


@lru_cache(maxsize=1)
def get_firebase_app():
    try:
        return firebase_admin.get_app()
    except ValueError:
        pass
    raw = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip()
    project_id = os.getenv("FIREBASE_PROJECT_ID", "smartdocs-svnit-6904c")
    if raw:
        cred = credentials.Certificate(json.loads(raw))
    else:
        path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
        if not path:
            raise RuntimeError("Firebase Admin credentials are not configured.")
        cred = credentials.Certificate(path)
    return firebase_admin.initialize_app(cred, {"projectId": project_id})


def verify_firebase_id_token(token: str) -> Dict[str, Any]:
    return auth.verify_id_token(token, app=get_firebase_app(), check_revoked=True)
