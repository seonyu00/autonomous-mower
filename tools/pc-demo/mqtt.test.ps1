$ErrorActionPreference = 'Stop'
$mqttScript = Join-Path $PSScriptRoot 'mqtt.ps1'
$global:mowerMqttTest = $null
function Reset-TestState {
    $global:LASTEXITCODE = 0
    $global:mowerMqttTest = @{
        state='{"TCP":{"443":{"HTTPS":true}},"Web":{"test.ts.net:443":{"Handlers":{"/":{"Proxy":"http://127.0.0.1:8080"}}}},"AllowFunnel":{"test.ts.net:443":true}}' | ConvertFrom-Json
        changes=0; listener=$true; cliFails=$false
    }
}
function tailscale {
    $global:LASTEXITCODE = 0
    if ($args -contains '--json') { $global:mowerMqttTest.state | ConvertTo-Json -Depth 10; return }
    if ($args -contains '--bg') {
        if ($args -contains 'reset' -or $args -notcontains '--tcp=18883') { throw '다른 접속 경로 변경 시도' }
        $global:mowerMqttTest.changes++
        if ($global:mowerMqttTest.cliFails) { $global:LASTEXITCODE=1; return }
        if ($args -contains 'off') { $global:mowerMqttTest.state.TCP.PSObject.Properties.Remove('18883') }
        else {
            $global:mowerMqttTest.state.TCP | Add-Member -Force -NotePropertyName '18883' -NotePropertyValue ([pscustomobject]@{TCPForward='127.0.0.1:18883'})
        }
    }
}
function Get-NetTCPConnection {
    param($State,$LocalPort,$ErrorAction)
    if ($global:mowerMqttTest.listener) { [pscustomobject]@{LocalAddress='127.0.0.1'} }
}
function Assert-WebPreserved {
    $state=$global:mowerMqttTest.state
    if (-not $state.TCP.'443'.HTTPS -or -not $state.AllowFunnel.'test.ts.net:443' -or
        $state.Web.'test.ts.net:443'.Handlers.'/'.Proxy -ne 'http://127.0.0.1:8080') { throw '기존 웹 공개 경로 변경' }
}
function Assert-Rejected([string]$message) {
    $caught=$null
    try { & $mqttScript -Action Start | Out-Null } catch { $caught=$_ }
    if (-not $caught -or $caught.Exception.Message -notlike "*$message*") { throw '예상한 이유로 거부하지 않았습니다.' }
    Assert-WebPreserved
}
Reset-TestState
& $mqttScript -Action Start | Out-Null
& $mqttScript -Action Start | Out-Null
if ($global:mowerMqttTest.changes -ne 1) { throw '중복 기동이 설정을 다시 변경했습니다.' }
Assert-WebPreserved
Write-Output 'PASS 기존 Funnel 보존과 반복 기동'
& $mqttScript -Action Stop | Out-Null
& $mqttScript -Action Stop | Out-Null
if ($global:mowerMqttTest.changes -ne 2) { throw '중복 종료가 설정을 다시 변경했습니다.' }
Assert-WebPreserved
Write-Output 'PASS MQTT 경로만 종료하고 반복 종료 지원'
Reset-TestState
$global:mowerMqttTest.state.TCP | Add-Member -NotePropertyName '18883' -NotePropertyValue ([pscustomobject]@{TCPForward='127.0.0.1:9999'})
Assert-Rejected '다른 서비스'
if ($global:mowerMqttTest.changes) { throw '충돌 설정 변경' }
Write-Output 'PASS 다른 TCP 서비스 덮어쓰기 거부'
Reset-TestState
$global:mowerMqttTest.state.TCP | Add-Member -NotePropertyName '18883' -NotePropertyValue ([pscustomobject]@{TCPForward='127.0.0.1:18883';TerminateTLS='test.ts.net'})
Assert-Rejected '다른 서비스'
Write-Output 'PASS TLS 종료 프록시 덮어쓰기 거부'
Reset-TestState
$global:mowerMqttTest.state.AllowFunnel | Add-Member -NotePropertyName 'test.ts.net:18883' -NotePropertyValue $true
Assert-Rejected '인터넷 공개'
if ($global:mowerMqttTest.changes) { throw '공개된 MQTT 설정 변경' }
Write-Output 'PASS MQTT 인터넷 공개 상태 거부'
Reset-TestState
$global:mowerMqttTest.listener=$false
Assert-Rejected '준비되지'
Write-Output 'PASS 내부 MQTT 리스너가 없으면 기동 거부'
Reset-TestState
$global:mowerMqttTest.cliFails=$true
Assert-Rejected '변경에 실패'
Write-Output 'PASS Tailscale CLI 실패 전달'
Write-Output "완료: 7개 검사 통과 · PowerShell $($PSVersionTable.PSVersion)"
