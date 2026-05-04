$base = 'https://api.sgsseguranca.com.br'
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

$csrf1 = Invoke-RestMethod -Uri "$base/auth/csrf" -WebSession $session -Method Get
$loginHeaders = @{
  'Content-Type' = 'application/json'
  'x-csrf-token' = $csrf1.csrfToken
}
$loginBody = @{ cpf = '15082302698'; password = 'Sgs@2026#Reset150' } | ConvertTo-Json
$null = Invoke-RestMethod -Uri "$base/auth/login" -WebSession $session -Method Post -Headers $loginHeaders -Body $loginBody

$csrf2 = Invoke-RestMethod -Uri "$base/auth/csrf" -WebSession $session -Method Get
$cookies = $session.Cookies.GetCookies($base)
$refreshCsrf = ($cookies | Where-Object { $_.Name -eq 'refresh_csrf' } | Select-Object -First 1).Value
$requestCsrf = ($cookies | Where-Object { $_.Name -eq 'csrf-token' } | Select-Object -First 1).Value
$refreshHeaders = @{
  'x-refresh-csrf' = $refreshCsrf
  'x-csrf-token' = $requestCsrf
}
$refresh = Invoke-RestMethod -Uri "$base/auth/refresh" -WebSession $session -Method Post -Headers $refreshHeaders
$token = $refresh.accessToken
$apiHeaders = @{ Authorization = "Bearer $token"; 'x-csrf-token' = $requestCsrf }
$aprId = '3b6f3bb9-1685-4556-9fe1-a3a795695fb9'

try {
  $me = Invoke-RestMethod -Uri "$base/auth/me" -Method Get -Headers @{ Authorization = "Bearer $token" }
  Write-Output ('ME=' + ($me | ConvertTo-Json -Compress))
} catch {
  Write-Output 'ME_ERROR'
  throw
}

try {
  $generate = Invoke-RestMethod -Uri "$base/aprs/$aprId/generate-final-pdf" -Method Post -WebSession $session -Headers $apiHeaders
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
  $pdf = Invoke-RestMethod -Uri "$base/aprs/$aprId/pdf" -Method Get -Headers @{ Authorization = "Bearer $token" }
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
