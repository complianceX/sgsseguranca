$requestedEnvFile = $env:ENV_FILE

Write-Host "Validando configuracoes de seguranca..." -ForegroundColor Cyan
Write-Host ""

$script:ERRORS = 0
$script:WARNINGS = 0
$script:PASSED = 0

function Test-EnvVar {
    param (
        [string]$VarName,
        [string]$VarValue,
        [int]$MinLength = 0,
        [bool]$Required = $false
    )

    if ([string]::IsNullOrEmpty($VarValue)) {
        if ($Required) {
            Write-Host "ERROR: $VarName nao configurado" -ForegroundColor Red
            $script:ERRORS++
        } else {
            Write-Host "WARN: $VarName nao configurado (opcional)" -ForegroundColor Yellow
            $script:WARNINGS++
        }
        return $false
    }

    if ($MinLength -gt 0 -and $VarValue.Length -lt $MinLength) {
        Write-Host "ERROR: $VarName muito curto (minimo: $MinLength caracteres)" -ForegroundColor Red
        $script:ERRORS++
        return $false
    }

    Write-Host "OK: $VarName configurado" -ForegroundColor Green
    $script:PASSED++
    return $true
}

function Test-AnyEnvVar {
    param (
        [string[]]$VarNames,
        [string]$Label,
        [bool]$Required = $false
    )

    foreach ($varName in $VarNames) {
        $value = [Environment]::GetEnvironmentVariable($varName, 'Process')
        if (-not [string]::IsNullOrEmpty($value)) {
            return Test-EnvVar -VarName $Label -VarValue $value -Required $true
        }
    }

    if ($Required) {
        Write-Host "ERROR: $Label nao configurado" -ForegroundColor Red
        $script:ERRORS++
    } else {
        Write-Host "WARN: $Label nao configurado (opcional)" -ForegroundColor Yellow
        $script:WARNINGS++
    }

    return $false
}

function Import-EnvFile {
    param ([string]$Path)

    Get-Content $Path | ForEach-Object {
        $line = [string]$_
        if ([string]::IsNullOrWhiteSpace($line)) {
            return
        }

        $trimmed = $line.Trim()
        if ($trimmed.StartsWith('#')) {
            return
        }

        $parts = $line.Split('=', 2)
        if ($parts.Count -ne 2) {
            return
        }

        $key = $parts[0].Trim()
        $existingValue = [Environment]::GetEnvironmentVariable($key, 'Process')
        if (-not [string]::IsNullOrEmpty($existingValue)) {
            return
        }

        $value = $parts[1].Trim()
        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        }

        [Environment]::SetEnvironmentVariable($key, $value, 'Process')
    }
}

$envPath = $null
if ($requestedEnvFile -and (Test-Path $requestedEnvFile)) {
    $envPath = $requestedEnvFile
} elseif (Test-Path '.env') {
    $envPath = '.env'
} elseif (Test-Path '.env.local') {
    $envPath = '.env.local'
} elseif (Test-Path 'test/.env') {
    $envPath = 'test/.env'
}

if (-not $envPath) {
    Write-Host "WARN: arquivo .env/.env.local/test/.env nao encontrado; usando variaveis do ambiente atual" -ForegroundColor Yellow
    $script:WARNINGS++
} else {
    Import-EnvFile -Path $envPath
    Write-Host "Arquivo de ambiente: $envPath" -ForegroundColor Cyan
}
Write-Host ""

Write-Host "1. Ambiente" -ForegroundColor Cyan
$nodeEnv = $env:NODE_ENV
Test-EnvVar -VarName 'NODE_ENV' -VarValue $nodeEnv -Required $true | Out-Null
if ($nodeEnv -ne 'production' -and $nodeEnv -ne 'development' -and $nodeEnv -ne 'test') {
    Write-Host "ERROR: NODE_ENV deve ser production, development ou test" -ForegroundColor Red
    $script:ERRORS++
}
Write-Host ""

Write-Host "2. JWT" -ForegroundColor Cyan
Test-EnvVar -VarName 'JWT_SECRET' -VarValue $env:JWT_SECRET -MinLength 32 -Required $true | Out-Null
Test-EnvVar -VarName 'JWT_EXPIRES_IN' -VarValue $env:JWT_EXPIRES_IN -Required $true | Out-Null
Write-Host ""

Write-Host "3. Banco de dados" -ForegroundColor Cyan
if ($env:DATABASE_URL) {
    Test-EnvVar -VarName 'DATABASE_URL' -VarValue $env:DATABASE_URL -Required $true | Out-Null
} else {
    Test-EnvVar -VarName 'DATABASE_HOST' -VarValue $env:DATABASE_HOST -Required $true | Out-Null
    Test-EnvVar -VarName 'DATABASE_PORT' -VarValue $env:DATABASE_PORT -Required $true | Out-Null
    Test-EnvVar -VarName 'DATABASE_USER' -VarValue $env:DATABASE_USER -Required $true | Out-Null
    Test-EnvVar -VarName 'DATABASE_PASSWORD' -VarValue $env:DATABASE_PASSWORD -MinLength 16 -Required $true | Out-Null
    Test-EnvVar -VarName 'DATABASE_NAME' -VarValue $env:DATABASE_NAME -Required $true | Out-Null
}

