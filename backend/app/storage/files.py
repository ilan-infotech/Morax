from pathlib import Path
from uuid import uuid4
import hashlib

from fastapi import HTTPException, UploadFile

from app.core.config import settings

ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".xlsx", ".xls", ".doc", ".docx"}


async def save_upload(upload: UploadFile) -> tuple[str, int, str]:
    suffix = Path(upload.filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(422, "Unsupported file type")
    content = await upload.read()
    if not content:
        raise HTTPException(422, "Uploaded file is empty")
    if len(content) > settings.max_upload_bytes:
        raise HTTPException(413, "File exceeds the configured upload size limit")
    settings.upload_path.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid4()}{suffix}"
    (settings.upload_path / stored_name).write_bytes(content)
    return stored_name, len(content), hashlib.sha256(content).hexdigest()


def file_path(stored_filename: str) -> Path:
    path = (settings.upload_path / stored_filename).resolve()
    if path.parent != settings.upload_path or not path.exists():
        raise HTTPException(404, "Evidence file not found")
    return path


def delete_stored_file(stored_filename: str) -> None:
    path = (settings.upload_path / stored_filename).resolve()
    if path.parent == settings.upload_path and path.exists():
        path.unlink()
