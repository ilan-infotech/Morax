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
  Invoke-RestMethod @args
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

  $unit = Api 'POST' '/units' @{ name = "$run Unit"; code = $run; state_id = $states[0].id; industry_type_id = $industries[0].id; compliance_start_date = $today; status = 'ACTIVE' } $token
  $makerEmail = "$($run.ToLowerInvariant())-maker@example.com"
  $checkerEmail = "$($run.ToLowerInvariant())-checker@example.com"
  $maker = Api 'POST' '/users' @{ name = "$run Maker"; email = $makerEmail; password = 'MakerPass@123'; active = $true } $token
  $checker = Api 'POST' '/users' @{ name = "$run Checker"; email = $checkerEmail; password = 'CheckerPass@123'; active = $true } $token
  Api 'PUT' "/users/$($maker.id)/role-scopes" @(@{ role = 'UNIT_MAKER'; scope_type = 'UNIT'; scope_id = $unit.id }) $token | Out-Null
  Api 'PUT' "/users/$($checker.id)/role-scopes" @(@{ role = 'UNIT_CHECKER'; scope_type = 'UNIT'; scope_id = $unit.id }) $token | Out-Null

  $ruleId = "$run-RULE"
  Api 'POST' '/compliance-rules' @{ compliance_id = $ruleId; name = "$run Monthly Return"; version = 1; entity_type = 'UNIT'; state_id = $states[0].id; industry_type_id = $industries[0].id; frequency = 'MONTHLY'; due_date_rule = 'FIXED_DAY_OF_MONTH'; due_date_offset = 15; grace_days = 0; required_document = 'Test evidence'; risk_level = 'MEDIUM'; effective_from = $today; active = $true } $token | Out-Null
  Api 'POST' '/compliance-generation/run' @{ subject_type = 'UNIT'; subject_id = $unit.id; as_of_date = $today } $token | Out-Null
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
  Api 'POST' "/compliance-instances/$($instance.id)/submit" $null $makerToken | Out-Null

  $checkerToken = (Login $checkerEmail 'CheckerPass@123').access_token
  $notifications = Api 'GET' '/notifications?unread_only=true' $null $checkerToken
  if ($notifications.Count -lt 1) { throw 'Expected a checker notification after submission' }
  try { Api 'POST' "/compliance-instances/$($instance.id)/approve" @{ comment = 'Unauthorized self-approval check'; row_version = 3 } $makerToken | Out-Null; throw 'Maker approval was unexpectedly allowed' } catch { if ($_.Exception.Message -like '*unexpectedly allowed*') { throw } }
  Api 'POST' "/evidence/$($upload.id)/verify" @{ verification_state = 'VERIFIED' } $checkerToken | Out-Null
  $detail = Api 'GET' "/compliance-instances/$($instance.id)" $null $checkerToken
  Api 'POST' "/compliance-instances/$($instance.id)/begin-review" @{ comment = 'Evidence reviewed'; row_version = $detail.row_version } $checkerToken | Out-Null
  $detail = Api 'GET' "/compliance-instances/$($instance.id)" $null $checkerToken
  $approved = Api 'POST' "/compliance-instances/$($instance.id)/approve" @{ comment = 'Approved by automated validation'; row_version = $detail.row_version } $checkerToken
  if ($approved.status -ne 'APPROVED') { throw "Expected APPROVED status, received $($approved.status)" }

  $docs = Api 'GET' '/documents' $null $token
  $audit = Api 'GET' '/audit-logs' $null $token
  $dashboard = Api 'GET' '/dashboard/summary' $null $token
  if (@($docs).Count -lt 1 -or $audit.total -lt 1 -or $dashboard.total -lt 1) { throw 'Reporting, document, or audit verification failed' }
  Write-Output "PASS: $run completed. Unit=$($unit.id) Instance=$($instance.id) Evidence=$($upload.id)"
} catch {
  Write-Error "FAIL: $run - $($_.Exception.Message)"
  exit 1
}
