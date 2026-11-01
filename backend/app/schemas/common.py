from datetime import date, datetime
import re
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

UNIT_COMPLIANCE_TYPES = {
    "Shops & Establishments",
    "Mines",
    "BOCW",
    "ESI",
    "PF",
}


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


class ContractorContextInput(BaseModel):
    contractor_id: str = Field(min_length=1, max_length=36)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict[str, Any]


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=8)
    new_password: str = Field(min_length=8)


class ProfileUpdateInput(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    mobile: str | None = Field(default=None, max_length=20)

    @field_validator("mobile")
    @classmethod
    def validate_mobile(cls, value: str | None) -> str | None:
        if not value:
            return None
        normalized = re.sub(r"[\s-]", "", value)
        if not re.fullmatch(r"[6-9]\d{9}", normalized):
            raise ValueError("Enter a valid 10-digit Indian mobile number")
        return normalized


class AdministratorPasswordResetInput(BaseModel):
    """A replacement password selected by an authorized MORAX administrator."""
    new_password: str = Field(min_length=8, max_length=256, repr=False)


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
    city: str | None = Field(default=None, max_length=100)
    contact_email: EmailStr | None = None
    contact_phone: str | None = None
    compliance_start_date: date | None = None
    status: str = "DRAFT"


class PlatformOrganizationInput(BaseModel):
    organization_name: str = Field(min_length=2, max_length=200)
    organization_code: str | None = Field(default=None, max_length=50, pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]*$")
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

    @field_validator("primary_contact_phone")
    @classmethod
    def valid_primary_contact_mobile(cls, value: str | None) -> str | None:
        if value is not None and value.strip() and not re.fullmatch(r"[6-9]\d{9}", value.strip()):
            raise ValueError("Contact phone must be a valid 10-digit Indian mobile number")
        return value.strip() if value else None


class OrganizationStatusInput(BaseModel):
    status: str = Field(pattern="^(ACTIVE|INACTIVE)$")


class DevelopmentResetInput(BaseModel):
    confirmation_code: str = Field(min_length=2, max_length=50)


class OrganizationDeleteInput(BaseModel):
    """Explicit confirmation required before permanently deleting a tenant."""
    confirmation_code: str = Field(min_length=2, max_length=50)


class UnitInput(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    code: str | None = Field(default=None, max_length=50)
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
    employer_name: str = Field(min_length=2, max_length=250)
    contact_email: EmailStr | None = None
    contact_phone: str | None = None
    worker_limit: int | None = Field(default=None, ge=0)
    applicable_regulations: str | None = None
    compliance_types: list[str] = Field(default_factory=list)
    male_employees: int = Field(default=0, ge=0)
    female_employees: int = Field(default=0, ge=0)
    effective_date: date | None = None
    compliance_start_date: date
    status: str = "ACTIVE"

    @field_validator("contact_phone")
    @classmethod
    def valid_mobile(cls, value: str | None) -> str | None:
        if value is not None and value.strip() and not re.fullmatch(r"[6-9]\d{9}", value.strip()):
            raise ValueError("Mobile number must be a valid 10-digit Indian mobile number")
        return value.strip() if value else None

    @field_validator("employer_name")
    @classmethod
    def employer_name_is_required(cls, value: str) -> str:
        if len(value.strip()) < 2:
            raise ValueError("Employer Name is required")
        return value.strip()

    @field_validator("pan")
    @classmethod
    def valid_pan(cls, value: str | None) -> str | None:
        if value is not None and value.strip() and not re.fullmatch(r"[A-Z]{5}\d{4}[A-Z]", value.strip().upper()):
            raise ValueError("PAN must use the format ABCDE1234F")
        return value.strip().upper() if value else None

    @field_validator("gstin")
    @classmethod
    def valid_gstin(cls, value: str | None) -> str | None:
        if value is not None and value.strip() and not re.fullmatch(r"\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]", value.strip().upper()):
            raise ValueError("GSTIN must be a valid 15-character GSTIN")
        return value.strip().upper() if value else None

    @field_validator("compliance_types")
    @classmethod
    def valid_compliance_types(cls, values: list[str]) -> list[str]:
        invalid = set(values) - UNIT_COMPLIANCE_TYPES
        if invalid:
            raise ValueError(f"Unsupported unit compliance type: {', '.join(sorted(invalid))}")
        return list(dict.fromkeys(values))


class PendingEntityUserInput(BaseModel):
    """User credentials staged inside an entity form and created atomically."""

    name: str = Field(min_length=2, max_length=150)
    email: EmailStr
    mobile: str | None = Field(default=None, max_length=30)
    password: str = Field(min_length=8, max_length=256, repr=False)

    @field_validator("mobile")
    @classmethod
    def valid_pending_mobile(cls, value: str | None) -> str | None:
        if value is not None and value.strip() and not re.fullmatch(r"[6-9]\d{9}", value.strip()):
            raise ValueError("Mobile number must be a valid 10-digit Indian mobile number")
        return value.strip() if value else None


class ContractorInput(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    code: str | None = Field(default=None, max_length=50)
    unit_id: str
    contractor_type: str | None = None
    industry_type_id: str | None = None
    other_industry_name: str | None = Field(default=None, max_length=150)
    # Contractors may operate in a different State from their Principal Employer.
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
    maker_new_user: PendingEntityUserInput | None = Field(default=None, exclude=True)
    checker_user_id: str | None = Field(default=None, exclude=True)
    contractor_maker_email: EmailStr | None = Field(default=None, exclude=True)
    contractor_maker_password: str | None = Field(default=None, min_length=8, max_length=256, exclude=True, repr=False)
    status: str = "ACTIVE"

    @model_validator(mode="after")
    def contract_dates_are_in_order(self) -> "ContractorInput":
        if self.maker_user_id and self.maker_new_user:
            raise ValueError("Select an existing Maker or create a new Maker, not both")
        if bool(self.contractor_maker_email) != bool(self.contractor_maker_password):
            raise ValueError("Contractor Maker email and password must be provided together")
        if self.contract_end_date and not self.contract_start_date:
            raise ValueError("Contract Start Date is required when Contract End Date is supplied")
        if self.contract_start_date and self.contract_end_date and self.contract_end_date < self.contract_start_date:
            raise ValueError("Contract End Date cannot be earlier than Contract Start Date")
        return self

    @field_validator("contact_phone")
    @classmethod
    def valid_mobile(cls, value: str | None) -> str | None:
        if value is not None and value.strip() and not re.fullmatch(r"[6-9]\d{9}", value.strip()):
            raise ValueError("Mobile number must be a valid 10-digit Indian mobile number")
        return value.strip() if value else None

    @field_validator("pan")
    @classmethod
    def valid_pan(cls, value: str | None) -> str | None:
        if value is not None and value.strip() and not re.fullmatch(r"[A-Z]{5}\d{4}[A-Z]", value.strip().upper()):
            raise ValueError("PAN must use the format ABCDE1234F")
        return value.strip().upper() if value else None

    @field_validator("gstin")
    @classmethod
    def valid_gstin(cls, value: str | None) -> str | None:
        if value is not None and value.strip() and not re.fullmatch(r"\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]", value.strip().upper()):
            raise ValueError("GSTIN must be a valid 15-character GSTIN")
        return value.strip().upper() if value else None


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

    @field_validator("mobile")
    @classmethod
    def valid_mobile(cls, value: str | None) -> str | None:
        if value is not None and value.strip() and not re.fullmatch(r"[6-9]\d{9}", value.strip()):
            raise ValueError("Mobile number must be a valid 10-digit Indian mobile number")
        return value.strip() if value else None


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


class SupportTicketInput(BaseModel):
    subject: str = Field(min_length=3, max_length=250)
    category: str = Field(min_length=2, max_length=80)
    issue_type: str = Field(pattern="^(PRODUCTION_ISSUE|BUG_FIX|ENHANCEMENT|UI_UX|OTHER)$")
    priority: str = Field(pattern="^(LOW|MEDIUM|HIGH|URGENT)$")
    description: str = Field(min_length=3, max_length=10000)


class SupportTicketReplyInput(BaseModel):
    body: str = Field(min_length=1, max_length=10000)


class SupportTicketUpdateInput(BaseModel):
    status: str | None = Field(default=None, pattern="^(OPEN|IN_PROGRESS|WAITING_ON_CUSTOMER|RESOLVED|CLOSED)$")
    issue_type: str | None = Field(default=None, pattern="^(PRODUCTION_ISSUE|BUG_FIX|ENHANCEMENT|UI_UX|OTHER)$")
    priority: str | None = Field(default=None, pattern="^(LOW|MEDIUM|HIGH|URGENT)$")
    assigned_to_id: str | None = None


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
    employee_threshold: int | None = Field(default=None, ge=0)
    unit_compliance_types: list[str] = Field(default_factory=list)
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

    @field_validator("frequency")
    @classmethod
    def frequency_is_supported(cls, value: str) -> str:
        normalized = value.strip().upper().replace(" ", "_")
        aliases = {"YEARLY": "ANNUAL", "HALF-YEARLY": "HALF_YEARLY"}
        normalized = aliases.get(normalized, normalized)
        supported = {"ONE_TIME", "DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "HALF_YEARLY", "ANNUAL", "EVENT_BASED"}
        if normalized not in supported:
            raise ValueError("Unsupported frequency")
        return normalized

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
        if self.frequency.upper() == "MONTHLY" and self.due_date_rule.upper() == "FIXED_DAY_OF_MONTH" and self.due_date_offset is None:
            self.due_date_offset = 15
        return self

    @field_validator("applicable_months")
    @classmethod
    def months_are_valid(cls, values: list[int]) -> list[int]:
        normalized = sorted(set(values))
        if any(month < 1 or month > 12 for month in normalized):
            raise ValueError("Applicable months must be between 1 and 12")
        return normalized

    @field_validator("unit_compliance_types")
    @classmethod
    def rule_unit_compliance_types_are_valid(cls, values: list[str]) -> list[str]:
        invalid = set(values) - UNIT_COMPLIANCE_TYPES
        if invalid:
            raise ValueError(f"Unsupported Unit Compliance Type: {', '.join(sorted(invalid))}")
        return list(dict.fromkeys(values))


class RuleStatusInput(BaseModel):
    active: bool


class ComplianceMasterDeleteInput(BaseModel):
    confirmation: str = Field(min_length=1, max_length=250)


class ComplianceActStatusInput(BaseModel):
    act: str = Field(min_length=1, max_length=250)
    active: bool


class ComplianceActDeleteInput(BaseModel):
    act: str = Field(min_length=1, max_length=250)
    confirmation: str = Field(min_length=1, max_length=250)


class GenerationRequest(BaseModel):
    # Product Admin generation is deliberately targeted at a customer tenant.
    # Compliance rules live in the internal platform tenant, but obligations
    # must never be generated for that tenant or its development seed data.
    organization_id: str | None = None
    subject_type: str | None = None
    subject_id: str | None = None
    as_of_date: date | None = None


class RegisterTemplateInput(BaseModel):
    code: str = Field(min_length=2, max_length=30)
    name: str = Field(min_length=3, max_length=250)
    category: str = Field(default="STATUTORY_REGISTER", max_length=100)
    description: str | None = Field(default=None, max_length=4000)
    entity_scope: str = Field(default="ALL", pattern="^(ALL|UNIT|CONTRACTOR|CONTRACTOR_SITE)$")
    frequency: str = Field(default="MONTHLY", max_length=30)
    applicable_legislation: str | None = Field(default=None, max_length=300)
    applicable_rule: str | None = Field(default=None, max_length=300)
    form_number: str | None = Field(default=None, max_length=100)
    jurisdiction: str | None = Field(default=None, max_length=100)
    effective_from: date | None = None
    effective_to: date | None = None
    config: dict = Field(default_factory=dict)


class RegisterMappingInput(BaseModel):
    dataset_type: str = Field(pattern="^(EMPLOYEE|ATTENDANCE|PAYROLL)$")
    name: str = Field(min_length=2, max_length=150)
    mapping: dict[str, str] = Field(default_factory=dict)


class RegisterGenerationInput(BaseModel):
    entity_type: str = Field(pattern="^(UNIT|CONTRACTOR|CONTRACTOR_SITE)$")
    entity_id: str
    period_key: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    template_version_ids: list[str] = Field(min_length=1, max_length=20)
    due_date: date | None = None


class RegisterDecisionInput(BaseModel):
    row_version: int
    remarks: str | None = Field(default=None, max_length=4000)


class RegisterComplianceLinkInput(BaseModel):
    compliance_instance_id: str


class LicenseTypeInput(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    category: str = Field(default="STATUTORY_LICENSE", max_length=100)
    description: str | None = Field(default=None, max_length=4000)
    applicable_entity_type: str = Field(default="ALL", pattern="^(ALL|UNIT|CONTRACTOR|CONTRACTOR_SITE)$")
    applicable_state: str | None = Field(default=None, max_length=100)
    issuing_department: str | None = Field(default=None, max_length=200)
    issuing_authority: str | None = Field(default=None, max_length=200)
    renewal_required: bool = True
    default_validity_days: int | None = Field(default=None, ge=1, le=36500)
    default_reminder_days: int = Field(default=30, ge=0, le=365)
    applicable_legislation: str | None = Field(default=None, max_length=300)
    applicable_rule: str | None = Field(default=None, max_length=300)
    active: bool = True


class LicenseInput(BaseModel):
    entity_type: str = Field(pattern="^(UNIT|CONTRACTOR|CONTRACTOR_SITE)$")
    entity_id: str = Field(min_length=1, max_length=36)
    license_type_id: str = Field(min_length=1, max_length=36)
    license_name: str = Field(min_length=2, max_length=250)
    license_number: str | None = Field(default=None, max_length=150)
    issuing_department: str | None = Field(default=None, max_length=200)
    issuing_authority: str | None = Field(default=None, max_length=200)
    applicable_state: str | None = Field(default=None, max_length=100)
    registration_number: str | None = Field(default=None, max_length=150)
    application_number: str | None = Field(default=None, max_length=150)
    issue_date: date | None = None
    valid_from: date
    valid_until: date | None = None
    never_expires: bool = False
    renewal_required: bool = True
    renewal_frequency: str | None = Field(default=None, max_length=50)
    reminder_days: int = Field(default=30, ge=0, le=365)
    remarks: str | None = Field(default=None, max_length=4000)

    @model_validator(mode="after")
    def license_dates(self) -> "LicenseInput":
        if self.never_expires and self.valid_until:
            raise ValueError("Valid Until must be empty when Does Not Expire is selected")
        if not self.never_expires and not self.valid_until:
            raise ValueError("Valid Until is required unless Does Not Expire is selected")
        if self.valid_until and self.valid_until < self.valid_from:
            raise ValueError("Valid Until cannot be earlier than Valid From")
        if self.issue_date and self.issue_date > self.valid_from:
            raise ValueError("Issue Date cannot be later than Valid From")
        return self


class LicenseArchiveInput(BaseModel):
    reason: str = Field(min_length=3, max_length=1000)
    row_version: int


class LicenseRenewalInput(BaseModel):
    application_number: str | None = Field(default=None, max_length=150)
    submitted_on: date | None = None
    new_license_number: str | None = Field(default=None, max_length=150)
    new_valid_from: date | None = None
    new_valid_until: date | None = None
    never_expires: bool = False
    remarks: str | None = Field(default=None, max_length=4000)
    row_version: int | None = None

    @model_validator(mode="after")
    def renewal_dates(self) -> "LicenseRenewalInput":
        if self.new_valid_until and not self.new_valid_from:
            raise ValueError("New Valid From is required when New Valid Until is supplied")
        if self.never_expires and self.new_valid_until:
            raise ValueError("New Valid Until must be empty when Does Not Expire is selected")
        if self.new_valid_from and self.new_valid_until and self.new_valid_until < self.new_valid_from:
            raise ValueError("New Valid Until cannot be earlier than New Valid From")
        return self


class LicenseComplianceMappingInput(BaseModel):
    license_type_id: str
    compliance_rule_version_id: str
    entity_type: str = Field(pattern="^(UNIT|CONTRACTOR|CONTRACTOR_SITE)$")
    license_required: bool = True
    validity_check_required: bool = True
    renewal_tracking_required: bool = True
    evidence_linking_enabled: bool = True
