param(
  [switch]$SkipDocker,
  [switch]$SkipInstall,
  [switch]$SkipNodeCheck
)

$ErrorActionPreference = 'Stop'

function Ensure-Node20() {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) {
    throw 'Node.js não encontrado. Instale o Node 20.x (recomendado) e tente novamente.'
  }

  $v = (& node -v) 2>$null
  if (-not $v) {
    throw 'Não foi possível detectar a versão do Node.js.'
  }

  $major = 0
  if ($v -match '^v(\d+)\.') { $major = [int]$Matches[1] }

  if ($major -ne 20) {
    Write-Host ''
    Write-Host "⚠️  Versão atual do Node: $v"
    Write-Host 'Este projeto foi configurado para Node 20.x.'
    Write-Host 'Se o build do frontend falhar (ex.: erro spawn EPERM no next build), troque para Node 20 e rode novamente.'
    Write-Host ''
    throw 'Versão do Node incompatível. Use Node 20.x ou rode com -SkipNodeCheck (não recomendado).'
  }

  return $true
}

function Ensure-NpmCache() {
  $repoRoot = (Resolve-Path '.').Path
  $cacheDir = Join-Path $repoRoot '.npm-cache'
  if (-not (Test-Path $cacheDir)) {
    New-Item -ItemType Directory -Path $cacheDir | Out-Null
  }
  $env:npm_config_cache = $cacheDir
}

function New-RandomSecret([int]$bytes = 24) {
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $data = New-Object byte[] $bytes
    $rng.GetBytes($data)
    return ([Convert]::ToBase64String($data)).TrimEnd('=').Replace('+', '-').Replace('/', '_')
  } finally {
    $rng.Dispose()
  }
}

function Set-EnvValueInFile([string]$path, [string]$key, [string]$value) {
  $content = @()
  if (Test-Path $path) {
    $content = Get-Content $path -ErrorAction SilentlyContinue
  }

  $pattern = '^(\s*' + [regex]::Escape($key) + '\s*=).*$'
  $replaced = $false
  $updated = @()
  foreach ($line in $content) {
    if ($line -match $pattern) {
      if (-not $replaced) {
        $replaced = $true
        $updated += ($Matches[1] + $value)
      }
      continue
    }
    $updated += $line
  }

  if (-not $replaced) {
    $updated += ("$key=$value")
  }

  Set-Content -Path $path -Value $updated -Encoding UTF8
}

function Resolve-Shell() {
  $pwsh = Get-Command pwsh -ErrorAction SilentlyContinue
  if ($pwsh) { return $pwsh.Source }
  $powershell = Get-Command powershell -ErrorAction SilentlyContinue
  if ($powershell) { return $powershell.Source }
  throw 'Nenhum PowerShell encontrado (pwsh/powershell).'
}

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
    return
  }

  foreach ($processId in $pids) {
    try {
      Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    } catch {
      # Ignore dead/already-stopped processes.
    }
  }

  Start-Sleep -Milliseconds 500
}

function Ensure-Docker() {
  docker ps | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Host 'Docker não está acessível. Verifique:'
    Write-Host '1) Docker Desktop está aberto e rodando'
    Write-Host '2) Você está no grupo docker-users (Windows)'
    Write-Host '3) O comando "docker ps" funciona no seu terminal'
    throw 'Docker indisponível.'
  }
}

function Get-EnvValue([string]$path, [string]$key) {
  if (-not (Test-Path $path)) { return $null }
  $line = Select-String -Path $path -Pattern ('^\s*' + [regex]::Escape($key) + '\s*=\s*(.+?)\s*$') -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $line) { return $null }
  $v = $line.Matches[0].Groups[1].Value
  if ($v.StartsWith('"') -and $v.EndsWith('"')) { return $v.Trim('"') }
  return $v
}

