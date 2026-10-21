[CmdletBinding()]
param([string]$ConfigPath)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
if (-not $ConfigPath) { $ConfigPath = Join-Path $repo '.local-docs/pc-demo/runtime.json' }
$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json

# 공개 경로를 먼저 닫는다. 실패하면 백엔드는 실행 상태를 유지한다.
& (Join-Path $PSScriptRoot 'funnel.ps1') -Action Stop
if ($LASTEXITCODE -ne 0) { throw 'Funnel 공개 종료에 실패해 백엔드를 종료하지 않았습니다.' }

$recordPath = Join-Path $config.runDirectory 'backend-process.json'
if (-not (Test-Path -LiteralPath $recordPath)) {
    throw 'Funnel은 닫았지만 백엔드 실행 기록이 없어 자동 종료할 수 없습니다.'
}
$record = Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json
$backendProcessId = [int]$record.pid
if ($backendProcessId -le 0) { throw '백엔드 실행 기록의 프로세스 번호가 올바르지 않습니다.' }
$metadata = Get-CimInstance Win32_Process -Filter "ProcessId=$backendProcessId"
if (-not $metadata) {
    if (Get-NetTCPConnection -State Listen -LocalPort 8080 -ErrorAction SilentlyContinue) {
        throw '기록된 백엔드는 없지만 8080 포트를 다른 프로세스가 사용 중입니다.'
    }
    Write-Output 'Funnel은 닫혔고 백엔드는 이미 종료된 상태입니다.'
    return
}

# PID가 재사용됐더라도 다른 Java 프로그램이나 새 프로세스를 종료하지 않는다.
$startedAt = ([datetimeoffset]$record.startedAt).UtcDateTime
$createdAt = $metadata.CreationDate.ToUniversalTime()
$jarArgument = '(?:^|\s)-jar\s+"?' + [regex]::Escape($config.jarPath) + '"?(?=\s|$)'
if ($record.jarPath -ne $config.jarPath -or $metadata.ExecutablePath -ne $config.javaPath -or
    $metadata.CommandLine -notmatch $jarArgument -or
    [math]::Abs(($createdAt - $startedAt).TotalSeconds) -gt 5) {
    throw 'Funnel은 닫았지만 실행 기록과 프로세스가 달라 백엔드를 종료하지 않았습니다.'
}
$backendProcess = Get-Process -Id $backendProcessId -ErrorAction Stop
Stop-Process -InputObject $backendProcess -ErrorAction Stop
if (-not $backendProcess.WaitForExit(5000)) { throw '백엔드 종료 대기 시간이 초과됐습니다.' }
if (Get-NetTCPConnection -State Listen -LocalPort 8080 -ErrorAction SilentlyContinue) {
    throw '기록된 백엔드는 종료했지만 8080 포트를 다른 프로세스가 사용 중입니다.'
}
Write-Output 'Funnel 공개와 PC 백엔드를 종료했습니다. DB와 MQTT는 계속 실행됩니다.'
