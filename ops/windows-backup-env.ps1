# Dot-source in the current PowerShell session: . .\ops\windows-backup-env.ps1
param(
    [string]$PostgreSqlBin = (Join-Path $PSScriptRoot '..\..\local-tools\pgsql\bin'),
    [string]$GitRoot = 'C:\Program Files\Git'
)

$ErrorActionPreference = 'Stop'
foreach ($file in @('pg_dump.exe', 'pg_dumpall.exe', 'psql.exe', 'initdb.exe', 'pg_ctl.exe')) {
    if (!(Test-Path -LiteralPath (Join-Path $PostgreSqlBin $file))) { throw "Missing PostgreSQL tool: $file" }
}
foreach ($file in @('bin\bash.exe', 'mingw64\bin\openssl.exe', 'usr\bin\sha256sum.exe')) {
    if (!(Test-Path -LiteralPath (Join-Path $GitRoot $file))) { throw "Missing Git tool: $file" }
}
Get-Command supabase -ErrorAction Stop | Out-Null
$PostgreSqlBin = (Resolve-Path -LiteralPath $PostgreSqlBin).Path
$env:PATH = "$PostgreSqlBin;$(Join-Path $GitRoot 'bin');$(Join-Path $GitRoot 'mingw64\bin');$(Join-Path $GitRoot 'usr\bin');$env:PATH"
$env:BACKUP_DUMP_MODE = 'native'
$env:PGCONNECT_TIMEOUT = '15'
& (Join-Path $PostgreSqlBin 'pg_dump.exe') --version
if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed to start' }
& (Join-Path $PostgreSqlBin 'psql.exe') --version
if ($LASTEXITCODE -ne 0) { throw 'psql failed to start' }
'Native backup tools enabled for this PowerShell session.'
