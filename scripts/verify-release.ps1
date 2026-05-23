#!/usr/bin/env pwsh

param(
    [string]$RenderWebServiceId = "srv-d75c5eea2pns73dv84rg",
    [string]$RenderWorkerServiceId = "srv-d75c5eea2pns73dv84sg",
    [string]$VercelProject = "frontend",
    [string]$ApiHealthUrl = "https://api.sgsseguranca.com.br/health/public",
    [string]$RenderWebHealthUrl = "https://sgs-backend-web-d49b.onrender.com/health/public",
    [string]$AppLoginUrl = "https://app.sgsseguranca.com.br/login",
    [string]$ExpectedCommit = "",
    [int]$HttpTimeoutSec = 20
)

$ErrorActionPreference = "Stop"
$failures = New-Object System.Collections.Generic.List[string]

function Write-Check {
    param(
        [bool]$Ok,
        [string]$SuccessMessage,
        [string]$FailureMessage
    )

    if ($Ok) {
        Write-Host "[OK] $SuccessMessage" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] $FailureMessage" -ForegroundColor Red
        $script:failures.Add($FailureMessage) | Out-Null
    }
}

function Get-JsonPayload {
    param([string]$RawText)

    $objectStart = $RawText.IndexOf("{")
    $arrayStart = $RawText.IndexOf("[")

    if ($objectStart -lt 0 -and $arrayStart -lt 0) {
        throw "No JSON payload found in command output.`n$RawText"
    }

    $start = if ($objectStart -ge 0 -and $arrayStart -ge 0) {
        [Math]::Min($objectStart, $arrayStart)
    } elseif ($objectStart -ge 0) {
        $objectStart
    } else {
        $arrayStart
    }

    $objectEnd = $RawText.LastIndexOf("}")
    $arrayEnd = $RawText.LastIndexOf("]")
    $end = [Math]::Max($objectEnd, $arrayEnd)

    if ($end -lt $start) {
        throw "Invalid JSON boundaries in command output.`n$RawText"
    }

    return $RawText.Substring($start, $end - $start + 1)
}

function Strip-Ansi {
    param([string]$Text)
    return ($Text -replace "\x1B\[[0-9;]*[A-Za-z]", "")
}