if ($nodeEnv -eq 'production') {
    if ($env:DATABASE_SSL -ne 'true') {
        Write-Host "ERROR: DATABASE_SSL deve ser true em producao" -ForegroundColor Red
        $script:ERRORS++
    } else {
        Write-Host "OK: DATABASE_SSL habilitado" -ForegroundColor Green
        $script:PASSED++
    }
}
Write-Host ""

Write-Host "4. Redis" -ForegroundColor Cyan
$redisDisabled = $false
if ($env:REDIS_DISABLED -and $env:REDIS_DISABLED.ToLower() -eq 'true') {
    $redisDisabled = $true
}

if ($redisDisabled) {
    Write-Host "WARN: REDIS_DISABLED=true; validacao de Redis ignorada" -ForegroundColor Yellow
    $script:WARNINGS++
} else {
    $tierRedisConfigured = `
        (-not [string]::IsNullOrEmpty($env:REDIS_AUTH_URL)) -and `
        (-not [string]::IsNullOrEmpty($env:REDIS_CACHE_URL)) -and `
        (-not [string]::IsNullOrEmpty($env:REDIS_QUEUE_URL))

    $genericRedisConfigured = `
        (-not [string]::IsNullOrEmpty($env:REDIS_URL)) -or `
        (-not [string]::IsNullOrEmpty($env:URL_REDIS)) -or `
        (-not [string]::IsNullOrEmpty($env:REDIS_PUBLIC_URL)) -or `
        (-not [string]::IsNullOrEmpty($env:REDIS_HOST))

    if ($nodeEnv -eq 'production') {
        if ($tierRedisConfigured) {
            Test-AnyEnvVar -VarNames @('REDIS_AUTH_URL') -Label 'REDIS_AUTH_URL' -Required $true | Out-Null
            Test-AnyEnvVar -VarNames @('REDIS_CACHE_URL') -Label 'REDIS_CACHE_URL' -Required $true | Out-Null
            Test-AnyEnvVar -VarNames @('REDIS_QUEUE_URL') -Label 'REDIS_QUEUE_URL' -Required $true | Out-Null
            if ($genericRedisConfigured) {
                Write-Host "WARN: REDIS_URL/URL_REDIS tambem estao definidos, mas os tiers explicitos terao precedencia em producao" -ForegroundColor Yellow
                $script:WARNINGS++
            }
        } elseif ($genericRedisConfigured) {
            Test-AnyEnvVar -VarNames @('REDIS_URL', 'URL_REDIS', 'REDIS_PUBLIC_URL', 'REDIS_HOST') -Label 'Fallback Redis generico' -Required $true | Out-Null
            Write-Host "WARN: Redis em producao usa fallback generico; prefira REDIS_AUTH_URL/REDIS_CACHE_URL/REDIS_QUEUE_URL" -ForegroundColor Yellow
            $script:WARNINGS++
        } else {
            Test-AnyEnvVar -VarNames @('REDIS_AUTH_URL') -Label 'REDIS_AUTH_URL' -Required $true | Out-Null
            Test-AnyEnvVar -VarNames @('REDIS_CACHE_URL') -Label 'REDIS_CACHE_URL' -Required $true | Out-Null
            Test-AnyEnvVar -VarNames @('REDIS_QUEUE_URL') -Label 'REDIS_QUEUE_URL' -Required $true | Out-Null
        }
    } else {
        Test-AnyEnvVar -VarNames @('REDIS_AUTH_URL', 'REDIS_URL', 'URL_REDIS', 'REDIS_PUBLIC_URL', 'REDIS_HOST') -Label 'Redis AUTH' -Required $false | Out-Null
        Test-AnyEnvVar -VarNames @('REDIS_CACHE_URL', 'REDIS_URL', 'URL_REDIS', 'REDIS_PUBLIC_URL', 'REDIS_HOST') -Label 'Redis CACHE' -Required $false | Out-Null
        Test-AnyEnvVar -VarNames @('REDIS_QUEUE_URL', 'REDIS_URL', 'URL_REDIS', 'REDIS_PUBLIC_URL', 'REDIS_HOST') -Label 'Redis QUEUE' -Required $false | Out-Null
    }
}
Write-Host ""

Write-Host "5. Email" -ForegroundColor Cyan
$emailRequired = $nodeEnv -ne 'test'
Test-EnvVar -VarName 'MAIL_HOST' -VarValue $env:MAIL_HOST -Required $emailRequired | Out-Null
Test-EnvVar -VarName 'MAIL_PORT' -VarValue $env:MAIL_PORT -Required $emailRequired | Out-Null
Test-EnvVar -VarName 'MAIL_USER' -VarValue $env:MAIL_USER -Required $emailRequired | Out-Null
Test-EnvVar -VarName 'MAIL_PASS' -VarValue $env:MAIL_PASS -Required $emailRequired | Out-Null
Test-EnvVar -VarName 'MAIL_FROM_EMAIL' -VarValue $env:MAIL_FROM_EMAIL -Required $emailRequired | Out-Null
Write-Host ""

Write-Host "6. AWS/R2" -ForegroundColor Cyan
Test-EnvVar -VarName 'AWS_ACCESS_KEY_ID' -VarValue $env:AWS_ACCESS_KEY_ID -Required $false | Out-Null
Test-EnvVar -VarName 'AWS_SECRET_ACCESS_KEY' -VarValue $env:AWS_SECRET_ACCESS_KEY -Required $false | Out-Null
Test-EnvVar -VarName 'AWS_S3_BUCKET' -VarValue $env:AWS_S3_BUCKET -Required $false | Out-Null
Write-Host ""

Write-Host "6.1 AV/CDR" -ForegroundColor Cyan
$antivirusProvider = $env:ANTIVIRUS_PROVIDER
if ([string]::IsNullOrEmpty($antivirusProvider)) {
    Write-Host "WARN: ANTIVIRUS_PROVIDER nao configurado" -ForegroundColor Yellow
    $script:WARNINGS++
} elseif ($antivirusProvider.ToLower() -eq 'clamav') {
    Test-EnvVar -VarName 'CLAMAV_HOST' -VarValue $env:CLAMAV_HOST -Required $true | Out-Null
    Test-EnvVar -VarName 'CLAMAV_PORT' -VarValue $env:CLAMAV_PORT -Required $true | Out-Null
} else {
    Write-Host "WARN: ANTIVIRUS_PROVIDER=$antivirusProvider sem validacao especifica neste script" -ForegroundColor Yellow
    $script:WARNINGS++
}
Write-Host ""

Write-Host "6.2 MFA" -ForegroundColor Cyan
$mfaEnabled = $true
if ($env:MFA_ENABLED -and $env:MFA_ENABLED.ToLower() -ne 'true') {
    $mfaEnabled = $false
}

if ($mfaEnabled) {
    $mfaRequired = $false
    if ($nodeEnv -eq 'production') {
        $mfaRequired = $true
    }
    Test-EnvVar -VarName 'MFA_TOTP_ENCRYPTION_KEY' -VarValue $env:MFA_TOTP_ENCRYPTION_KEY -MinLength 32 -Required $mfaRequired | Out-Null
} else {
    Write-Host "WARN: MFA_ENABLED=false" -ForegroundColor Yellow
    $script:WARNINGS++
}
Write-Host ""

Write-Host "7. Verificacoes adicionais" -ForegroundColor Cyan
if ($env:DATABASE_PASSWORD) {
    if ($env:DATABASE_PASSWORD -match '^[0-9]+$') {
        Write-Host "WARN: DATABASE_PASSWORD contem apenas numeros" -ForegroundColor Yellow
        $script:WARNINGS++
    } elseif ($nodeEnv -ne 'test' -and $env:DATABASE_PASSWORD.Length -lt 16) {
        Write-Host "ERROR: DATABASE_PASSWORD muito curta" -ForegroundColor Red
        $script:ERRORS++
    } elseif ($nodeEnv -eq 'test' -and $env:DATABASE_PASSWORD.Length -lt 16) {
        Write-Host "WARN: DATABASE_PASSWORD curta no ambiente de teste" -ForegroundColor Yellow
        $script:WARNINGS++
    } else {
        Write-Host "OK: DATABASE_PASSWORD forte" -ForegroundColor Green
        $script:PASSED++
    }
}

if ($env:JWT_SECRET) {
    if ($env:JWT_SECRET -eq 'dev_secret_key_change_in_production_min_32_chars') {
        Write-Host "ERROR: JWT_SECRET usa valor de exemplo" -ForegroundColor Red
        $script:ERRORS++
    } elseif ($env:JWT_SECRET.Length -lt 32) {
        Write-Host "ERROR: JWT_SECRET muito curto" -ForegroundColor Red
        $script:ERRORS++
    } else {
        Write-Host "OK: JWT_SECRET forte" -ForegroundColor Green
        $script:PASSED++
    }
}

if ($nodeEnv -eq 'production' -and $env:LEGACY_PASSWORD_AUTH_ENABLED -and $env:LEGACY_PASSWORD_AUTH_ENABLED.ToLower() -eq 'true') {
    Write-Host "ERROR: LEGACY_PASSWORD_AUTH_ENABLED=true em producao" -ForegroundColor Red
    $script:ERRORS++
}
Write-Host ""

Write-Host "Resumo" -ForegroundColor Cyan
Write-Host "OK: $script:PASSED" -ForegroundColor Green
Write-Host "WARN: $script:WARNINGS" -ForegroundColor Yellow
Write-Host "ERROR: $script:ERRORS" -ForegroundColor Red
Write-Host ""

if ($script:ERRORS -gt 0) {
    Write-Host "VALIDACAO FALHOU" -ForegroundColor Red
    exit 1
}

if ($script:WARNINGS -gt 0) {
    Write-Host "VALIDACAO PASSOU COM AVISOS" -ForegroundColor Yellow
    exit 0
}

Write-Host "VALIDACAO PASSOU" -ForegroundColor Green
exit 0
