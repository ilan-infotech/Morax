from datetime import date

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.api.v1.router import router
from app.core.config import settings
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import IndustryType, Organization, State, User, UserRoleScope


def seed_baseline() -> None:
    db = SessionLocal()
    try:
        for name, code in [("Tamil Nadu", "TN"), ("Karnataka", "KA"), ("Maharashtra", "MH"), ("Delhi", "DL")]:
            if not db.scalar(select(State).where(State.code == code)): db.add(State(name=name, code=code))
        for name, code in [
            ("Air Transport Services", "AIR_TRANSPORT"), ("Any Central Govt. Undertaking", "CENTRAL_GOVT"), ("Any Other Industry", "OTHER"),
            ("Audio-video Production", "AUDIO_VIDEO"), ("Banking / Insurance", "BANKING"), ("Beedi & Cigar", "BEEDI"),
            ("Dock Work", "DOCK_WORK"), ("Factory", "FACTORY"), ("IT Services", "IT_SERVICES"), ("Mines", "MINES"),
            ("Motor Transport Undertaking", "MOTOR_TRANSPORT"), ("Newspapers Establishment", "NEWSPAPER"), ("Plantation", "PLANTATION"),
            ("Telecommunication Services", "TELECOM"), ("Commercial", "COMMERCIAL"),
        ]:
            if not db.scalar(select(IndustryType).where(IndustryType.code == code)): db.add(IndustryType(name=name, code=code))
        db.flush()
        organization = db.scalar(select(Organization).where(Organization.code == "MORAX-DEMO"))
        if not organization:
            organization = Organization(name="MORAX Demo Company", legal_name="MORAX Demo Company", code="MORAX-DEMO", compliance_start_date=date.today(), status="CONFIGURED")
            db.add(organization); db.flush()
        user = db.scalar(select(User).where(User.email == settings.bootstrap_admin_email.lower()))
        # Seamlessly repair the development account created by pre-release
        # builds that used a reserved `.local` address rejected by EmailStr.
        if not user and settings.bootstrap_admin_email == "admin@morax.example.com":
            user = db.scalar(select(User).where(User.email == "admin@morax.local"))
            if user:
                user.email = settings.bootstrap_admin_email
        if not user:
            user = User(organization_id=organization.id, name="MORAX Administrator", email=settings.bootstrap_admin_email.lower(), password_hash=hash_password(settings.bootstrap_admin_password), must_change_password=True)
            db.add(user); db.flush()
        # The configured bootstrap account is the only initial platform user.
        # Tenant administrators are represented separately as ORGANIZATION_ADMIN.
        user.platform_role = "MORAX_ADMIN"
        if not db.scalar(select(UserRoleScope).where(UserRoleScope.user_id == user.id, UserRoleScope.role == "ORGANIZATION_ADMIN", UserRoleScope.scope_id == organization.id)):
            db.add(UserRoleScope(user_id=user.id, role="ORGANIZATION_ADMIN", scope_type="ORGANIZATION", scope_id=organization.id))
        db.commit()
    finally:
        db.close()


app = FastAPI(title=settings.app_name, version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origin_list, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.include_router(router, prefix=settings.api_v1_prefix)


@app.on_event("startup")
def startup() -> None:
    settings.upload_path.mkdir(parents=True, exist_ok=True)
    seed_baseline()


@app.get("/health")
def health():
    return {"status": "ok", "service": "morax-api"}
