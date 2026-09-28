param([string]$BaseUrl = 'http://127.0.0.1:8011/api/v1')

$ErrorActionPreference = 'Stop'
$run = "TENANT-$([guid]::NewGuid().ToString('N').Substring(0, 8).ToUpperInvariant())"

function Api($Method, $Path, $Body, $Token) {
  $args = @{ Method = $Method; Uri = "$BaseUrl$Path"; ContentType = 'application/json' }
  if ($Token) { $args.Headers = @{ Authorization = "Bearer $Token" } }
  if ($null -ne $Body) { $args.Body = ConvertTo-Json -InputObject $Body -Depth 8 }
  Invoke-RestMethod @args
}

function Login($Email, $Password) { Api 'POST' '/auth/login' @{ email = $Email; password = $Password } $null }

try {
  $platform = Login 'admin@morax.example.com' 'Admin@123'
  if ($platform.user.platform_role -ne 'MORAX_ADMIN') { throw 'Bootstrap account is not a platform MORAX_ADMIN' }
  $token = $platform.access_token
  $state = (Api 'GET' '/master-data/states' $null $token)[0]
  $industry = (Api 'GET' '/master-data/industry-types' $null $token)[0]
  $today = (Get-Date).ToString('yyyy-MM-dd')
  $common = @{ legal_name = $null; registration_number = $null; pan = $null; gstin = $null; registered_address = $null; city = $null; state_id = $state.id; pincode = $null; primary_contact_name = $null; primary_contact_email = $null; primary_contact_phone = $null; compliance_start_date = $today; status = 'ACTIVE' }

  $orgA = Api 'POST' '/platform/organizations' ($common + @{ organization_name = "$run A"; organization_code = "$run-A" }) $token
  $orgB = Api 'POST' '/platform/organizations' ($common + @{ organization_name = "$run B"; organization_code = "$run-B" }) $token
  $orgA = Api 'PATCH' "/platform/organizations/$($orgA.id)" ($common + @{ organization_name = "$run A Updated"; organization_code = "$run-A" }) $token
  if ($orgA.organization_name -ne "$run A Updated") { throw 'Organization update failed' }
  try { Api 'POST' '/platform/organizations' ($common + @{ organization_name = 'Duplicate'; organization_code = "$run-A" }) $token | Out-Null; throw 'Duplicate organization code was allowed' } catch { if ($_.Exception.Message -like '*was allowed*') { throw } }

  Api 'POST' "/platform/organizations/$($orgA.id)/enter" $null $token | Out-Null
  $unitA = Api 'POST' '/units' @{ name = "$run Unit A"; code = "$run-A-UNIT"; state_id = $state.id; industry_type_id = $industry.id; compliance_start_date = $today; status = 'ACTIVE' } $token
  $adminAEmail = "$($run.ToLowerInvariant())-orga@example.com"
  $adminA = Api 'POST' '/users' @{ name = "$run Organization Admin"; email = $adminAEmail; password = 'Organization@123'; active = $true } $token
  Api 'PUT' "/users/$($adminA.id)/role-scopes" @(@{ role = 'ORGANIZATION_ADMIN'; scope_type = 'ORGANIZATION'; scope_id = $orgA.id }) $token | Out-Null
  Api 'POST' '/compliance-rules' @{ compliance_id = "$run-RULE"; name = "$run Rule"; version = 1; entity_type = 'UNIT'; state_id = $state.id; industry_type_id = $industry.id; frequency = 'MONTHLY'; due_date_rule = 'FIXED_DAY_OF_MONTH'; due_date_offset = 15; effective_from = $today; active = $true } $token | Out-Null
  Api 'POST' '/compliance-generation/run' @{ subject_type = 'UNIT'; subject_id = $unitA.id; as_of_date = $today } $token | Out-Null

  Api 'POST' "/platform/organizations/$($orgB.id)/enter" $null $token | Out-Null
  $unitB = Api 'POST' '/units' @{ name = "$run Unit B"; code = "$run-B-UNIT"; state_id = $state.id; industry_type_id = $industry.id; compliance_start_date = $today; status = 'ACTIVE' } $token
  $instancesB = Api 'GET' '/compliance-instances' $null $token
  if (@($instancesB.items | Where-Object { $_.compliance_id -eq "$run-RULE" }).Count -ne 0) { throw 'Compliance instance leaked from Organization A to Organization B' }

  $orgAToken = (Login $adminAEmail 'Organization@123').access_token
  $unitsA = Api 'GET' '/units' $null $orgAToken
  if (@($unitsA.items | Where-Object { $_.id -eq $unitA.id }).Count -ne 1 -or @($unitsA.items | Where-Object { $_.id -eq $unitB.id }).Count -ne 0) { throw 'Organization A unit isolation failed' }
  try { Api 'PATCH' "/units/$($unitB.id)" @{ name = 'Forbidden'; code = 'FORBIDDEN'; state_id = $state.id; industry_type_id = $industry.id; compliance_start_date = $today; status = 'ACTIVE' } $orgAToken | Out-Null; throw 'Cross-organization unit update was allowed' } catch { if ($_.Exception.Message -like '*was allowed*') { throw } }
  try { Api 'POST' '/platform/organizations' ($common + @{ organization_name = 'Forbidden'; organization_code = "$run-FORBIDDEN" }) $orgAToken | Out-Null; throw 'Organization admin created a platform organization' } catch { if ($_.Exception.Message -like '*created a platform organization*') { throw } }

  Api 'POST' "/platform/organizations/$($orgA.id)/enter" $null $token | Out-Null
  $audit = Api 'GET' '/audit-logs' $null $token
  if (@($audit.items | Where-Object { $_.action -eq 'ORGANIZATION_CREATED' -and $_.organization_id -eq $orgA.id }).Count -lt 1) { throw 'Organization creation audit record not found' }
  Api 'POST' "/platform/organizations/$($orgB.id)/status" @{ status = 'INACTIVE' } $token | Out-Null
  $deactivated = Api 'GET' "/platform/organizations/$($orgB.id)" $null $token
  if ($deactivated.status -ne 'INACTIVE') { throw 'Organization deactivation failed' }

  Write-Output "PASS: $run platform organization and tenant isolation checks completed"
} catch {
  Write-Error "FAIL: $run - $($_.Exception.Message)"
  exit 1
}
