param(
  [switch]$DryRun = $true
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Exec([string]$cmd) {
  if ($DryRun) {
    Write-Host "[DRYRUN] $cmd"
    return
  }
  Write-Host "[RUN] $cmd"
  Invoke-Expression $cmd
}

# 0) Ensure target directories exist (plain filesystem; not tracked)
$dirsToEnsure = @(
  "ops/railway",
  "ops/docker",
  "ops/deploy",
  "ops/dev",
  "ops/frontend/scripts",
  "docs/assets/root",
  "docs/assets/frontend-audit",
  "backend/src/infra",
  "backend/src/modules",
  "frontend/src"
)

foreach ($d in $dirsToEnsure) {
  if (!(Test-Path $d)) {
    New-Item -ItemType Directory -Path $d | Out-Null
  }
}

# 1) Remove from git tracking (keeps local files unless you delete them later)
$gitUntrack = @(
  "output",
  "test-results",
  ".codex-local-logs",
  "frontend/npm-audit.json"
)

foreach ($p in $gitUntrack) {
  if (Test-Path $p) {
    Exec "git rm -r --cached `"$p`""
  }
}

# 2) Moves (git mv keeps history)
$moves = @(
  # render.yaml permanece na raiz: o Blueprint do Render depende desse contrato.
  @{ from = "railway.web.toml"; to = "ops/railway/railway.web.toml" },
  @{ from = "railway.worker.toml"; to = "ops/railway/railway.worker.toml" },
  @{ from = "railway.migrations.toml"; to = "ops/railway/railway.migrations.toml" },
  @{ from = "docker-compose.yml"; to = "ops/docker/docker-compose.yml" },
  @{ from = "docker-compose.local.yml"; to = "ops/docker/docker-compose.local.yml" },
  @{ from = "Dockerfile"; to = "ops/docker/Dockerfile" },
  @{ from = "Dockerfile.worker"; to = "ops/docker/Dockerfile.worker" },
  @{ from = "deploy-staging.ps1"; to = "ops/deploy/deploy-staging.ps1" },
  @{ from = "deploy-staging.sh"; to = "ops/deploy/deploy-staging.sh" },
  @{ from = "run-local.ps1"; to = "ops/dev/run-local.ps1" },
  @{ from = "stop-local.ps1"; to = "ops/dev/stop-local.ps1" },
  @{ from = "limpar-cache.bat"; to = "ops/dev/limpar-cache.bat" },

  @{ from = "backend/src/common"; to = "backend/src/shared" },
  @{ from = "backend/src/database"; to = "backend/src/infra/database" },
  @{ from = "backend/src/queue"; to = "backend/src/infra/queue" },
  @{ from = "backend/src/mail"; to = "backend/src/infra/mail" },
  @{ from = "backend/src/push"; to = "backend/src/infra/push" },
  @{ from = "backend/src/storage"; to = "backend/src/infra/storage" },
  @{ from = "backend/src/audit"; to = "backend/src/modules/audit-trail" },
  @{ from = "backend/src/audits"; to = "backend/src/modules/audits" },
  @{ from = "backend/src/reports"; to = "backend/src/modules/reports" },
  @{ from = "backend/src/relatorios"; to = "backend/src/modules/reports/_legacy-relatorios" },

  @{ from = "frontend/components"; to = "frontend/src/components" },
  @{ from = "frontend/lib"; to = "frontend/src/lib" },
  @{ from = "frontend/services"; to = "frontend/src/services" },
  @{ from = "frontend/hooks"; to = "frontend/src/hooks" },
  @{ from = "frontend/context"; to = "frontend/src/state" }
  # frontend/scripts is handled file-by-file below to avoid nesting "scripts/scripts"
)

foreach ($m in $moves) {
  if (Test-Path $m.from) {
    Exec "git mv `"$($m.from)`" `"$($m.to)`""
  }
}

# 2.1) Move backend manual SQL migrations (directory cannot be moved into its own subdir)
if (Test-Path "backend/migrations") {
  if (!(Test-Path "backend/migrations/manual-sql")) {
    New-Item -ItemType Directory -Path "backend/migrations/manual-sql" | Out-Null
  }
  Get-ChildItem -File -Force "backend/migrations" -Filter "*.sql" -ErrorAction SilentlyContinue |
    ForEach-Object { Exec "git mv `"$($_.FullName)`" `"backend/migrations/manual-sql/`"" }
}

# 2.2) Move frontend scripts file-by-file (avoid nesting into ops/frontend/scripts/scripts)
if (Test-Path "frontend/scripts") {
  Get-ChildItem -File -Force "frontend/scripts" -ErrorAction SilentlyContinue |
    ForEach-Object { Exec "git mv `"$($_.FullName)`" `"ops/frontend/scripts/`"" }
}

# 3) Move selected root screenshots into docs/assets/root (keep versioned)
$rootScreens = @(
  "current-login-review.png",
  "current-privacidade-review.png",
  "current-termos-review.png",
  "login-smoke.png",
  "termos-redesign.png"
)
foreach ($f in $rootScreens) {
  if (Test-Path $f) {
    Exec "git mv `"$f`" `"docs/assets/root/$f`""
  }
}

# 4) Move frontend audit images into docs (keep versioned)
$frontendAuditImages = Get-ChildItem -File -Force frontend -Filter "audit-*.png" -ErrorAction SilentlyContinue
foreach ($img in $frontendAuditImages) {
  $name = $img.Name
  Exec "git mv `"frontend/$name`" `"docs/assets/frontend-audit/$name`""
}

# 5) Local cleanup (not tracked) - safe to re-generate
$pathsToRemove = @(
  "node_modules",
  "output",
  "test-results",
  ".codex-local-logs",
  "tmp",
  "temp",
  ".npm-cache",
  ".pytest_cache",
  "backend/node_modules",
  "backend/dist",
  "backend/coverage",
  "backend/.cache",
  "backend/tmp",
  "backend/temp",
  "frontend/node_modules",
  "frontend/.next",
  "frontend/.swc",
  "frontend/test-results",
  "frontend/tmp",
  "frontend/temp"
)

foreach ($p in $pathsToRemove) {
  if (Test-Path $p) {
    Exec "Remove-Item -Recurse -Force `"$p`""
  }
}

# 6) Remove root tmp scripts and loose log files
Exec 'Get-ChildItem -File -Force | ? { $_.Name -match "^\.(tmp_).+\.ps1$" -or $_.Name -match ".*\.(out|err)\.log$" } | Remove-Item -Force'

Write-Host "DONE. Next: update imports/paths and .gitignore to prevent artifacts from coming back."