function Ensure-LocalInfraEnv() {
  $repoRoot = (Resolve-Path '.').Path
  $envPath = Join-Path $repoRoot '.env.local'

  if (-not (Test-Path $envPath)) {
    $pgPass = New-RandomSecret 24
    $minioPass = New-RandomSecret 24

    @(
      "LOCAL_POSTGRES_USER=postgres"
      "LOCAL_POSTGRES_PASSWORD=$pgPass"
      "LOCAL_POSTGRES_DB=minha-api"
      ""
      "LOCAL_MINIO_ROOT_USER=minio"
      "LOCAL_MINIO_ROOT_PASSWORD=$minioPass"
      ""
    ) | Set-Content -Path $envPath -Encoding UTF8

    Write-Host "✅ Criado .env.local com segredos aleatórios para infra local"
  }

  $localPgPass = Get-EnvValue $envPath 'LOCAL_POSTGRES_PASSWORD'
  $localPgUser = Get-EnvValue $envPath 'LOCAL_POSTGRES_USER'
  $localDbName = Get-EnvValue $envPath 'LOCAL_POSTGRES_DB'
  $localMinioUser = Get-EnvValue $envPath 'LOCAL_MINIO_ROOT_USER'
  $localMinioPass = Get-EnvValue $envPath 'LOCAL_MINIO_ROOT_PASSWORD'

  if ($localPgPass) {
    Set-EnvValueInFile './backend/.env' 'DATABASE_TYPE' 'postgres'
    Set-EnvValueInFile './backend/.env' 'DATABASE_HOST' '127.0.0.1'
    Set-EnvValueInFile './backend/.env' 'DATABASE_PORT' '5433'
    if ($localPgUser) { Set-EnvValueInFile './backend/.env' 'DATABASE_USER' $localPgUser }
    Set-EnvValueInFile './backend/.env' 'DATABASE_PASSWORD' $localPgPass
    if ($localDbName) { Set-EnvValueInFile './backend/.env' 'DATABASE_NAME' $localDbName }

    # Força o backend a NÃO usar DATABASE_URL (que geralmente aponta para Supabase/prod).
    # O AppModule prioriza DATABASE_URL quando está preenchido.
    Set-EnvValueInFile './backend/.env' 'DATABASE_URL' ''
    Set-EnvValueInFile './backend/.env' 'DATABASE_DIRECT_URL' ''
    Set-EnvValueInFile './backend/.env' 'DATABASE_PRIVATE_URL' ''
    Set-EnvValueInFile './backend/.env' 'DATABASE_PUBLIC_URL' ''
    Set-EnvValueInFile './backend/.env' 'URL_DO_BANCO_DE_DADOS' ''
    Set-EnvValueInFile './backend/.env' 'POSTGRES_URL' ''
    Set-EnvValueInFile './backend/.env' 'POSTGRESQL_URL' ''
    Set-EnvValueInFile './backend/.env' 'DATABASE_SSL' 'false'

    # IMPORTANTE: scripts Node (migrations/start) leem variáveis do processo, não o arquivo .env.
    $env:DATABASE_TYPE = 'postgres'
    $env:DATABASE_HOST = '127.0.0.1'
    $env:DATABASE_PORT = '5433'
    if ($localPgUser) { $env:DATABASE_USER = $localPgUser }
    $env:DATABASE_PASSWORD = $localPgPass
    if ($localDbName) { $env:DATABASE_NAME = $localDbName }
    $env:DATABASE_URL = ''
    $env:DATABASE_DIRECT_URL = ''
    $env:DATABASE_PRIVATE_URL = ''
    $env:DATABASE_PUBLIC_URL = ''
    $env:URL_DO_BANCO_DE_DADOS = ''
    $env:POSTGRES_URL = ''
    $env:POSTGRESQL_URL = ''
    $env:DATABASE_SSL = 'false'
  }

  # Storage governado (PDFs finais, anexos, bundles): MinIO local via S3-compatible API.
  # Isto deixa módulos como DID/DDS/APR 100% funcionais em dev sem depender de cloud.
  if ($localMinioUser -and $localMinioPass) {
    Set-EnvValueInFile './backend/.env' 'AWS_ACCESS_KEY_ID' $localMinioUser
    Set-EnvValueInFile './backend/.env' 'AWS_SECRET_ACCESS_KEY' $localMinioPass
    Set-EnvValueInFile './backend/.env' 'AWS_BUCKET_NAME' 'sgs-local'
    Set-EnvValueInFile './backend/.env' 'AWS_REGION' 'us-east-1'
    Set-EnvValueInFile './backend/.env' 'AWS_ENDPOINT' 'http://127.0.0.1:9000'
    Set-EnvValueInFile './backend/.env' 'S3_FORCE_PATH_STYLE' 'true'

    $env:AWS_ACCESS_KEY_ID = $localMinioUser
    $env:AWS_SECRET_ACCESS_KEY = $localMinioPass
    $env:AWS_BUCKET_NAME = 'sgs-local'
    $env:AWS_REGION = 'us-east-1'
    $env:AWS_ENDPOINT = 'http://127.0.0.1:9000'
    $env:S3_FORCE_PATH_STYLE = 'true'
  }
}

