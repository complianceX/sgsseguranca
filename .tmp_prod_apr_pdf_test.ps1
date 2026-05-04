$base = 'https://api.sgsseguranca.com.br'
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$csrf = Invoke-RestMethod -Uri "$base/auth/csrf" -WebSession $session -Method Get
$headers = @{
  'Content-Type' = 'application/json'
  'x-csrf-token' = $csrf.csrfToken
}
$loginBody = @{ cpf = '15082302698'; password = 'Sgs@2026#Reset150' } | ConvertTo-Json
$login = Invoke-RestMethod -Uri "$base/auth/login" -WebSession $session -Method Post -Headers $headers -Body $loginBody
$token = $login.accessToken
$apiHeaders = @{ Authorization = "Bearer $token" }
$aprId = '3b6f3bb9-1685-4556-9fe1-a3a795695fb9'
try {
  $generate = Invoke-RestMethod -Uri "$base/aprs/$aprId/generate-final-pdf" -Method Post -Headers $apiHeaders
  Write-Output ('GENERATE=' + ($generate | ConvertTo-Json -Compress))
} catch {
  if ($_.Exception.Response) {
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $body = $reader.ReadToEnd()
    Write-Output ('GENERATE_ERROR=' + [int]$_.Exception.Response.StatusCode.value__)
    Write-Output $body
  } else {
    throw
  }
}
try {
  $pdf = Invoke-RestMethod -Uri "$base/aprs/$aprId/pdf" -Method Get -Headers $apiHeaders
  Write-Output ('PDF=' + ($pdf | ConvertTo-Json -Compress))
} catch {
  if ($_.Exception.Response) {
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $body = $reader.ReadToEnd()
    Write-Output ('PDF_ERROR=' + [int]$_.Exception.Response.StatusCode.value__)
    Write-Output $body
  } else {
    throw
  }
}
