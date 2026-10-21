from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator


# These are MORAX classifications used to organise documents.  They deliberately
# describe the artefact expected from a compliance, rather than a legal outcome.
DOCUMENT_TYPES = (
    "PROCEDURAL",
    "REGISTER",
    "REMITTANCE",
    "RETURN",
    "RECORDS",
    "INTIMATION_FILING",
    "DISPLAY",
    "NOTICE",
)


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel):
    items: list[Any]
    total: int
    page: int
    page_size: int


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict[str, Any]


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=8)
    new_password: str = Field(min_length=8)


class AccountActivationInput(BaseModel):
    token: str = Field(min_length=32, max_length=512)
    password: str = Field(min_length=8, max_length=256)


class OrganizationInput(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    legal_name: str | None = None
    code: str = Field(min_length=2, max_length=50)
    identifiers: str | None = None
    address: str | None = None
    state_id: str | None = None
    contact_email: EmailStr | None = None
    contact_phone: str | None = None
    compliance_start_date: date | None = None
    status: str = "DRAFT"


class PlatformOrganizationInput(BaseModel):
    organization_name: str = Field(min_length=2, max_length=200)
    organization_code: str = Field(min_length=2, max_length=50, pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]*$")
    legal_name: str | None = Field(default=None, max_length=250)
    registration_number: str | None = Field(default=None, max_length=100)
    pan: str | None = Field(default=None, max_length=20)
    gstin: str | None = Field(default=None, max_length=30)
    registered_address: str | None = None
    city: str | None = Field(default=None, max_length=100)
    state_id: str | None = None
    pincode: str | None = Field(default=None, max_length=20)
    primary_contact_name: str | None = Field(default=None, max_length=150)
    primary_contact_email: EmailStr | None = None
    primary_contact_phone: str | None = Field(default=None, max_length=50)
    compliance_start_date: date | None = None
    status: str = "ACTIVE"
    # Required only by the organization-create endpoint. They stay optional
    # here so an organization edit does not overwrite its administrator
    # account or password.
    organization_admin_name: str | None = Field(default=None, min_length=2, max_length=150)
    organization_admin_email: EmailStr | None = None
    organization_admin_password: str | None = Field(default=None, min_length=8, max_length=256, repr=False)


class OrganizationStatusInput(BaseModel):
    status: str = Field(pattern="^(ACTIVE|INACTIVE)$")


class DevelopmentResetInput(BaseModel):
    confirmation_code: str = Field(min_length=2, max_length=50)


class UnitInput(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    code: str = Field(min_length=2, max_length=50)
    unit_type: str | None = None
    industry_type_id: str
    other_industry_name: str | None = Field(default=None, max_length=150)
    state_id: str
    city_id: str | None = None
    city: str | None = None
    pincode: str | None = None
    address: str | None = None
    registration_identifiers: str | None = None
    gstin: str | None = None
    pan: str | None = None
    lin: str | None = None
    employer_name: str | None = None
    contact_email: EmailStr | None = None
    contact_phone: str | None = None
    worker_limit: int | None = Field(default=None, ge=0)
    applicable_regulations: str | None = None
    male_employees: int = Field(default=0, ge=0)
    female_employees: int = Field(default=0, ge=0)
    compliance_start_date: date
    status: str = "ACTIVE"


class ContractorInput(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    code: str = Field(min_length=2, max_length=50)
    unit_id: str
    contractor_type: str | None = None
    industry_type_id: str | None = None
    other_industry_name: str | None = Field(default=None, max_length=150)
    # Location is copied from the selected Principal Employer by the server.
    state_id: str | None = None
    city_id: str | None = None
    contact_email: EmailStr | None = None
    contact_phone: str | None = None
    address: str | None = None
    city: str | None = None
    pincode: str | None = None
    registration_identifiers: str | None = None
    gstin: str | None = None
    pan: str | None = None
    lin: str | None = None
    applicable_regulations: str | None = None
    male_workers: int = Field(default=0, ge=0)
    female_workers: int = Field(default=0, ge=0)
    effective_date: date | None = None
    compliance_start_date: date | None = None
    contract_start_date: date | None = None
    contract_end_date: date | None = None
    work_order_expiry_date: date | None = None
    maker_user_id: str | None = Field(default=None, exclude=True)
    checker_user_id: str | None = Field(default=None, exclude=True)
    status: str = "ACTIVE"

    @model_validator(mode="after")
    def contract_dates_are_in_order(self) -> "ContractorInput":
        if self.contract_end_date and not self.contract_start_date:
            raise ValueError("Contract Start Date is required when Contract End Date is supplied")
        if self.contract_start_date and self.contract_end_date and self.contract_end_date < self.contract_start_date:
            raise ValueError("Contract End Date cannot be earlier than Contract Start Date")
        return self


class ContractorSiteInput(BaseModel):
    contractor_id: str
    unit_id: str | None = None
    name: str = Field(min_length=2, max_length=200)
    code: str = Field(min_length=2, max_length=50)
    unit_type: str | None = None
    industry_type_id: str
    other_industry_name: str | None = Field(default=None, max_length=150)
    state_id: str
    city_id: str | None = None
    city: str | None = None
    pincode: str | None = None
    address: str | None = None
    registration_identifiers: str | None = None
    gstin: str | None = None
    pan: str | None = None
    lin: str | None = None
    applicable_regulations: str | None = None
    male_workers: int = Field(default=0, ge=0)
    female_workers: int = Field(default=0, ge=0)
    compliance_start_date: date
    status: str = "ACTIVE"


class UserInput(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    email: EmailStr
    mobile: str | None = None
    active: bool = True


class UserUpdateInput(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=150)
    mobile: str | None = None
    active: bool | None = None


class RoleScopeInput(BaseModel):
    role: str
    scope_type: str
    scope_id: str


class UserCreateInput(UserInput):
    """Provision a user, password, and authorization choices in one transaction."""
    password: str = Field(min_length=8, max_length=256, repr=False)
    role_scopes: list[RoleScopeInput] = Field(default_factory=list)
    module_permissions: list[str] = Field(default_factory=list)


class EntityUserAssignmentInput(BaseModel):
    user_id: str
    # Entity forms use the friendly roles; the API maps these to existing
    # concrete RBAC roles for a Unit or Contractor scope.
    role: str = Field(pattern="^(ADMIN|MAKER|CHECKER)$")


class ActivityInput(BaseModel):
    filing_reference: str | None = None
    completed_on: date | None = None
    amount: float | None = None
    remarks: str | None = None
    row_version: int


class AssignmentInput(BaseModel):
    user_id: str
    assignment_type: str


class WorkflowDecision(BaseModel):
    comment: str = Field(min_length=1, max_length=4000)
    row_version: int


class SubmissionInput(BaseModel):
    row_version: int


class CommentInput(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class EvidenceVerificationInput(BaseModel):
    verification_state: str
    reason: str | None = Field(default=None, max_length=4000)


class NotApplicableInput(BaseModel):
    reason: str = Field(min_length=3, max_length=4000)


class RuleInput(BaseModel):
    compliance_id: str
    name: str
    description: str | None = None
    act: str | None = None
    rule_reference: str | None = None
    section: str | None = None
    compliance_type: str | None = None
    document_type: str | None = None
    form_number: str | None = None
    legal_description: str | None = None
    consequence_or_penalty: str | None = None
    version: int = Field(ge=1)
    entity_type: str
    state_id: str | None = None
    industry_type_id: str | None = None
    frequency: str
    applicable_months: list[int] = Field(default_factory=list)
    due_date_rule: str = "FIXED_DAY_OF_MONTH"
    due_date_offset: int | None = None
    due_date_anchor: str | None = None
    grace_days: int = 0
    required_document: str | None = None
    risk_level: str = "MEDIUM"
    effective_from: date
    effective_to: date | None = None
    active: bool = True

    @field_validator("document_type")
    @classmethod
    def document_type_is_supported(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        normalized = value.strip().upper().replace("/", "_").replace("-", "_").replace(" ", "_")
        aliases = {
            "REGISTERS": "REGISTER",
            "RETURNS": "RETURN",
            "RECORD": "RECORDS",
            "SUPPORTING_RECORD": "RECORDS",
            "SUPPORTING_EVIDENCE": "RECORDS",
            "INTIMATION_FILING": "INTIMATION_FILING",
        }
        normalized = aliases.get(normalized, normalized)
        if normalized not in DOCUMENT_TYPES:
            raise ValueError("Document Type must be one of: " + ", ".join(DOCUMENT_TYPES))
        return normalized

    @model_validator(mode="after")
    def effective_dates_are_in_order(self) -> "RuleInput":
        if self.effective_to and self.effective_to < self.effective_from:
            raise ValueError("Effective To cannot be earlier than Effective From")
        return self

    @field_validator("applicable_months")
    @classmethod
    def months_are_valid(cls, values: list[int]) -> list[int]:
        normalized = sorted(set(values))
        if any(month < 1 or month > 12 for month in normalized):
            raise ValueError("Applicable months must be between 1 and 12")
        return normalized


class RuleStatusInput(BaseModel):
    active: bool


class GenerationRequest(BaseModel):
    subject_type: str | None = None
    subject_id: str | None = None
    as_of_date: date | None = None