function Ensure-LocalFrontendEnv() {
  $frontendEnvPath = './frontend/.env.local'
  $localAiEnabled = Get-EnvValue './.env.local' 'LOCAL_FEATURE_AI_ENABLED'
  $localAprAnalyticsEnabled = Get-EnvValue './.env.local' 'LOCAL_APR_ANALYTICS_ENABLED'
  $localMfaEnabled = Get-EnvValue './.env.local' 'LOCAL_MFA_ENABLED'
  if (-not $localAiEnabled) {
    $localAiEnabled = 'false'
    Set-EnvValueInFile './.env.local' 'LOCAL_FEATURE_AI_ENABLED' $localAiEnabled
  }
  if (-not $localAprAnalyticsEnabled) {
    $localAprAnalyticsEnabled = 'false'
    Set-EnvValueInFile './.env.local' 'LOCAL_APR_ANALYTICS_ENABLED' $localAprAnalyticsEnabled
  }
  if (-not $localMfaEnabled) {
    $localMfaEnabled = 'false'
    Set-EnvValueInFile './.env.local' 'LOCAL_MFA_ENABLED' $localMfaEnabled
  }

  Set-EnvValueInFile $frontendEnvPath 'NEXT_PUBLIC_API_URL' 'http://localhost:3011'
  Set-EnvValueInFile $frontendEnvPath 'API_URL' 'http://localhost:3011'
  Set-EnvValueInFile $frontendEnvPath 'NEXT_PUBLIC_APP_URL' 'http://localhost:3000'
  Set-EnvValueInFile $frontendEnvPath 'NEXT_PUBLIC_FEATURE_AI_ENABLED' $localAiEnabled
  Set-EnvValueInFile $frontendEnvPath 'NEXT_PUBLIC_SOPHIE_AUTOMATION_PHASE1_ENABLED' $localAiEnabled
  Set-EnvValueInFile $frontendEnvPath 'NEXT_PUBLIC_APR_ANALYTICS_ENABLED' $localAprAnalyticsEnabled
  Set-EnvValueInFile './backend/.env' 'FEATURE_AI_ENABLED' $localAiEnabled
  Set-EnvValueInFile './backend/.env' 'MFA_ENABLED' $localMfaEnabled
  Set-EnvValueInFile './backend/.env' 'ADMIN_EMPRESA_MFA_REQUIRED' 'false'

  # Garante precedencia sobre variaveis de ambiente antigas do Windows/terminal.
  $env:NEXT_PUBLIC_API_URL = 'http://localhost:3011'
  $env:API_URL = 'http://localhost:3011'
  $env:NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
  $env:NEXT_PUBLIC_FEATURE_AI_ENABLED = $localAiEnabled
  $env:NEXT_PUBLIC_SOPHIE_AUTOMATION_PHASE1_ENABLED = $localAiEnabled
  $env:NEXT_PUBLIC_APR_ANALYTICS_ENABLED = $localAprAnalyticsEnabled
  $env:FEATURE_AI_ENABLED = $localAiEnabled
  $env:MFA_ENABLED = $localMfaEnabled
  $env:ADMIN_EMPRESA_MFA_REQUIRED = 'false'
}