function Invoke-JsonCommand {
    param(
        [string]$Exe,
        [string[]]$CommandArgs,
        [string]$Label
    )

    Write-Host "-> $Label"
    $raw = (& $Exe @CommandArgs 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed for '$Label'`n$raw"
    }

    $clean = (Strip-Ansi -Text $raw).Trim()
    try {
        return ($clean | ConvertFrom-Json)
    } catch {
        $jsonText = Get-JsonPayload -RawText $clean
        return ($jsonText | ConvertFrom-Json)
    }
}

function Get-StatusCode {
    param([string]$Url)

    try {
        $response = Invoke-WebRequest -Uri $Url -Method GET -MaximumRedirection 5 -TimeoutSec $HttpTimeoutSec
        return [int]$response.StatusCode
    } catch {
        if ($_.Exception.Response) {
            try {
                return [int]$_.Exception.Response.StatusCode.value__
            } catch {
                return -1
            }
        }
        return -1
    }
}

Write-Host "=== SGS Release Verification ===" -ForegroundColor Cyan
Write-Host "Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')"

$renderWebDeploys = Invoke-JsonCommand -Exe "render" -CommandArgs @("deploys", "list", $RenderWebServiceId, "--output", "json") -Label "Render web deploys"
$renderWorkerDeploys = Invoke-JsonCommand -Exe "render" -CommandArgs @("deploys", "list", $RenderWorkerServiceId, "--output", "json") -Label "Render worker deploys"
$vercelData = Invoke-JsonCommand -Exe "vercel" -CommandArgs @("list", $VercelProject, "-F", "json") -Label "Vercel deployments"

if (-not $renderWebDeploys -or $renderWebDeploys.Count -eq 0) { throw "No Render web deploys found." }
if (-not $renderWorkerDeploys -or $renderWorkerDeploys.Count -eq 0) { throw "No Render worker deploys found." }
if (-not $vercelData.deployments -or $vercelData.deployments.Count -eq 0) { throw "No Vercel deployments found." }

$webLatest = $renderWebDeploys[0]
$workerLatest = $renderWorkerDeploys[0]
$vercelLatest = $vercelData.deployments[0]

Write-Check -Ok ($webLatest.status -eq "live") `
    -SuccessMessage "Render web latest deploy is live ($($webLatest.id), commit $($webLatest.commit.id))" `
    -FailureMessage "Render web latest deploy is '$($webLatest.status)' ($($webLatest.id))"

Write-Check -Ok ($workerLatest.status -eq "live") `
    -SuccessMessage "Render worker latest deploy is live ($($workerLatest.id), commit $($workerLatest.commit.id))" `
    -FailureMessage "Render worker latest deploy is '$($workerLatest.status)' ($($workerLatest.id))"

Write-Check -Ok ($vercelLatest.state -eq "READY") `
    -SuccessMessage "Vercel latest deploy is READY ($($vercelLatest.url))" `
    -FailureMessage "Vercel latest deploy is '$($vercelLatest.state)' ($($vercelLatest.url))"

Write-Check -Ok ($vercelLatest.target -eq "production") `
    -SuccessMessage "Vercel latest deploy target is production" `
    -FailureMessage "Vercel latest deploy target is '$($vercelLatest.target)'"

$vercelCommit = $null
if ($vercelLatest.meta) {
    if ($vercelLatest.meta.gitCommitSha) {
        $vercelCommit = [string]$vercelLatest.meta.gitCommitSha
    } elseif ($vercelLatest.meta.githubCommitSha) {
        $vercelCommit = [string]$vercelLatest.meta.githubCommitSha
    }
}

if ($ExpectedCommit) {
    Write-Check -Ok (($webLatest.commit.id -eq $ExpectedCommit) -and ($workerLatest.commit.id -eq $ExpectedCommit)) `
        -SuccessMessage "Render web/worker are on expected commit $ExpectedCommit" `
        -FailureMessage "Render commits differ from expected commit $ExpectedCommit (web=$($webLatest.commit.id), worker=$($workerLatest.commit.id))"

    if ($vercelCommit) {
        Write-Check -Ok ($vercelCommit -eq $ExpectedCommit) `
            -SuccessMessage "Vercel is on expected commit $ExpectedCommit" `
            -FailureMessage "Vercel commit differs from expected commit $ExpectedCommit (vercel=$vercelCommit)"
    } else {
        Write-Check -Ok $false `
            -SuccessMessage "" `
            -FailureMessage "Could not extract Vercel commit SHA from latest deploy metadata."
    }
}

$apiHealth = Get-StatusCode -Url $ApiHealthUrl
$renderWebHealth = Get-StatusCode -Url $RenderWebHealthUrl
$appLogin = Get-StatusCode -Url $AppLoginUrl

Write-Check -Ok ($apiHealth -eq 200) `
    -SuccessMessage "API health returned 200 ($ApiHealthUrl)" `
    -FailureMessage "API health returned $apiHealth ($ApiHealthUrl)"

Write-Check -Ok ($renderWebHealth -eq 200) `
    -SuccessMessage "Render web health returned 200 ($RenderWebHealthUrl)" `
    -FailureMessage "Render web health returned $renderWebHealth ($RenderWebHealthUrl)"

Write-Check -Ok ($appLogin -eq 200) `
    -SuccessMessage "Frontend login returned 200 ($AppLoginUrl)" `
    -FailureMessage "Frontend login returned $appLogin ($AppLoginUrl)"

Write-Host ""
if ($failures.Count -gt 0) {
    Write-Host "Release verification: FAILED ($($failures.Count) check(s))" -ForegroundColor Red
    exit 1
}

Write-Host "Release verification: SUCCESS" -ForegroundColor Green
exit 0
