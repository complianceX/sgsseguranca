$base = 'https://api.sgsseguranca.com.br'
$companyId = '22532924-055c-41a0-b0b2-20ca91a71b31'
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$csrf = Invoke-RestMethod -Uri "$base/auth/csrf" -WebSession $session -Method Get
$headers = @{ 'Content-Type'='application/json'; 'x-csrf-token' = $csrf.csrfToken }
$body = @{ cpf='15082302698'; password='Sgs@2026#Reset150' } | ConvertTo-Json
$login = Invoke-RestMethod -Uri "$base/auth/login" -WebSession $session -Method Post -Headers $headers -Body $body
$token = $login.accessToken
$aprId = '3b6f3bb9-1685-4556-9fe1-a3a795695fb9'
$authHeaders = @{ Authorization = "Bearer $token"; 'x-company-id' = $companyId }
$mutatingHeaders = @{ Authorization = "Bearer $token"; 'x-company-id' = $companyId; 'x-csrf-token' = $csrf.csrfToken }
try {
  $generate = Invoke-RestMethod -Uri "$base/aprs/$aprId/generate-final-pdf" -Method Post -WebSession $session -Headers $mutatingHeaders
  Write-Output ('GENERATE=' + ($generate | ConvertTo-Json -Compress))
} catch {
  $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
  Write-Output ('GENERATE_ERROR=' + [int]$_.Exception.Response.StatusCode.value__)
  Write-Output $reader.ReadToEnd()
}
try {
  $pdf = Invoke-RestMethod -Uri "$base/aprs/$aprId/pdf" -Method Get -Headers $authHeaders
  Write-Output ('PDF=' + ($pdf | ConvertTo-Json -Compress))
} catch {
  $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
  Write-Output ('PDF_ERROR=' + [int]$_.Exception.Response.StatusCode.value__)
  Write-Output $reader.ReadToEnd()
}
