"""Private Supabase Storage REST client. Credentials are backend-only."""
from __future__ import annotations

import base64
import binascii
import os
import re
import socket
import ssl
from pathlib import Path
from urllib.parse import quote, urlencode, urlsplit

import httpx

REFERENCE_SCHEME = "supabase-storage"


def storage_backend() -> str:
    configured = os.getenv("SMARTDOCS_STORAGE_BACKEND", "").strip().lower()
    on_render = os.getenv("RENDER", "").lower() == "true" or bool(os.getenv("RENDER_SERVICE_ID"))
    backend = configured or ("supabase" if on_render else "local")
    if backend not in {"local", "supabase"}:
        raise RuntimeError("SMARTDOCS_STORAGE_BACKEND must be 'supabase' or 'local'.")
    if on_render and backend != "supabase":
        raise RuntimeError("Local file storage is disabled on Render; configure Supabase Storage.")
    return backend


def storage_config() -> tuple[str, str, str]:
    raw_url = os.getenv("SUPABASE_URL", "").strip()
    key = (os.getenv("SUPABASE_SECRET_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    bucket = os.getenv("SUPABASE_STORAGE_BUCKET", "smartdocs-private").strip()
    if not raw_url or not key or not bucket:
        raise RuntimeError("Supabase Storage requires SUPABASE_URL, SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY), and SUPABASE_STORAGE_BUCKET.")

    try:
        parsed_url = urlsplit(raw_url)
        port = parsed_url.port
    except ValueError:
        raise RuntimeError("SUPABASE_URL is malformed; set it to the HTTPS Supabase project origin.") from None
    if (
        parsed_url.scheme != "https"
        or not parsed_url.hostname
        or parsed_url.username
        or parsed_url.password
        or parsed_url.path not in {"", "/"}
        or parsed_url.query
        or parsed_url.fragment
        or port not in {None, 443}
    ):
        raise RuntimeError("SUPABASE_URL must be the HTTPS project origin on port 443, without credentials, a path, query, or fragment.")
    if bucket != "smartdocs-private":
        raise RuntimeError("SUPABASE_STORAGE_BUCKET must be 'smartdocs-private' to match the provisioned private-bucket policy.")
    hostname = parsed_url.hostname.lower()
    if ":" in hostname and not hostname.startswith("["):
        hostname = f"[{hostname}]"
    # Canonical root origin: env whitespace, host casing and a trailing slash
    # cannot introduce duplicate /storage/v1 path segments.
    return f"https://{hostname}", key, bucket


def _connect_failure_category(exc: BaseException) -> str:
    """Classify nested network causes without exposing their messages or URLs."""
    pending = [exc]
    visited: set[int] = set()
    while pending:
        current = pending.pop()
        if id(current) in visited:
            continue
        visited.add(id(current))
        if isinstance(current, socket.gaierror):
            return "dns"
        if isinstance(current, ssl.SSLError):
            return "tls"
        if isinstance(current, httpx.ProxyError):
            return "proxy"
        if current.__cause__ is not None:
            pending.append(current.__cause__)
        if current.__context__ is not None:
            pending.append(current.__context__)
    return "connection"


def verify_storage_configuration() -> None:
    """Fail startup unless the configured bucket is private and deny policy exists."""
    if storage_backend() != "supabase":
        return
    url, key, bucket = storage_config()
    try:
        with httpx.Client(
            timeout=httpx.Timeout(15.0, connect=5.0),
            headers=_auth_headers(key),
            trust_env=False,
        ) as client:
            response = client.get(f"{url}/storage/v1/bucket/{quote(bucket, safe='')}")
    except httpx.TimeoutException as exc:
        raise RuntimeError("Supabase Storage verification timed out; check Render outbound connectivity and Supabase availability.") from None
    except httpx.InvalidURL as exc:
        raise RuntimeError("Supabase Storage verification URL is invalid; set SUPABASE_URL to the project origin.") from None
    except httpx.RequestError as exc:
        category = _connect_failure_category(exc)
        if category == "dns":
            message = "Supabase Storage DNS resolution failed; check the SUPABASE_URL hostname and Render DNS/outbound access."
        elif category == "tls":
            message = "Supabase Storage TLS verification failed; check the project origin and certificate chain. TLS verification remains enabled."
        elif category == "proxy":
            message = "Supabase Storage proxy connection failed; configure direct outbound access from Render."
        else:
            message = "Supabase Storage connection failed; check the project origin, port 443, and Render outbound access."
        raise RuntimeError(message) from None

    if response.status_code == 401:
        raise RuntimeError("Supabase Storage rejected the backend API key (HTTP 401); verify SUPABASE_SECRET_KEY in Render.")
    if response.status_code == 403:
        raise RuntimeError("Supabase Storage denied bucket verification (HTTP 403); verify the backend key has Storage admin access.")
    if response.status_code == 404:
        raise RuntimeError("Supabase Storage bucket was not found (HTTP 404); verify the project URL and smartdocs-private bucket name.")
    if response.is_error:
        raise RuntimeError(f"Supabase Storage bucket verification failed (HTTP {response.status_code}); check Supabase service status and configuration.")
    try:
        bucket_info = response.json()
    except ValueError as exc:
        raise RuntimeError("Supabase Storage returned an invalid response while verifying the bucket; check Supabase service status.") from exc
    if not isinstance(bucket_info, dict) or bucket_info.get("id") != bucket:
        raise RuntimeError("Supabase Storage returned unexpected bucket details; verify the project URL and smartdocs-private bucket name.")
    if bucket_info.get("public") is not False:
        raise RuntimeError("The configured Supabase Storage bucket must be private.")

    # The backend service key bypasses RLS; the restrictive policy separately
    # prevents browser roles from accessing this bucket if other policies exist.
    from app.db.database import get_db
    try:
        with get_db() as conn:
            policy = conn.execute(
                """SELECT p.permissive, p.roles::text AS roles, p.cmd, p.qual, p.with_check,
                          c.relrowsecurity
                   FROM pg_policies p
                   JOIN pg_class c ON c.relname=p.tablename
                   JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname=p.schemaname
                   WHERE p.schemaname='storage' AND p.tablename='objects'
                     AND p.policyname='smartdocs_private_deny_client_access'"""
            ).fetchone()
    except Exception as exc:
        raise RuntimeError("Could not verify the Supabase Storage access policy.") from exc
    if not policy:
        raise RuntimeError("Apply backend/storage/supabase_storage_setup.sql before starting the backend.")
    roles = set(re.findall(r"[a-z_]+", str(policy["roles"]).lower()))
    normalize = lambda value: re.sub(r"[\s()\"]", "", (value or "").lower()).replace("::text", "")
    if (
        policy["permissive"] != "RESTRICTIVE"
        or policy["cmd"] != "ALL"
        or not policy["relrowsecurity"]
        or not {"anon", "authenticated"}.issubset(roles)
        or normalize(policy["qual"]) != "bucket_id<>'smartdocs-private'"
        or normalize(policy["with_check"]) != "bucket_id<>'smartdocs-private'"
    ):
        raise RuntimeError("Supabase Storage client-deny policy is missing or does not match the required private-bucket policy.")


def storage_reference(key: str, content_type: str, bucket: str | None = None) -> str:
    _, _, configured_bucket = storage_config()
    object_bucket = bucket or configured_bucket
    safe_key = "/".join(quote(part, safe="") for part in key.strip("/").split("/"))
    query = urlencode({"content_type": content_type})
    return f"{REFERENCE_SCHEME}://{quote(object_bucket, safe='')}/{safe_key}?{query}"


def parse_storage_reference(reference: str) -> tuple[str, str, str] | None:
    if not reference.startswith(f"{REFERENCE_SCHEME}://"):
        return None
    from urllib.parse import unquote, parse_qs
    parsed = urlsplit(reference)
    bucket = unquote(parsed.netloc)
    _, _, configured_bucket = storage_config()
    if bucket != configured_bucket:
        raise ValueError("Storage reference points to an unexpected bucket.")
    key = "/".join(unquote(part) for part in parsed.path.lstrip("/").split("/"))
    if not key or any(part in {"", ".", ".."} for part in key.split("/")):
        raise ValueError("Storage reference has an invalid object path.")
    content_type = parse_qs(parsed.query).get("content_type", ["application/octet-stream"])[0]
    return bucket, key, content_type


def _url(bucket: str, key: str) -> str:
    url, _, _ = storage_config()
    object_path = "/".join(quote(part, safe="") for part in key.split("/"))
    return f"{url}/storage/v1/object/{quote(bucket, safe='')}/{object_path}"


def _auth_headers(key: str) -> dict[str, str]:
    headers = {"apikey": key}
    # New Supabase secret keys are API keys, not JWTs; only legacy service_role
    # JWTs should be sent in the Authorization header.
    if not key.startswith("sb_secret_"):
        headers["Authorization"] = f"Bearer {key}"
    return headers


def _client() -> httpx.Client:
    _, key, _ = storage_config()
    return httpx.Client(
        timeout=httpx.Timeout(90.0, connect=10.0),
        headers=_auth_headers(key),
        trust_env=False,
    )


def upload_bytes(key: str, payload: bytes, content_type: str) -> None:
    _, _, bucket = storage_config()
    try:
        with _client() as client:
            response = client.post(
                _url(bucket, key), content=payload,
                headers={"Content-Type": content_type, "x-upsert": "true"},
            )
            response.raise_for_status()
    except httpx.HTTPError as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        suffix = f" (HTTP {status})" if status else ""
        raise RuntimeError(f"Supabase Storage upload failed{suffix}.") from exc


def upload_file(key: str, path: Path, content_type: str) -> None:
    _, _, bucket = storage_config()
    try:
        with path.open("rb") as payload, _client() as client:
            response = client.post(
                _url(bucket, key), content=payload,
                headers={"Content-Type": content_type, "x-upsert": "true"},
            )
            response.raise_for_status()
    except (OSError, httpx.HTTPError) as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        suffix = f" (HTTP {status})" if status else ""
        raise RuntimeError(f"Supabase Storage upload failed{suffix}.") from exc


def download_bytes(reference: str) -> tuple[bytes, str]:
    parsed = parse_storage_reference(reference)
    if not parsed:
        raise ValueError("Not a Supabase Storage reference.")
    bucket, key, content_type = parsed
    try:
        with _client() as client:
            response = client.get(_url(bucket, key))
            response.raise_for_status()
            return response.content, content_type
    except httpx.HTTPError as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        suffix = f" (HTTP {status})" if status else ""
        raise RuntimeError(f"Supabase Storage download failed{suffix}.") from exc


def externalize_signature(data: str | None, document_id: str, version_num: int) -> str | None:
    """Upload a normalized inline PNG and persist only its private object reference."""
    if not data or storage_backend() != "supabase" or data.startswith(f"{REFERENCE_SCHEME}://"):
        return data
    try:
        header, encoded = data.split(",", 1)
        if "image/png" not in header.lower():
            raise ValueError("Only normalized PNG signature images are accepted for storage.")
        image_bytes = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise ValueError("The lead signature image data is invalid.") from exc
    key = f"documents/{document_id}/versions/{version_num}/lead-signature.png"
    upload_bytes(key, image_bytes, "image/png")
    return storage_reference(key, "image/png")


def hydrate_signature(data: dict) -> dict:
    signature = data.get("lead_signature_data")
    if not isinstance(signature, str) or not signature.startswith(f"{REFERENCE_SCHEME}://"):
        return data
    payload, content_type = download_bytes(signature)
    if content_type not in {"image/png", "image/jpeg"}:
        raise RuntimeError("Stored signature has an unsupported content type.")
    hydrated = dict(data)
    hydrated["lead_signature_data"] = f"data:{content_type};base64,{base64.b64encode(payload).decode('ascii')}"
    return hydrated
