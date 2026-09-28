You are a senior full-stack software engineer responsible for building the Phase 1 MVP of the MORAX Labour Compliance Software.

PRODUCT CONTEXT
Build a labour compliance management platform for MORAX based on the attached Product Requirements Document (PRD).

The PRD is the primary functional reference. The reference screenshots in the PRD represent the expected user experience, workflow, screens, fields, filters, entity hierarchy, and compliance-management behavior.

PHASE 1 GOAL
Build a fully functional end-to-end MVP.

The objective is NOT to build every advanced feature initially. The objective is to create a working product where a user can:

1. Log in.
2. Manage company entities.
3. Create and manage Units / Branches.
4. Create and manage Contractors.
5. Create and manage Contractor Sites.
6. Manage company users and roles.
7. Configure applicable labour compliance parameters.
8. View compliance dashboard.
9. View recurring compliances.
10. Filter compliances.
11. Open compliance details.
12. Submit/upload compliance documents.
13. Track compliance status.
14. View activity/audit history.
15. Manage basic documents.
16. Generate basic compliance reports.

TECHNOLOGY STACK

Backend:
- Python
- FastAPI
- SQLAlchemy
- SQLite
- Pydantic
- Uvicorn

Frontend:
- React.js
- JavaScript
- Tailwind CSS
- shadcn/ui
- React Router
- Axios or Fetch API

Database:
- SQLite for Phase 1
- SQLAlchemy ORM
- Database migrations should be structured so that migration to PostgreSQL later is straightforward.

GENERAL ARCHITECTURE

Use a clean separation:

Frontend
    ↓
REST API
    ↓
FastAPI Services
    ↓
SQLAlchemy ORM
    ↓
SQLite

Keep frontend and backend independently structured.

Recommended structure:

/frontend
    /src
        /components
        /pages
        /layouts
        /services
        /hooks
        /utils
        /routes
        /types
        /assets

/backend
    /app
        /api
        /models
        /schemas
        /services
        /repositories
        /core
        /db
        /utils
        /middleware
    main.py

Create a .env based configuration approach.

PHASE 1 FUNCTIONAL SCOPE

==================================================
1. AUTHENTICATION
==================================================

Implement basic secure authentication.

Features:
- Login
- Logout
- Session/token-based authentication
- Password hashing
- Protected routes
- Current-user API

User fields:
- ID
- Name
- Email
- Mobile
- Password hash
- Role
- Status
- Created date
- Updated date

Roles for MVP:
- Super Admin
- Unit Admin
- Unit Maker
- Contractor Admin
- Contractor Maker
- Contractor Checker

Implement role-based authorization at API level.

Frontend should hide unauthorized actions, but backend authorization must always be enforced.

==================================================
2. ENTITY MANAGEMENT
==================================================

Implement three entity types:

A. Unit / Branch
B. Contractor
C. Contractor Site

Use the hierarchy:

Company
    └── Unit / Branch
          └── Contractor
                └── Contractor Site

A Contractor may belong to a Unit.

A Contractor Site belongs to a Contractor and/or relevant Unit context.

UNIT / BRANCH FIELDS

Based on the reference screens:

- Branch / Unit Name *
- Entity Code
- Unit Type *
    - Shop/Office
    - Factory
    - Dock Work
    - Mines
- Industry Type *
- State *
- City *
- Pincode *
- Address *
- Male Employees
- Female Employees
- Total Employees
- Unit Start Date *
- GSTIN
- PAN
- LIN
- Name of Employer / Occupier / Owner
- Applicable Regulations
    - BOCW
    - PF
    - ESIC
- Compliance Start Date *
- Maker
- Checker
- Admin
- Status
- Created At
- Updated At

TOTAL EMPLOYEES SHOULD BE CALCULATED AUTOMATICALLY:

Total Employees = Male Employees + Female Employees

Industry Type should be configurable through a master table.

Initial industry values should include the industries shown in the reference software:

- Air Transport Services
- Any Central Govt. Undertaking
- Any Other Industry
- Audio-video Production
- Banking / Insurance
- Beedi & Cigar
- Dock Work
- Mines
- Motor Transport Undertaking
- Newspapers Establishment
- Plantation
- Telecommunication Services

Design the database so additional industries can be added later without code changes.

CONTRACTOR FIELDS

Based on the reference PRD/screens:

- Parent Unit *
- Contractor Name *
- Contractor Type
    - In-house
    - Outsourced
- Entity Code
- Start Date
- End Date
- State
- City
- Pincode
- Address
- Male Workers
- Female Workers
- Total Workers
- GSTIN
- PAN
- LIN
- Applicable Regulations
- Compliance Start Date
- Maker
- Checker
- Admin
- Status
- Created At
- Updated At

