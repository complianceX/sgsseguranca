param(
  [int]$Port = 3011,
  [switch]$Watch
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoRoot

$listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
  Select-Object -First 1

if ($listener -and $listener.OwningProcess) {
  Write-Host "Encerrando processo na porta $Port (PID $($listener.OwningProcess))..."
  Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 500
}

if ($Watch) {
  $startScript = 'start:dev'
  Write-Host "Iniciando backend em modo dev/watch na porta $Port..."
} else {
  $startScript = 'start:local'
  Write-Host "Iniciando backend em modo estável na porta $Port..."
}
Set-Location (Join-Path $repoRoot 'backend')
$env:PORT = "$Port"
npm run $startScript
