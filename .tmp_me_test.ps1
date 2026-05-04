$base = 'https://api.sgsseguranca.com.br'
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$csrf = Invoke-RestMethod -Uri "$base/auth/csrf" -WebSession $session -Method Get
$headers = @{ 'Content-Type'='application/json'; 'x-csrf-token' = $csrf.csrfToken }
$body = @{ cpf='15082302698'; password='Sgs@2026#Reset150' } | ConvertTo-Json
$login = Invoke-RestMethod -Uri "$base/auth/login" -WebSession $session -Method Post -Headers $headers -Body $body
$token = $login.accessToken
try {
  $me = Invoke-RestMethod -Uri "$base/auth/me" -Method Get -Headers @{ Authorization = "Bearer $token" }
  Write-Output ('ME=' + ($me | ConvertTo-Json -Compress))
} catch {
  $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
  Write-Output ('ME_ERROR=' + [int]$_.Exception.Response.StatusCode.value__)
  Write-Output $reader.ReadToEnd()
}