CONTRACTOR SITE FIELDS

- Site Name *
- Contractor Name
- Entity Code
- Unit Type *
- Industry Type *
- Start Date *
- State *
- City *
- Pincode *
- Address *
- Male Workers
- Female Workers
- Total Workers
- GSTIN
- PAN
- LIN
- Applicable Regulations
- Compliance Start Date
- Maker
- Checker
- Admin
- Status

Implement full CRUD:
- Create
- Read
- Update
- Activate/Deactivate
- Search
- Filter
- Pagination

==================================================
3. COMPANY USERS
==================================================

Build a Company Users screen similar to the reference software.

Table columns:

- ID
- Name
- Email
- Mobile
- Role
- Assigned Entities
- Status
- Created
- Actions

Features:
- Create user
- Edit user
- Activate/deactivate
- Assign role
- Assign one or multiple entities
- Search
- Pagination

When creating an entity, allow assigning:

Maker
Checker
Admin

Implement the same assignment concept shown in the reference screens.

==================================================
4. COMPLIANCE MASTER
==================================================

Create a compliance rule master.

Each compliance rule must contain:

- ID
- Act
- Rule
- Compliance Name
- Description
- Compliance Type
- Document Type
- Form Number
- Frequency
- Applicable States
- Applicable Industry Types
- Applicable Entity Types
- Applicable Entity IDs
- Risk Level
- Due Date Logic
- Grace Period
- Required Document
- Active/Inactive

Compliance types should support:

- Remittance
- Return
- Register
- Records
- Intimation/Filing
- Display
- Notice
- Procedural
- Notice/Display

Frequency values:

- Daily
- Weekly
- Monthly
- Quarterly
- Half-yearly
- Annually
- One-time
- Event-based

Risk levels:

- Critical
- High
- Medium
- Low

==================================================
5. COMPLIANCE GENERATION ENGINE
==================================================

Build the initial rule-based compliance generation engine.

When a Unit / Contractor / Contractor Site is created:

1. Determine applicable state.
2. Determine entity type.
3. Determine industry type.
4. Determine applicable regulations.
5. Match compliance rules.
6. Generate compliance instances.

Each generated compliance instance should contain:

- ID
- Compliance Rule ID
- Entity ID
- Entity Type
- Period
- Due Date
- Status
- Risk Level
- Assigned Maker
- Assigned Checker
- Submitted Date
- Approved Date
- Completed Date
- Remarks
- Created At
- Updated At

Statuses:

- Due
- Overdue
- Pending for Approval
- Approved
- Completed
- Completed Late
- Rejected by Checker

Implement automatic status calculation based on due date and workflow state.

==================================================
6. RECURRING COMPLIANCES
==================================================

Create the main recurring compliance page similar to the reference screenshots.

Top summary cards:

- Due
- Overdue
- Completed
- Completed Late
- Rejected by Checker
- Pending for Approval
- Compliance Rate

Create status visualization.

Create frequency summary.

Create entity summary.

Compliance list should be grouped by Act / Rule.

Columns:

- Entity
- Compliance Type
- Document Type
- Form No.
- Frequency
- Period
- Due Date
- Risk
- Status
- Actions

Implement:

- Expand All
- Collapse All
- Search
- Pagination

==================================================
7. COMPLIANCE FILTERS
==================================================

Implement the following filters exactly as functional concepts from the reference screens:

Entity Type:
- All
- Units
- Contractors
- Contractor Sites

Entity:
- All Entities
- Specific entities

Status:
- All
- Due
- Overdue
- Pending for Approval
- Approved
- Completed
- Completed Late
- Rejected by Checker

Risk Level:
- All
- Critical
- High
- Medium
- Low

Frequency:
- All
- Daily
- Weekly
- Monthly
- Quarterly
- Half-yearly
- Annually
- One-time
- Event-based

Date Range:
- Current
- This Month
- This Quarter
- This FY
- Last Month
- Last Quarter
- Last 6 Months
- Last FY
- Next Month
- Next Quarter
- Next 6 Months
- All Time
- Custom Range

Filters must update the compliance list dynamically.

==================================================
8. COMPLIANCE DETAILS
==================================================

When the user clicks the view/action button, open a compliance details modal/page.

Display:

Compliance Name

Entity Information:
- Unit
- Contractor
- Site
- State
- Industry

Timeline:
- Period
- Due Date
- Submission Date
- Approval Date
- Completion Date

Legal Framework:
- Act
- Section
- Rule
- Legal description

Rule Description

Required Form

Consequences / Penalty

Status

Assigned users

Activity History

Activity history should show:

- Action
- User
- Date/Time
- Remarks

==================================================
9. COMPLIANCE SUBMISSION WORKFLOW
==================================================

Implement:

Maker → submits compliance → Checker reviews → approves/rejects → completed

Workflow:

DUE
↓
MAKER SUBMITS
↓
PENDING FOR APPROVAL
↓
CHECKER APPROVES
↓
COMPLETED

OR

PENDING FOR APPROVAL
↓
REJECTED BY CHECKER
↓
MAKER CORRECTS
↓
RESUBMITS

Allow:

- Upload document
- Remarks
- Submit
- Approve
- Reject
- Re-submit

Store every status change in the audit log.

==================================================
10. DOCUMENT MANAGEMENT
==================================================

Create a basic Document Repository.

Document fields:

- ID
- Document Name
- Document Type
- Compliance ID
- Entity
- Financial/Compliance Period
- File Name
- File Path
- File Type
- Uploaded By
- Uploaded Date
- Version
- Status

Support:

- Upload
- Download
- View metadata
- Replace document
- Delete where authorized
- Search
- Filter

Phase 1 can use local filesystem storage.

However, implement a storage abstraction so cloud storage can be introduced later.

==================================================
11. DASHBOARD
==================================================

Create a dashboard similar to the reference software.

Top:

Company/entity filter

Dashboard date

Overview cards:

- Due
- Overdue
- Completed
- Completed Late
- Rejected by Checker
- Pending for Approval
- Compliance Rate

Charts:

1. Compliance Status
2. Compliance Frequency
3. Unit Summary

Unit Summary columns:

- Entity
- Due
- Overdue
- Done
- Rate

Create monthly completion trend.

Create module summary cards.

Dashboard data must come from APIs and not hardcoded values.

==================================================
12. AUDIT TRAIL
==================================================

Every major action must create an audit record.

Track:

- Login
- Logout
- Entity creation
- Entity update
- User creation
- User update
- Compliance generated
- Compliance submitted
- Compliance approved
- Compliance rejected
- Document uploaded
- Document replaced
- Document deleted

Audit fields:

- ID
- User
- Action
- Module
- Entity Type
- Entity ID
- Timestamp
- Previous Value
- New Value
- Remarks

==================================================
13. REPORTING
==================================================

Implement basic MVP reports:

- Compliance Status Report
- Overdue Compliance Report
- Entity Compliance Report
- Compliance Completion Report

Allow:

- Filter
- View
- Export CSV

PDF export is optional for Phase 1 unless it is simple to implement.

==================================================
14. UI / UX
==================================================

Use Tailwind CSS.

Design should be based on the reference screenshots but should NOT blindly copy proprietary branding.

Use:

- Clean enterprise dashboard
- Left navigation
- Top header
- Cards
- Tables
- Modals
- Tabs
- Dropdowns
- Status badges
- Risk badges
- Responsive layouts

Navigation:

Dashboard
Compliance
    Recurring Compliances
    One-Time Compliances
Users
Unit / Contractor / Site
Licenses
Government Notifications
Support Tickets
Digital Library
Document Library
Notice Management
My Profile
Change Password
Logout

For Phase 1, implement fully:
- Dashboard
- Recurring Compliances
- One-Time Compliances
- Users
- Unit / Contractor / Site
- Document Library

Create placeholders for other modules where full functionality is not yet implemented.

==================================================
15. API REQUIREMENTS
==================================================

Create clean REST APIs.

Examples:

POST /api/auth/login
GET /api/auth/me

GET /api/users
POST /api/users
GET /api/users/{id}
PUT /api/users/{id}
PATCH /api/users/{id}/status

GET /api/entities
POST /api/entities
GET /api/entities/{id}
PUT /api/entities/{id}
PATCH /api/entities/{id}/status

GET /api/industries
POST /api/industries

GET /api/compliance-rules
POST /api/compliance-rules

GET /api/compliances
GET /api/compliances/{id}
POST /api/compliances/{id}/submit
POST /api/compliances/{id}/approve
POST /api/compliances/{id}/reject

POST /api/compliances/{id}/documents
GET /api/compliances/{id}/documents

GET /api/dashboard/summary
GET /api/dashboard/status
GET /api/dashboard/frequency
GET /api/dashboard/entities

GET /api/audit-logs

Use Pydantic request/response schemas.

Return consistent API responses and proper HTTP status codes.

==================================================
16. DATABASE DESIGN
==================================================

Create normalized SQLAlchemy models.

Minimum tables:

users
roles
permissions
user_entity_assignments

entities
units
contractors
contractor_sites

industries
states
cities

compliance_rules
compliance_instances
compliance_documents

audit_logs

Use foreign keys and appropriate indexes.

Do not store derived data unnecessarily.

Total employees/workers should be calculated from male + female counts.

==================================================
17. SECURITY
==================================================

Implement:

- Password hashing
- Authentication
- Authorization
- Input validation
- File upload validation
- Allowed file extensions
- Maximum upload size
- SQL injection protection through ORM
- Proper CORS configuration
- Environment variables for secrets

Do not hardcode credentials.

==================================================
18. SEED DATA
==================================================

Provide seed data so the application is immediately usable.

Create:

1 Super Admin

Sample users for:
- Unit Maker
- Unit Checker
- Unit Admin
- Contractor Maker
- Contractor Checker
- Contractor Admin

Create sample:

- Units
- Contractors
- Contractor Sites
- Industries
- Compliance Rules
- Compliance Instances

Use seed scripts.

The developer should be able to run one command and get a populated demo environment.

==================================================
19. ERROR HANDLING
==================================================

Implement centralized backend error handling.

Frontend must display user-friendly messages for:

- Validation errors
- Unauthorized access
- Not found
- Server errors
- Duplicate entities
- Invalid file uploads

Avoid exposing internal stack traces to users.

==================================================
20. LOGGING
==================================================

Backend logging should capture:

- Application startup
- API errors
- Authentication events
- Compliance processing errors
- File upload errors

Use structured logging where practical.

==================================================
21. TESTING
==================================================

Create backend tests for:

- Authentication
- User authorization
- Entity CRUD
- Industry master
- Compliance rule matching
- Compliance generation
- Compliance status
- Maker/Checker workflow

Create frontend tests for the most important workflows.

At minimum verify:

Create Unit
Create Contractor
Create Contractor Site
Create User
Generate Compliance
Submit Compliance
Approve Compliance
Reject Compliance
Upload Document
Dashboard calculations

==================================================
22. DEVELOPMENT EXPERIENCE
==================================================

Provide:

README.md

Include:

- Prerequisites
- Installation
- Backend setup
- Frontend setup
- Database setup
- Seed data
- Run commands
- Test commands
- Environment variables

Expected developer commands should be simple, for example:

Backend:
pip install -r requirements.txt
uvicorn app.main:app --reload

Frontend:
npm install
npm run dev

Database:
python seed.py

==================================================
23. IMPORTANT IMPLEMENTATION RULES
==================================================

1. Do not hardcode dashboard numbers.
2. Do not hardcode entity lists.
3. Do not hardcode compliance status.
4. Do not hardcode industry logic inside frontend components.
5. Keep master/configuration data in database tables.
6. Keep business logic in backend services.
7. Keep UI components reusable.
8. Do not put all code into a single file.
9. Use proper validation.
10. Use pagination for large tables.
11. Use reusable table, modal, form, badge, filter, and confirmation components.
12. Maintain clean naming conventions.
13. Add comments only where business logic is non-obvious.
14. Prefer maintainability over unnecessary complexity.
15. Build the product so Phase 2 can extend the MVP without major rewrites.

==================================================
24. PHASE 1 PRIORITY
==================================================

Priority 1:
- Authentication
- Users/Roles
- Unit
- Contractor
- Contractor Site
- Industry Master
- Compliance Master
- Compliance Generation
- Compliance Dashboard
- Recurring Compliance
- Filters
- Compliance Details
- Maker/Checker workflow
- Document Upload
- Audit Trail

Priority 2:
- One-Time Compliance
- Reports
- CSV Export
- Advanced dashboard analytics

Priority 3:
- Licenses
- Notices
- Digital Library
- Government Notifications
- Advanced document management

For Phase 1, Priority 1 must be fully functional before moving to Priority 2.

==================================================
25. ACCEPTANCE CRITERIA
==================================================

The MVP is considered complete when:

- The application starts successfully.
- Login works.
- Role-based access works.
- A Unit can be created.
- Industry Type can be selected while creating a Unit.
- A Contractor can be created.
- A Contractor Site can be created.
- Industry Type can be selected for Contractor Site.
- Users can be assigned as Maker/Checker/Admin.
- Compliance rules can be configured.
- Compliance instances can be generated based on entity configuration.
- Dashboard statistics are calculated from actual database records.
- Compliance filtering works.
- Compliance details are displayed.
- Maker can submit.
- Checker can approve/reject.
- Documents can be uploaded.
- Audit history is recorded.
- CSV reports work.
- Seed data allows demonstration without manual database population.
- No critical functionality depends on mock data after seed initialization.

IMPORTANT:
Do not start by creating only the frontend screens.

Build the system end-to-end:
Database → Models → APIs → Services → Authentication → Frontend → Integration → Testing.

Use the PRD as the functional source of truth and the screenshots as UI/workflow references.

Before implementation, first create:
1. Project structure
2. Database schema
3. API/module plan
4. Development milestone plan

Then implement Phase 1 incrementally, ensuring every completed module is connected to the real backend and database.