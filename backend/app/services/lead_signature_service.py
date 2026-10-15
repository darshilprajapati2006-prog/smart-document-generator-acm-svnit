"""Validation and rendering helpers for private student lead signature images."""
import base64
import binascii
from io import BytesIO

from PIL import Image, UnidentifiedImageError

MAX_SIGNATURE_BYTES = 1024 * 1024
MAX_SIGNATURE_DIMENSION = 4000
MAX_NORMALIZED_BYTES = 1024 * 1024


def normalize_lead_signature(data: str | None, confirmed: bool) -> str | None:
    if not data:
        return None
    if not confirmed:
        raise ValueError("Confirm authorization before using the lead signature.")
    try:
        header, encoded = data.split(",", 1) if data.startswith("data:") else ("", data)
        raw = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error):
        raise ValueError("The signature image upload is invalid.")
    if not raw or len(raw) > MAX_SIGNATURE_BYTES:
        raise ValueError("The signature image must be 1 MB or smaller.")
    try:
        image = Image.open(BytesIO(raw))
        if image.format not in {"PNG", "JPEG"}:
            raise ValueError("Upload a PNG, JPG, or JPEG signature image.")
        if image.width > MAX_SIGNATURE_DIMENSION or image.height > MAX_SIGNATURE_DIMENSION:
            raise ValueError("The signature image dimensions are too large.")
        image.load()
        image = image.convert("RGBA")
        output = BytesIO()
        image.save(output, format="PNG", optimize=True)
        if output.tell() > MAX_NORMALIZED_BYTES:
            raise ValueError("The optimized signature image must be 1 MB or smaller.")
    except (UnidentifiedImageError, OSError):
        raise ValueError("The uploaded file is not a valid PNG or JPEG image.")
    return "data:image/png;base64," + base64.b64encode(output.getvalue()).decode("ascii")


def lead_signature_stream(data: str | None) -> BytesIO | None:
    if not data:
        return None
    try:
        _, encoded = data.split(",", 1)
        return BytesIO(base64.b64decode(encoded, validate=True))
    except (ValueError, binascii.Error):
        return None
