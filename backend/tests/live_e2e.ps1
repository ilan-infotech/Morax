param(
  [string]$BaseUrl = 'http://127.0.0.1:8000/api/v1',
  [string]$AdminEmail = 'admin@morax.example.com',
  [string]$AdminPassword = 'Admin@123'
)

$ErrorActionPreference = 'Stop'
$run = "E2E-$([guid]::NewGuid().ToString('N').Substring(0, 8).ToUpperInvariant())"

function Api($Method, $Path, $Body, $Token) {
  $args = @{ Method = $Method; Uri = "$BaseUrl$Path"; ContentType = 'application/json' }
  if ($Token) { $args.Headers = @{ Authorization = "Bearer $Token" } }
  if ($null -ne $Body) { $args.Body = (ConvertTo-Json -InputObject $Body -Depth 8) }
  try { Invoke-RestMethod @args }
  catch {
    $detail = $_.ErrorDetails.Message
    throw "$Method $Path failed: $($_.Exception.Message) $detail"
  }
}

function Login($Email, $Password) { Api 'POST' '/auth/login' @{ email = $Email; password = $Password } $null }

function UploadEvidence($InstanceId, $Token, $Path) {
  Add-Type -AssemblyName System.Net.Http
  $client = New-Object System.Net.Http.HttpClient
  $content = New-Object System.Net.Http.MultipartFormDataContent
  $bytes = [System.IO.File]::ReadAllBytes($Path)
  $fileContent = New-Object System.Net.Http.ByteArrayContent -ArgumentList (,$bytes)
  $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  $content.Add($fileContent, 'file', [System.IO.Path]::GetFileName($Path))
  $request = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Post, "$BaseUrl/compliance-instances/$InstanceId/evidence?category=TEST_EVIDENCE")
  $request.Headers.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue('Bearer', $Token)
  $request.Content = $content
  $response = $client.SendAsync($request).Result
  $body = $response.Content.ReadAsStringAsync().Result
  if (-not $response.IsSuccessStatusCode) { throw "Evidence upload failed: $($response.StatusCode) $body" }
  $body | ConvertFrom-Json
}