function Ensure-LocalDevAdminEnv() {
  $defaultCpf = '00000000191'
  $defaultPassword = 'SgsLocal@2026'
  $configuredCpf = Get-EnvValue './.env.local' 'LOCAL_DEV_ADMIN_CPF'
  $configuredPassword = Get-EnvValue './.env.local' 'LOCAL_DEV_ADMIN_PASSWORD'

  if (-not $configuredCpf) {
    $configuredCpf = $defaultCpf
    Set-EnvValueInFile './.env.local' 'LOCAL_DEV_ADMIN_CPF' $configuredCpf
  }

  if (-not $configuredPassword) {
    $configuredPassword = $defaultPassword
    Set-EnvValueInFile './.env.local' 'LOCAL_DEV_ADMIN_PASSWORD' $configuredPassword
  }

  Set-EnvValueInFile './backend/.env' 'DEV_ADMIN_CPF' $configuredCpf
  Set-EnvValueInFile './backend/.env' 'DEV_ADMIN_PASSWORD' $configuredPassword
  Set-EnvValueInFile './backend/.env' 'SEED_ON_BOOTSTRAP' 'true'
  $env:DEV_ADMIN_CPF = $configuredCpf
  $env:DEV_ADMIN_PASSWORD = $configuredPassword
  $env:SEED_ON_BOOTSTRAP = 'true'
}

if (-not $SkipNodeCheck) {
  [void](Ensure-Node20)
}
Ensure-NpmCache
Stop-LocalProjectProcesses
Ensure-LocalInfraEnv
Ensure-LocalFrontendEnv
Ensure-LocalDevAdminEnv

if (-not $SkipDocker) {
  if (-not (Test-Path './docker-compose.local.yml')) {
    throw 'Arquivo docker-compose.local.yml não encontrado na raiz do projeto.'
  }

  Ensure-Docker
  # Compose interpola variáveis ANTES de aplicar env_file. Para evitar variáveis vazias,
  # usamos --env-file apontando para .env.local (infra local).
  docker compose --env-file .env.local -f docker-compose.local.yml up -d
}

if (-not $SkipInstall) {
  if (-not (Test-Path './backend/node_modules')) {
    Push-Location backend
    npm install
    Pop-Location
  }

  if (-not (Test-Path './frontend/node_modules')) {
    Push-Location frontend
    npm install
    Pop-Location
  }
}

$dbType = Get-EnvValue './backend/.env' 'DATABASE_TYPE'
if ($dbType -eq 'postgres') {
  Push-Location backend
  npm run migration:run
  Pop-Location
}

$shell = Resolve-Shell

Start-Process -FilePath $shell -ArgumentList @(
  '-NoExit',
  '-Command',
  'cd backend; npm run start:dev'
)

Start-Process -FilePath $shell -ArgumentList @(
  '-NoExit',
  '-Command',
  '$env:NEXT_PUBLIC_API_URL="http://localhost:3011"; $env:API_URL="http://localhost:3011"; $env:NEXT_PUBLIC_APP_URL="http://localhost:3000"; cd frontend; npm run dev'
)

Write-Host ''
Write-Host '✅ Serviços iniciados (modo dev):'
Write-Host '- Frontend: http://localhost:3000'
Write-Host '- Backend:  http://localhost:3011'
Write-Host '- Swagger:  http://localhost:3011/api/docs'
Write-Host '- Bull UI:  http://localhost:3011/admin/queues'
Write-Host '- MinIO:    http://localhost:9001'
