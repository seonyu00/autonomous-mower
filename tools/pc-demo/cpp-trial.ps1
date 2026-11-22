[CmdletBinding()]
param(
    [string]$JetsonHost = '100.92.7.56',
    [string]$JetsonUser = 'jangwoo',
    [string]$ApiBaseUrl = 'https://s.tail40a8fd.ts.net',
    [string]$RobotId = 'MOWER-01'
)
$ErrorActionPreference = 'Stop'
$previousInputEncoding = [Console]::InputEncoding
$previousOutputEncoding = [Console]::OutputEncoding
$previousPipeEncoding = $OutputEncoding
$utf8 = [System.Text.UTF8Encoding]::new($false)
$api = [Uri]$ApiBaseUrl
if ($api.Scheme -ne 'https' -or $api.UserInfo -or $api.Query -or $api.Fragment -or
    $api.AbsolutePath -ne '/' -or $RobotId -notmatch '^[A-Za-z0-9_-]+$' -or
    $JetsonHost -notmatch '^[A-Za-z0-9.:-]+$' -or $JetsonUser -notmatch '^[A-Za-z0-9_-]+$') {
    throw '서버·장비·로봇 식별자 형식을 확인하세요.'
}
$plink = 'C:\Program Files\PuTTY\plink.exe'
if (-not (Test-Path -LiteralPath $plink)) { throw 'PuTTY plink가 필요합니다.' }
if (Get-NetTCPConnection -LocalPort 9877 -State Listen -ErrorAction SilentlyContinue) {
    throw 'PC 포트 9877이 이미 사용 중입니다. 기존 시험 창을 종료하세요.'
}
$browserJob = Start-Job -ScriptBlock {
    for ($attempt = 0; $attempt -lt 180; $attempt++) {
        try {
            $reply = Invoke-WebRequest 'http://127.0.0.1:9877/' -UseBasicParsing -TimeoutSec 1
            if ($reply.StatusCode -eq 200) { Start-Process 'http://127.0.0.1:9877/'; return }
        } catch { }
        Start-Sleep -Seconds 1
    }
}
try {
    [Console]::InputEncoding = $utf8
    [Console]::OutputEncoding = $utf8
    $OutputEncoding = $utf8
    Write-Host 'SSH 로그인 뒤 관제 웹 계정으로 로그인합니다. 비밀번호 입력은 화면에 표시되지 않습니다.'
    $remote = 'source /opt/ros/humble/setup.bash; source "$HOME/mower_ws/install/setup.bash"; export PYTHONIOENCODING=utf-8 PYTHONUTF8=1; export PYTHONPATH="$HOME/cpp_sensor_bridge_20261117:${PYTHONPATH:-}"; python3 -m jetson_mower_client.cpp_trial --api-base-url ' + $api.GetLeftPart([UriPartial]::Authority) + ' --robot-id ' + $RobotId
    & $plink -ssh -t -hostkey 'SHA256:Br54mcK/zUkhgNRZZQSXtno21n5odUElZw72HI+Aqcg' `
        -L '9877:127.0.0.1:9877' "$JetsonUser@$JetsonHost" $remote
    if ($LASTEXITCODE -ne 0) { throw '시험기가 종료됐습니다. 터미널의 오류와 Jetson 시험 로그를 확인하세요.' }
} finally {
    [Console]::InputEncoding = $previousInputEncoding
    [Console]::OutputEncoding = $previousOutputEncoding
    $OutputEncoding = $previousPipeEncoding
    Stop-Job $browserJob -ErrorAction SilentlyContinue
    Remove-Job $browserJob -Force -ErrorAction SilentlyContinue
}
