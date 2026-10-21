[CmdletBinding()]
param([ValidateSet('Start', 'Stop', 'Status')][string]$Action = 'Status')
$ErrorActionPreference = 'Stop'
if (-not (Get-Command tailscale -ErrorAction SilentlyContinue)) { throw 'Tailscale CLI를 찾을 수 없습니다.' }
$existing = & tailscale serve status --json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Tailscale 접속 경로를 확인하지 못했습니다.' }
if ($Action -eq 'Status') { & tailscale serve status; return }

# 웹의 Funnel 443과 다른 서비스는 유지하고 MQTT 전용 포트만 변경한다.
foreach ($site in $existing.AllowFunnel.PSObject.Properties) {
    if ($site.Name -match ':18883$' -and $site.Value) { throw 'MQTT 포트에 인터넷 공개 설정이 있습니다. 먼저 수동 확인이 필요합니다.' }
}
$handler = $existing.TCP.'18883'
if ($handler -and ($handler.TCPForward -ne '127.0.0.1:18883' -or $handler.HTTPS -or $handler.TerminateTLS)) {
    throw '18883 포트에 다른 서비스 설정이 있어 변경하지 않았습니다.'
}
if ($Action -eq 'Start') {
    $listener = @(Get-NetTCPConnection -State Listen -LocalPort 18883 -ErrorAction SilentlyContinue |
        Where-Object LocalAddress -eq '127.0.0.1')
    if ($listener.Count -ne 1) { throw 'PC 내부의 MQTT TLS 18883 포트가 준비되지 않았습니다.' }
    if (-not $handler) { & tailscale serve --bg --yes --tcp=18883 tcp://127.0.0.1:18883 }
} elseif ($handler) {
    & tailscale serve --bg --yes --tcp=18883 off
}
if ($LASTEXITCODE -ne 0) { throw 'MQTT의 Tailscale 접속 경로 변경에 실패했습니다.' }
$after = & tailscale serve status --json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw '변경 후 Tailscale 접속 경로를 확인하지 못했습니다.' }
if (($Action -eq 'Start' -and $after.TCP.'18883'.TCPForward -ne '127.0.0.1:18883') -or
    ($Action -eq 'Stop' -and $after.TCP.'18883')) { throw 'MQTT 접속 경로가 요청한 상태와 다릅니다.' }
foreach ($site in $after.AllowFunnel.PSObject.Properties) {
    if ($site.Name -match ':18883$' -and $site.Value) { throw 'MQTT의 인터넷 비공개 상태를 확인하지 못했습니다.' }
}
& tailscale serve status
