import os
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings

TURSO_DB_URL = os.getenv("TURSO_DATABASE_URL")
TURSO_AUTH_TOKEN = os.getenv("TURSO_AUTH_TOKEN")

if TURSO_DB_URL and TURSO_AUTH_TOKEN:
    # SQLAlchemy requires the sqlite+libsql:// dialect prefix
    db_url = TURSO_DB_URL.replace("libsql://", "sqlite+libsql://")
    engine = create_engine(
        f"{db_url}?secure=true",
        connect_args={"auth_token": TURSO_AUTH_TOKEN},
        poolclass=NullPool,
    )
else:
    # Fallback to existing local SQLite for development
    engine = create_engine(
        "sqlite:///./morax.db", 
        connect_args={"check_same_thread": False},
        poolclass=NullPool,
    )


@event.listens_for(engine, "connect")
def enable_sqlite_foreign_keys(dbapi_connection, _connection_record):
    if not (TURSO_DB_URL and TURSO_AUTH_TOKEN):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
