$ErrorActionPreference = 'Stop'
$testDirectory = Join-Path ([IO.Path]::GetTempPath()) ('mower-stop-test-' + [guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $testDirectory
$configPath = Join-Path $testDirectory 'runtime.json'
$recordPath = Join-Path $testDirectory 'backend-process.json'
$config = @{runDirectory=$testDirectory; javaPath='C:\test\java.exe'; jarPath='C:\test\backend.jar'}
[IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
$stopScript = Join-Path $PSScriptRoot 'stop.ps1'
$global:mowerStopTest = $null

# 실제 Tailscale·프로세스·포트에는 접근하지 않고 실행 순서와 종료 경계를 검사한다.
function tailscale {
    $global:LASTEXITCODE = 0
    if ($args -contains '--json') {
        if ($global:mowerStopTest.funnelConfigured) {
            '{"TCP":{"443":{"HTTPS":true}},"Web":{"test.ts.net:443":{"Handlers":{"/":{"Proxy":"http://127.0.0.1:8080"}}}}}'
        } else { '{}' }
        return
    }
    if ($args -contains 'off') {
        $global:mowerStopTest.events.Add('funnel-stop')
        if ($global:mowerStopTest.funnelFails) { $global:LASTEXITCODE = 1 }
        else { $global:mowerStopTest.funnelConfigured = $false }
    }
}
function Get-CimInstance {
    param($ClassName, $Filter)
    if ($global:mowerStopTest.running) { $global:mowerStopTest.metadata }
}
function Get-Process {
    param($Id, $ErrorAction)
    $process = [pscustomobject]@{ Id=$Id }
    $process | Add-Member ScriptMethod WaitForExit { param($milliseconds) -not $global:mowerStopTest.running }
    $process
}
function Stop-Process {
    param($InputObject, $ErrorAction)
    $global:mowerStopTest.events.Add('backend-stop')
    $global:mowerStopTest.running = $false
}
function Get-NetTCPConnection {
    param($State, $LocalPort, $ErrorAction)
    if ($global:mowerStopTest.otherListener) { [pscustomobject]@{OwningProcess=999} }
}

function Reset-TestState {
    $now = [datetime]::UtcNow
    $global:LASTEXITCODE = 0
    $global:mowerStopTest = @{
        running=$true; funnelFails=$false; funnelConfigured=$true; otherListener=$false
        events=[System.Collections.Generic.List[string]]::new()
        metadata=[pscustomobject]@{ExecutablePath=$config.javaPath; CommandLine=('java -jar "' + $config.jarPath + '"'); CreationDate=$now}
    }
    $record = @{pid=4242; jarPath=$config.jarPath; startedAt=$now.ToString('o')}
    [IO.File]::WriteAllText($recordPath, ($record | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
}
function Assert-Events([string]$expected) {
    $actual = $global:mowerStopTest.events -join ','
    if ($actual -ne $expected) { throw "종료 순서 불일치: $actual" }
}
function Assert-Rejected([string]$message) {
    $caught = $null
    try { & $stopScript -ConfigPath $configPath | Out-Null } catch { $caught = $_ }
    if (-not $caught -or $caught.Exception.Message -notlike "*$message*") { throw '예상한 이유로 종료를 거부하지 않았습니다.' }
    Assert-Events 'funnel-stop'
    if (-not $global:mowerStopTest.running) { throw '거부된 프로세스를 종료했습니다.' }
}

Reset-TestState
& $stopScript -ConfigPath $configPath | Out-Null
Assert-Events 'funnel-stop,backend-stop'
Write-Output 'PASS 공개 경로를 닫은 뒤 기록된 백엔드만 종료'

Reset-TestState
$global:mowerStopTest.running = $false
& $stopScript -ConfigPath $configPath | Out-Null
Assert-Events 'funnel-stop'
Write-Output 'PASS 이미 종료된 백엔드 재종료'

Reset-TestState
$global:mowerStopTest.funnelConfigured = $false
& $stopScript -ConfigPath $configPath | Out-Null
Assert-Events 'backend-stop'
Write-Output 'PASS 공개 경로가 이미 닫혀도 백엔드 종료'

Reset-TestState
$global:mowerStopTest.funnelConfigured = $false
$global:mowerStopTest.running = $false
& $stopScript -ConfigPath $configPath | Out-Null
Assert-Events ''
Write-Output 'PASS 공개 경로와 백엔드 모두 종료된 상태의 재실행'

Reset-TestState
$global:mowerStopTest.metadata.ExecutablePath = 'C:\other\java.exe'
Assert-Rejected '실행 기록과 프로세스가 달라'
Write-Output 'PASS 다른 Java 경로 거부'

Reset-TestState
$global:mowerStopTest.metadata.CommandLine = 'java -jar "C:\test\backend.jar.other"'
Assert-Rejected '실행 기록과 프로세스가 달라'
Write-Output 'PASS 다른 JAR와 경로 접두어 일치 거부'

Reset-TestState
$global:mowerStopTest.metadata.CreationDate = [datetime]::UtcNow.AddMinutes(1)
Assert-Rejected '실행 기록과 프로세스가 달라'
Write-Output 'PASS PID 재사용 시각 불일치 거부'

Reset-TestState
$record = @{pid=4242; jarPath='C:\other\backend.jar'; startedAt=[datetime]::UtcNow.ToString('o')}
[IO.File]::WriteAllText($recordPath, ($record | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
Assert-Rejected '실행 기록과 프로세스가 달라'
Write-Output 'PASS 기록된 JAR와 설정 불일치 거부'

Reset-TestState
$global:mowerStopTest.funnelFails = $true
Assert-Rejected 'Funnel'
Write-Output 'PASS Funnel 종료 실패 시 백엔드 유지'

Reset-TestState
$global:mowerStopTest.running = $false
$global:mowerStopTest.otherListener = $true
$caught = $null
try { & $stopScript -ConfigPath $configPath | Out-Null } catch { $caught = $_ }
if (-not $caught -or $caught.Exception.Message -notlike '*다른 프로세스*') { throw '다른 8080 프로세스 감지 실패' }
Assert-Events 'funnel-stop'
Write-Output 'PASS 다른 8080 프로세스 미종료'

$global:mowerStopTest = $null
Remove-Item -LiteralPath $configPath, $recordPath
Remove-Item -LiteralPath $testDirectory
Write-Output ('완료: 10개 검사 통과 · PowerShell ' + $PSVersionTable.PSVersion)
