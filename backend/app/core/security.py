from datetime import timezone, datetime, timedelta
from uuid import uuid4

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

# passlib 1.7.x is incompatible with bcrypt 5.x in the supplied environment.
# PBKDF2-SHA256 is maintained by Passlib, requires no native extension, and is
# an appropriate secure password hash for the MVP.
password_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

_COMMON_PASSWORDS = {
    "password", "password1", "password123", "admin123", "admin@123",
    "welcome", "welcome1", "qwerty", "qwerty123", "letmein",
    "12345678", "123456789", "morax123", "morax@123",
}


def hash_password(password: str) -> str:
    return password_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return password_context.verify(password, password_hash)


def password_strength_error(password: str) -> str | None:
    """Return a user-safe strength error without storing the password."""
    if len(password) < 8:
        return "New password must contain at least 8 characters"
    if password.lower() in _COMMON_PASSWORDS:
        return "Choose a less common password"
    classes = sum((
        any(char.islower() for char in password),
        any(char.isupper() for char in password),
        any(char.isdigit() for char in password),
        any(not char.isalnum() for char in password),
    ))
    if classes < 3:
        return "Use at least three character types: lowercase, uppercase, number, or symbol"
    return None


def create_access_token(user_id: str, session_id: str) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_minutes)
    return jwt.encode(
        {"sub": user_id, "sid": session_id, "jti": str(uuid4()), "exp": expires_at},
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )


def decode_access_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise ValueError("Invalid or expired access token") from exc
