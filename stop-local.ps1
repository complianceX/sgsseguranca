param(
  [switch]$SkipDocker
)

$ErrorActionPreference = 'Stop'

function Stop-LocalProjectProcesses() {
  $repoPath = (Resolve-Path '.').Path
  $escapedRepo = [regex]::Escape($repoPath)
  $targetPorts = @(3000, 3011)
  $pids = New-Object System.Collections.Generic.HashSet[int]

  foreach ($port in $targetPorts) {
    $listeners = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
    foreach ($listener in $listeners) {
      if ($null -ne $listener.OwningProcess) {
        [void]$pids.Add([int]$listener.OwningProcess)
      }
    }
  }

  $processes = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue
  foreach ($process in $processes) {
    $cmd = [string]($process.CommandLine)
    if (-not $cmd) { continue }

    $isRepoNode = $process.Name -eq 'node.exe' -and $cmd -match $escapedRepo
    $isRepoShell = ($process.Name -eq 'pwsh.exe' -or $process.Name -eq 'powershell.exe') -and $cmd -match $escapedRepo -and $cmd -match 'npm run (start:dev|dev)'

    if ($isRepoNode -or $isRepoShell) {
      [void]$pids.Add([int]$process.ProcessId)
    }
  }

  if ($pids.Count -eq 0) {
    Write-Host 'ℹ️ Nenhum processo local do projeto encontrado.'
    return
  }

  foreach ($processId in $pids) {
    try {
      Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    } catch {
      # Ignore dead/already-stopped processes.
    }
  }

  Write-Host '✅ Backend/frontend locais finalizados.'
}

Stop-LocalProjectProcesses

if (-not $SkipDocker) {
  if (-not (Test-Path './docker-compose.local.yml')) {
    Write-Host 'docker-compose.local.yml não encontrado; nada para parar no Docker.'
    exit 0
  }

  docker compose -f docker-compose.local.yml down
  Write-Host '✅ Docker compose finalizado.'
}
