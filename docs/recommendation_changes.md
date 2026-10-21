MORA SOFTWARE – CHANGES AND CORRECTIONS REQUIRED
1. User Creation Page
How it works now:
•	The page allows user creation with Name, Email ID, Mobile Number, Password and Active Status.
•	Role and access permissions must be assigned separately after creating the user.
Changes required:
1.	Add Role, Module Permissions and Project/Site Access to the user creation page.
2.	All user details, roles and permissions must be assigned and saved when clicking Create User. There should be no need to edit the user again to assign access.
3.	Validate the assigned permissions before creating the user.
2. Unit / Branch Creation Page
1.	Add state-based city selection. The City dropdown should show cities based on the selected State.
2.	Add Total Employees, calculated automatically from Male and Female employee counts.
3.	Ensure that recurring compliance requirements are generated based on the selected Industry Type and applicable compliance rules.
4.	Add Contact Email and Contact Phone Number fields.
5.	Add a Compliance Start Date. Generate recurring compliance schedules only from the applicable start date onwards.
3. Contractor Creation Page
1.	Change Parent Unit to Principal Employer.
2.	Make Principal Employer selection mandatory.
3.	Automatically populate State and City based on the selected Principal Employer.
4.	Add a Work Order Upload field to upload the contractor's work order.
5.	Add Contract Period with separate Contract Start Date and Contract End Date fields.
6.	Add Total Workers, calculated automatically from Male and Female worker counts.
7.	Add Worker Limit Validation showing the company worker limit, workers already allocated and remaining capacity. Prevent allocation beyond the configured limit.
8.	Allow the required user assignments during contractor creation itself.
9.	Add document uploads for contractor registration certificates, PF, ESI and Labour Licence, wherever applicable.
10.	Provide alerts for upcoming contract expiry and work order expiry, wherever applicable.
11.	Save all contractor details, uploaded documents, compliance settings and user assignments together when creating the contractor.
4. Maker – Compliance Document Submission Page
1.	Keep all compliance details and document submission fields on a single page.
2.	Remove unnecessary tabs such as Overview, Action & Evidence, Documents and History. Display the required information on one page.
3.	Add Completion Date, Remarks and Document Upload fields.
4.	Allow multiple documents to be uploaded in one submission.
5.	Display the submission status and provide the appropriate options for submission and resubmission.
6.	On the profile page, display the Company Name along with the User Name. Currently, only the User Name and Maker tag are displayed.
7.	Add a button at the bottom of the page labelled SUBMIT COMPLIANCE. Currently, there is no submission button.
8.	Remove the Contractor Checker and Contractor Admin roles. Contractors should have only the Maker role, allowing them to log in using the User ID and Password provided by the Principal Employer and upload compliance documents.
9.	The Principal Employer (Unit) must verify submitted documents and approve or reject them for resubmission. All checking and approval permissions must remain with the Principal Employer, not the contractor.
5. Maker–Checker Assignment and Submission Flow
1.	I created a Maker user under my name, Raaghav, and submitted a compliance. I also created a Checker user under Syed, but the submitted compliance did not appear on Syed's Checker dashboard.
2.	Once the Maker submits a compliance, it must automatically appear on the assigned Checker's dashboard under Pending Approval.
3.	The system must link every submission to the correct assigned Checker.
4.	The Checker must be able to view the submitted compliance details and documents, then approve or reject the submission for resubmission.
5.	Check and correct the submission assignment and access permissions to ensure the assigned Checker can access the submission immediately.
6. Checker Dashboard – Critical Corrections
1.	I created one Maker ID under Raaghav and submitted one compliance. Initially, it did not appear on Syed's Checker dashboard. When I checked again later, the same compliance appeared twice, although I had submitted it only once.
2.	The system showed both records as completed and approved, with 100% completion, even though I had not approved anything using Syed's Checker ID.
3.	Fix the submission workflow so that each compliance submission is recorded only once and appears on the assigned Checker's dashboard immediately.
4.	A submitted compliance must remain Pending Approval until the assigned Checker explicitly approves it. The system must never automatically mark a submission as approved or completed.
5.	Dashboard counts and completion percentages must reflect the actual submission and approval status. Duplicate records must not be created when a page is refreshed, reopened or revisited.
6.	Maintain an audit trail recording who submitted, approved or rejected each compliance, with the relevant date and time.
7.	Only an authorized Checker action can change a submission to Approved.
7. Recurring Compliance Menu – Page Correction
Currently, there is one option called Recurring. Split it into two separate options in the left-side menu.
A. Company Compliance
Manage the company's own labour law compliances, statutory registers, returns, remittances, due dates and filings.
B. Contractor Compliance
Manage contractor compliances, document submissions, PF/ESI payments, licence validity, document verification and approval status.
Each option must have its own dashboard and compliance tracking. The underlying compliance engine may be shared, but company compliance and contractor compliance records, access permissions and reporting must remain separate.
8. Important Role and Permission Rules
1.	Contractors must have only the Maker role. They can log in, view their assigned compliance requirements and upload or resubmit documents.
2.	Principal Employer users must control contractor verification and approval through the authorized Checker role.
3.	Contractors must not be able to approve their own submissions or access another contractor's records.
4.	User permissions and access must be enforced by the backend as well as the user interface.




Compliance  Master
Add a Month / Applicable Months column to the Compliance Master upload template. This is required for half-yearly compliances such as Professional Tax (PT) returns, which apply only in specific months.
Important notes
1.	Create a user and assign all roles and permissions in the same form.
2.	Create a unit and confirm that compliance schedules are generated from the correct start date and applicable industry rules.
3.	Create a contractor, upload a work order and confirm the Principal Employer, contract dates and worker limits.
4.	Submit one compliance using the Maker ID and confirm that it appears immediately on the assigned Checker's dashboard.
5.	Confirm that one submission creates only one compliance record.
6.	Refresh and reopen the pages to confirm that duplicate records are not created.
7.	Confirm that the submission remains Pending Approval until the Checker approves it.
8.	Reject a submission and verify that the Maker can correct and resubmit it.
9.	Confirm that dashboard counts and completion percentages change only according to the actual submission and approval status.
10.	Confirm that contractors cannot approve submissions and cannot access other contractors' data.

