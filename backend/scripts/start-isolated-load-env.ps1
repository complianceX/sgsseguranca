$isolatedPort = if ($env:ISOLATED_PORT) { $env:ISOLATED_PORT } else { '3011' }
$isolatedDbName = if ($env:ISOLATED_DB_NAME) { $env:ISOLATED_DB_NAME } else { 'gst_loadtest_5' }
$isolatedDbPassword = if ($env:ISOLATED_DB_PASSWORD) { $env:ISOLATED_DB_PASSWORD } else { 'postgres' }

$env:DATABASE_URL = "postgresql://postgres:$isolatedDbPassword@127.0.0.1:5433/$isolatedDbName"
$env:DATABASE_PRIVATE_URL = ''
$env:DATABASE_PUBLIC_URL = ''
$env:URL_DO_BANCO_DE_DADOS = ''
$env:DATABASE_TYPE = 'postgres'
$env:DATABASE_HOST = '127.0.0.1'
$env:DATABASE_PORT = '5433'
$env:DATABASE_USER = 'postgres'
$env:DATABASE_PASSWORD = $isolatedDbPassword
$env:DATABASE_NAME = $isolatedDbName
$env:DATABASE_SSL = 'false'
$env:DATABASE_SSL_ALLOW_INSECURE = 'false'
$env:MIGRATION_DEFERRED_IDS = '1709000000086,1709000000087,1709000000088,1709000000089,1709000000090,1709000000091,1709000000092,1709000000093,1709000000094,1709000000116'
$env:PORT = $isolatedPort
$env:REDIS_DISABLED = 'false'
$env:REDIS_HOST = '127.0.0.1'
$env:REDIS_PORT = '6379'
$env:REDIS_TLS = 'false'
$env:THROTTLER_AUTH_LIMIT = '100'

Set-Location (Join-Path $PSScriptRoot '..')
npm.cmd run start:web
