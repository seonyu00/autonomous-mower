[CmdletBinding()]
param([ValidateSet('Start', 'Stop', 'Status')][string]$Action = 'Status')
$ErrorActionPreference = 'Stop'
if (-not (Get-Command tailscale -ErrorAction SilentlyContinue)) { throw 'Tailscale CLI를 찾을 수 없습니다.' }
if ($Action -eq 'Status') { & tailscale funnel status; exit $LASTEXITCODE }

# 다른 용도로 사용 중인 HTTPS 443 설정을 자동으로 덮거나 제거하지 않는다.
$existing = & tailscale funnel status --json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw '기존 Funnel 설정을 확인하지 못했습니다.' }
if ($existing.TCP.'443'.TCPForward) { throw '443 포트가 다른 TCP 서비스에 사용 중입니다.' }
foreach ($site in $existing.Web.PSObject.Properties) {
    if ($site.Name -notmatch ':443$') { continue }
    foreach ($handler in $site.Value.Handlers.PSObject.Properties) {
        if ($handler.Name -ne '/' -or $handler.Value.Proxy -ne 'http://127.0.0.1:8080') {
            throw '443 포트에 다른 웹 서비스 설정이 있습니다. 수동 확인이 필요합니다.'
        }
    }
}
if ($Action -eq 'Stop' -and -not $existing.TCP.'443') {
    & tailscale funnel status
    exit $LASTEXITCODE
}
if ($Action -eq 'Start') {
    $repo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
    $runtime = Get-Content -LiteralPath (Join-Path $repo '.local-docs/pc-demo/runtime.json') -Raw | ConvertFrom-Json
    $processInfo = Get-Content -LiteralPath (Join-Path $runtime.runDirectory 'backend-process.json') -Raw | ConvertFrom-Json
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort 8080 -ErrorAction SilentlyContinue)
    if ($listeners.Count -ne 1 -or $listeners[0].LocalAddress -ne '127.0.0.1' -or
        $listeners[0].OwningProcess -ne $processInfo.pid) {
        throw 'PC 실행기가 시작한 loopback 백엔드인지 확인하지 못했습니다.'
    }
    $health = Invoke-RestMethod 'http://127.0.0.1:8080/actuator/health' -TimeoutSec 5
    if ($health.status -ne 'UP') { throw '백엔드가 준비되지 않았습니다.' }
    & tailscale funnel --bg --yes --https=443 http://127.0.0.1:8080
} else {
    & tailscale funnel --bg --yes --https=443 http://127.0.0.1:8080 off
}
if ($LASTEXITCODE -ne 0) { throw 'Funnel 설정 변경에 실패했습니다.' }
& tailscale funnel status
exit $LASTEXITCODE
