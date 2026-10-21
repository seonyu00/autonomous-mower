[CmdletBinding()]
param([string]$ConfigPath)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
if (-not $ConfigPath) { $ConfigPath = Join-Path $repo '.local-docs/pc-demo/runtime.json' }
$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
if ($config.environment.SERVER_ADDRESS -ne '127.0.0.1' -or $config.environment.SERVER_PORT -ne '8080' -or
    $config.environment.MQTT_BROKER_URL -ne 'ssl://localhost:18883') {
    throw '이 실행기는 PC 내부 API 8080·MQTT TLS 18883 설정만 허용합니다.'
}
if (-not (Test-Path -LiteralPath $config.javaPath) -or -not (Test-Path -LiteralPath $config.jarPath)) {
    throw 'Java 21 실행 파일 또는 빌드한 백엔드 JAR를 찾을 수 없습니다.'
}
$previous = @{}
Push-Location $repo
try {
    foreach ($group in @($config.composeEnvironment, $config.environment)) {
        foreach ($property in $group.PSObject.Properties) {
            if (-not $previous.ContainsKey($property.Name)) {
                $previous[$property.Name] = [Environment]::GetEnvironmentVariable($property.Name, 'Process')
            }
            [Environment]::SetEnvironmentVariable($property.Name, [string]$property.Value, 'Process')
        }
    }
    # 설정 검사 결과에는 DB 비밀번호가 포함되므로 stdout에 전체를 출력하지 않는다.
    $merged = & docker compose -f docker-compose.yml -f docker-compose.pc-demo.yml config --format json | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw 'Compose 설정 검사에 실패했습니다.' }
    foreach ($service in @('postgres', 'mosquitto')) {
        $ports = @($merged.services.$service.ports)
        $expected = if ($service -eq 'postgres') { 5432 } else { 18883 }
        if ($ports.Count -ne 1 -or $ports[0].host_ip -ne '127.0.0.1' -or [int]$ports[0].published -ne $expected) {
            throw '기존 평문 포트가 남아 있거나 로컬 바인딩이 아닙니다.'
        }
    }
    $listener = Get-NetTCPConnection -State Listen -LocalPort 8080 -ErrorAction SilentlyContinue
    if ($listener) { throw '8080 포트가 사용 중입니다. 기존 서버를 확인한 뒤 실행하세요.' }
    & docker compose -f docker-compose.yml -f docker-compose.pc-demo.yml up -d postgres mosquitto
    if ($LASTEXITCODE -ne 0) { throw 'DB·MQTT 기동에 실패했습니다.' }
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        & docker exec autonomous-mower-postgres pg_isready -U $config.composeEnvironment.POSTGRES_USER -d $config.composeEnvironment.POSTGRES_DB *> $null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Milliseconds 500
    }
    if (-not $ready) { throw 'DB 준비 시간 초과입니다.' }
    # 비밀번호는 인자에 넣지 않고 자식 프로세스의 환경으로 전달한다.
    $process = Start-Process -FilePath $config.javaPath -ArgumentList @('-jar', ('"' + $config.jarPath + '"')) -WorkingDirectory $repo -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $config.runDirectory 'backend.log') `
        -RedirectStandardError (Join-Path $config.runDirectory 'backend-error.log')
    $processInfo = @{pid=$process.Id; jarPath=$config.jarPath; startedAt=(Get-Date).ToUniversalTime().ToString('o')} |
        ConvertTo-Json
    # Windows PowerShell 5.1에서도 BOM 없는 UTF-8로 프로세스 기록을 저장한다.
    [System.IO.File]::WriteAllText(
        (Join-Path $config.runDirectory 'backend-process.json'), $processInfo,
        [System.Text.UTF8Encoding]::new($false))
    Write-Output 'PC 백엔드를 시작했습니다. 준비 상태는 http://127.0.0.1:8080/actuator/health 에서 확인하세요.'
} finally {
    foreach ($key in $previous.Keys) { [Environment]::SetEnvironmentVariable($key, $previous[$key], 'Process') }
    Pop-Location
}