try {
  $admin = Login $AdminEmail $AdminPassword
  $token = $admin.access_token
  $states = Api 'GET' '/master-data/states' $null $token
  $industries = Api 'GET' '/master-data/industry-types' $null $token
  $today = (Get-Date).ToString('yyyy-MM-dd')
  # Monthly generation represents the previous closed period.  Start the
  # isolated test unit/rule in that period so generation is expected.
  $effectiveFrom = (Get-Date).AddMonths(-1).ToString('yyyy-MM-01')

  # Product Admin generation is always explicitly scoped to a customer tenant;
  # never create or generate obligations in the hidden MORAX system tenant.
  $tenant = Api 'POST' '/platform/organizations' @{
    organization_name = "$run Tenant"
    organization_code = "$run-TENANT"
    organization_admin_name = "$run Organization Admin"
    organization_admin_email = "$($run.ToLowerInvariant())-orgadmin@example.com"
    organization_admin_password = 'OrganizationAdmin@123'
    status = 'ACTIVE'
  } $token
  Api 'POST' "/platform/organizations/$($tenant.id)/enter" $null $token | Out-Null

  $unit = Api 'POST' '/units' @{ name = "$run Unit"; code = $run; employer_name = "$run Tenant"; state_id = $states[0].id; industry_type_id = $industries[0].id; compliance_start_date = $effectiveFrom; status = 'ACTIVE' } $token
  $makerEmail = "$($run.ToLowerInvariant())-maker@example.com"
  $checkerEmail = "$($run.ToLowerInvariant())-checker@example.com"
  $maker = Api 'POST' '/users' @{ name = "$run Maker"; email = $makerEmail; password = 'MakerPass@123'; active = $true; role_scopes = @(@{ role = 'UNIT_MAKER'; scope_type = 'UNIT'; scope_id = $unit.id }) } $token
  $checker = Api 'POST' '/users' @{ name = "$run Checker"; email = $checkerEmail; password = 'CheckerPass@123'; active = $true; role_scopes = @(@{ role = 'UNIT_CHECKER'; scope_type = 'UNIT'; scope_id = $unit.id }) } $token

  $ruleId = "$run-RULE"
  Api 'POST' '/compliance-rules' @{ compliance_id = $ruleId; name = "$run Monthly Return"; version = 1; entity_type = 'UNIT'; state_id = $states[0].id; industry_type_id = $industries[0].id; frequency = 'MONTHLY'; due_date_rule = 'FIXED_DAY_OF_MONTH'; due_date_offset = 15; grace_days = 0; required_document = 'Test evidence'; risk_level = 'MEDIUM'; effective_from = $effectiveFrom; active = $true } $token | Out-Null
  Api 'POST' '/compliance-generation/run' @{ organization_id = $tenant.id; subject_type = 'UNIT'; subject_id = $unit.id; as_of_date = $today } $token | Out-Null
  $instances = Api 'GET' "/compliance-instances?q=$ruleId" $null $token
  $instance = @($instances.items | Where-Object { $_.compliance_id -eq $ruleId })[0]
  if ($null -eq $instance) { throw "Expected generated instance for $ruleId" }

  Api 'POST' "/compliance-instances/$($instance.id)/assignments" @{ user_id = $maker.id; assignment_type = 'MAKER' } $token | Out-Null
  Api 'POST' "/compliance-instances/$($instance.id)/assignments" @{ user_id = $checker.id; assignment_type = 'CHECKER' } $token | Out-Null

  $makerToken = (Login $makerEmail 'MakerPass@123').access_token
  $detail = Api 'GET' "/compliance-instances/$($instance.id)" $null $makerToken
  Api 'PATCH' "/compliance-instances/$($instance.id)/activity" @{ filing_reference = "$run-FILING"; completed_on = $today; amount = 1; remarks = 'Automated end-to-end validation'; row_version = $detail.row_version } $makerToken | Out-Null
  $evidencePath = Join-Path $PSScriptRoot '..\..\docs\construction_industry_compliance_sample.xlsx'
  $upload = UploadEvidence $instance.id $makerToken $evidencePath
  $detail = Api 'GET' "/compliance-instances/$($instance.id)" $null $makerToken
  $submitted = Api 'POST' "/compliance-instances/$($instance.id)/submit" @{ row_version = $detail.row_version } $makerToken

  $checkerToken = (Login $checkerEmail 'CheckerPass@123').access_token
  $notifications = Api 'GET' '/notifications?unread_only=true' $null $checkerToken
  if ($notifications.total -lt 1) { throw 'Expected a checker notification after submission' }
  try { Api 'POST' "/compliance-instances/$($instance.id)/approve" @{ comment = 'Unauthorized self-approval check'; row_version = $submitted.row_version } $makerToken | Out-Null; throw 'Maker approval was unexpectedly allowed' } catch { if ($_.Exception.Message -like '*unexpectedly allowed*') { throw } }
  $detail = Api 'GET' "/compliance-instances/$($instance.id)" $null $checkerToken
  $reviewing = Api 'POST' "/compliance-instances/$($instance.id)/begin-review" @{ comment = 'Evidence reviewed'; row_version = $detail.row_version } $checkerToken
  try { Api 'POST' "/compliance-instances/$($instance.id)/reject" @{ comment = ' '; row_version = $reviewing.row_version } $checkerToken | Out-Null; throw 'Blank rejection remarks were unexpectedly allowed' } catch { if ($_.Exception.Message -like '*unexpectedly allowed*') { throw } }
  $rejected = Api 'POST' "/compliance-instances/$($instance.id)/reject" @{ comment = 'Please correct and resubmit the evidence'; row_version = $reviewing.row_version } $checkerToken
  if ($rejected.status -ne 'REJECTED') { throw "Expected REJECTED status, received $($rejected.status)" }
  $makerNotifications = Api 'GET' '/notifications?unread_only=true' $null $makerToken
  if ($makerNotifications.total -lt 1) { throw 'Expected a Maker rejection notification' }

  # Correct the filing and add a new evidence version before resubmitting.
  $detail = Api 'GET' "/compliance-instances/$($instance.id)" $null $makerToken
  $resaved = Api 'PATCH' "/compliance-instances/$($instance.id)/activity" @{ filing_reference = "$run-FILING-REV2"; completed_on = $today; amount = 1; remarks = 'Corrected by automated validation'; row_version = $detail.row_version } $makerToken
  $replacementEvidence = UploadEvidence $instance.id $makerToken $evidencePath
  $resubmitted = Api 'POST' "/compliance-instances/$($instance.id)/submit" @{ row_version = $resaved.row_version } $makerToken
  if ($resubmitted.status -ne 'SUBMITTED') { throw "Expected SUBMITTED resubmission status, received $($resubmitted.status)" }

  Api 'POST' "/evidence/$($replacementEvidence.id)/verify" @{ verification_state = 'VERIFIED' } $checkerToken | Out-Null
  $detail = Api 'GET' "/compliance-instances/$($instance.id)" $null $checkerToken
  $rereviewing = Api 'POST' "/compliance-instances/$($instance.id)/begin-review" @{ comment = 'Corrected evidence reviewed'; row_version = $detail.row_version } $checkerToken
  $detail = Api 'GET' "/compliance-instances/$($instance.id)" $null $checkerToken
  $approved = Api 'POST' "/compliance-instances/$($instance.id)/approve" @{ comment = 'Approved by automated validation'; row_version = $detail.row_version } $checkerToken
  if ($approved.status -ne 'APPROVED') { throw "Expected APPROVED status, received $($approved.status)" }
  $history = Api 'GET' '/compliance-instances/my-review-history?page_size=100' $null $checkerToken
  $decisions = @($history.items | Where-Object { $_.id -eq $instance.id })
  if (@($decisions | Where-Object { $_.decision -eq 'REJECTED' -and $_.submission_revision -eq 1 }).Count -ne 1 -or @($decisions | Where-Object { $_.decision -eq 'APPROVED' -and $_.submission_revision -eq 2 }).Count -ne 1) { throw 'Review history did not retain both submission revisions' }

  $docs = Api 'GET' '/documents' $null $token
  $audit = Api 'GET' '/audit-logs' $null $token
  $dashboard = Api 'GET' '/dashboard/summary' $null $token
  if (@($docs).Count -lt 1 -or $audit.total -lt 1 -or $dashboard.total -lt 1) { throw 'Reporting, document, or audit verification failed' }
  Write-Output "PASS: $run completed. Unit=$($unit.id) Instance=$($instance.id) Evidence=$($upload.id)"
} catch {
  Write-Error "FAIL: $run - $($_.Exception.Message)"
  exit 1
}
