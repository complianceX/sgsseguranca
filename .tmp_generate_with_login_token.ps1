$base = 'https://api.sgsseguranca.com.br'
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$csrf = Invoke-RestMethod -Uri "$base/auth/csrf" -WebSession $session -Method Get
$headers = @{ 'Content-Type'='application/json'; 'x-csrf-token' = $csrf.csrfToken }
$body = @{ cpf='15082302698'; password='Sgs@2026#Reset150' } | ConvertTo-Json
$login = Invoke-RestMethod -Uri "$base/auth/login" -WebSession $session -Method Post -Headers $headers -Body $body
$token = $login.accessToken
$aprId = '3b6f3bb9-1685-4556-9fe1-a3a795695fb9'
try {
  $generate = Invoke-RestMethod -Uri "$base/aprs/$aprId/generate-final-pdf" -Method Post -Headers @{ Authorization = "Bearer $token"; 'x-csrf-token' = $csrf.csrfToken }
  Write-Output ('GENERATE=' + ($generate | ConvertTo-Json -Compress))
} catch {
  $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
  Write-Output ('GENERATE_ERROR=' + [int]$_.Exception.Response.StatusCode.value__)
  Write-Output $reader.ReadToEnd()
}
try {
  $pdf = Invoke-RestMethod -Uri "$base/aprs/$aprId/pdf" -Method Get -Headers @{ Authorization = "Bearer $token" }
  Write-Output ('PDF=' + ($pdf | ConvertTo-Json -Compress))
} catch {
  $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
  Write-Output ('PDF_ERROR=' + [int]$_.Exception.Response.StatusCode.value__)
  Write-Output $reader.ReadToEnd()
}
