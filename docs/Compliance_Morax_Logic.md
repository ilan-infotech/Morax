Here is the current MORAX compliance business logic in simple business terms.
1. Compliance Master → Company Compliance
The Compliance Master is the central library owned by MORAX Product Admin.
Each master record contains:
- Compliance ID
- Act
- Rule
- Compliance name
- Entity type, such as Unit or Contractor
- State applicability
- Unit Compliance Type
- Frequency
- Due-date rule
- Required document
- Risk level                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    
- Effective dates
When a Unit is created or the scheduled generator runs:
1. MORAX reads the active Compliance Master records.
2. It checks which records apply to that Unit.
3. For every matching record, MORAX creates a compliance obligation for that Unit.
4. Company Compliance displays these generated obligations.
Important: Company Compliance does not display every master record. It displays only the master records that match the Unit and have been generated as obligations.
2. Filtering Logic
A compliance must pass all applicable checks.
Unit Compliance Type
This is the first filter.
Example Unit types:
- Shops & Establishments
- PF
- ESI
- BOCW
- Mines
If a rule is marked PF, it appears only for Units having PF selected.
If a rule is marked Shops & Establishments, it appears only for Units having that type selected.
If a rule has no Unit Compliance Type, it is treated as a universal rule within its other conditions.
State
State-specific rules are shown only for matching states.
Example:
- Tamil Nadu rule → only Tamil Nadu Units
- Central rule with no state restriction → applicable in all states
Entity type
A Unit obligation is created only from rules marked for UNIT.
Contractor or Contractor Site rules are not shown in Company Compliance.
Industry
The system supports industry filtering. However, the current imported master data does not contain industry restrictions, so the current rules are generally available to all industries.
Employee threshold
If a master rule contains an employee threshold, the Unit must meet that number before the rule applies.
Effective dates
The Compliance Master effective period and the Unit’s compliance start date are also checked. A rule is not generated before it becomes effective or before the Unit starts compliance operations.
3. Due-Date Logic
The main implemented business rule is:
A monthly compliance generated during the current month belongs to the previous month and is due on the 15th of the current month.

Example:
- Generation date: 25 October
- Compliance period: September
- Due date: 15 October
The current imported master contains:
- 30 monthly automatic rules
- Monthly due-date rule: FIXED_DAY_OF_MONTH
- Default due day: 15
The code calculates the period first and then calculates the due date from the master frequency and due-date rule.
The system also supports other due-date rules, including:
- Days after period end
- Fixed annual date
- One-time configured date
- Manual date
However, the current source Excel does not provide enough structured information for most annual, half-yearly, and event-based rules. Those rules remain manual and are not automatically generated.
4. Compliance Status
MORAX has two different concepts:
1. Workflow status — what users have done
2. Display status — what the date means today
Upcoming
The due date is more than seven days away.
Due Soon
The due date is within the next seven days.
Due Today
The due date is today.
Overdue
The due date has passed and the compliance is not completed or marked Not Applicable.
This applies even if the workflow status is:
- Pending
- In Progress
- Submitted
- Under Review
- Rejected
- Correction Required
The system keeps the original workflow status but displays the date status as Overdue.
Completed
The Checker approves the compliance before or on the due date.
Completed Late
The Checker approves it after the due date.
Not Applicable
A permitted user explicitly marks the compliance as Not Applicable with a reason.
Not Applicable is not automatically assigned just because a rule does not match. If a rule does not match the Unit, no obligation is generated at all.
5. Recurring Compliance
Recurring obligations are tracked by:
- Compliance rule
- Unit or Contractor
- Period key
- Due date
- Workflow status
For monthly rules:
- October generation creates September period obligations.
- November generation creates October period obligations.
- The same period is not created twice because the system checks the period key.
Generation happens:
- When a Unit is created or updated
- When compliance generation is manually triggered
- Automatically when the backend starts
- Automatically approximately every six hours
The current automatic scheduler processes active Units.
The code supports quarterly, half-yearly, annual, and one-time frequencies, but the currently imported non-monthly rules are mostly marked MANUAL. Therefore, they will not automatically create obligations until their exact due-date rules are configured.
6. Tamil Nadu Shops & Establishments Example
Assume a Unit has:
- State: Tamil Nadu
- Unit Compliance Type: Shops & Establishments
- Industry: Commercial
- Status: Active
- Compliance start date: 1 September
- Total employees: 50
When generation runs on 25 October:
1. MORAX selects active Compliance Master rules.
2. It keeps Unit rules only.
3. It keeps universal rules.
4. It keeps Tamil Nadu-specific rules.
5. It keeps rules tagged Shops & Establishments.
6. It excludes PF, ESI, Mines, and BOCW-only rules.
7. It excludes Contractor rules.
8. It creates September obligations.
9. Monthly obligations receive a due date of 15 October.
10. Since today is 25 October and they are not completed, they display as Overdue.
With the current normalized master, this type of Unit receives the universal monthly obligations plus the applicable Shops & Establishments monthly obligations. If PF and ESI are also selected, the PF and ESI obligations are added as well.
What is currently working
- Compliance Master is centrally owned by MORAX Product Admin.
- Unit Compliance Type filtering works.
- State filtering works.
- Entity type filtering works.
- Employee threshold filtering is supported.
- Monthly previous-period generation works.
- Default due day 15 works.
- Duplicate period generation is prevented.
- Dashboard, Company Compliance, and Recurring Compliance use the same date-based display status.
- Overdue status is automatically displayed after the deadline passes.
- Completed and Not Applicable statuses are handled separately.
- Tamil Nadu-specific rules are excluded for non-Tamil Nadu Units.
Current limitations
- Most annual, half-yearly, one-time, and event-based source rules remain manual because the Excel source does not contain machine-readable due-date formulas.
- Industry filtering is supported, but the imported source data currently does not specify industry restrictions.
- The automatic scheduler currently focuses on active Units; Contractor recurring generation may need separate business confirmation if contractors should also be generated automatically.
- “Due Soon” is an additional display category alongside the core statuses requested.
In short: Compliance Master defines what may apply, Unit details decide what actually applies, the frequency and due-date rule decide when it is due, and the user workflow determines whether it becomes Completed, Overdue, or Not Applicable.