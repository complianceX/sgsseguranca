$base = 'https://api.sgsseguranca.com.br'
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$csrf = Invoke-RestMethod -Uri "$base/auth/csrf" -WebSession $session -Method Get
$headers = @{ 'Content-Type'='application/json'; 'x-csrf-token' = $csrf.csrfToken }
$body = @{ cpf='15082302698'; password='Sgs@2026#Reset150' } | ConvertTo-Json
$login = Invoke-RestMethod -Uri "$base/auth/login" -WebSession $session -Method Post -Headers $headers -Body $body
Write-Output ('LOGIN=' + ($login | ConvertTo-Json -Compress))
$token = $login.accessToken
$parts = $token.Split('.')
$payload = $parts[1]
while ($payload.Length % 4 -ne 0) { $payload += '=' }
$payload = $payload.Replace('-', '+').Replace('_', '/')
$json = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload))
Write-Output ('JWT=' + $json)
Write-Output 'COOKIES:'
$session.Cookies.GetCookies($base) | ForEach-Object { Write-Output ($_.Name + '=' + $_.Value + '; domain=' + $_.Domain) }
