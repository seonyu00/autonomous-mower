# 테스트용 자격 증명만 생성한다. 운영 브로커나 방화벽 설정은 변경하지 않는다.
[CmdletBinding()]
param([string]$OpenSslPath = 'C:\msys64\mingw64\bin\openssl.exe')
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$image = 'eclipse-mosquitto@sha256:a908c65cc8e67ec9d292ef27c2c0360dbaaee7eb1b935cdd194e67697f15dea1'
if (-not (Test-Path -LiteralPath $OpenSslPath)) { throw 'OpenSSL 실행 파일 경로를 확인하세요.' }
Push-Location $repo
try {
    & git check-ignore -q .local-docs/mqtt-security/credentials.json
    if ($LASTEXITCODE -ne 0) { throw '개인 자격 증명 폴더가 Git에서 제외되지 않았습니다.' }
    $runId = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 6)
    $runDir = Join-Path $repo ".local-docs/mqtt-security/$runId"
    New-Item -ItemType Directory -Path $runDir | Out-Null
    if ($IsWindows -or $env:OS -eq 'Windows_NT') {
        # 상위 폴더의 공용 읽기 권한을 인증서·비밀번호 폴더에 상속하지 않는다.
        $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
        & icacls $runDir /inheritance:r /grant:r "${identity}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
        if ($LASTEXITCODE -ne 0) { throw '테스트 비밀 파일의 접근 권한 설정에 실패했습니다.' }
    }
    function Invoke-OpenSsl([string[]]$Arguments) {
        & $OpenSslPath @Arguments 2> (Join-Path $runDir 'openssl.log')
        if ($LASTEXITCODE -ne 0) { throw '테스트 인증서 생성에 실패했습니다. 로컬 openssl.log를 확인하세요.' }
    }
    foreach ($name in @('ca', 'wrong-ca')) {
        Invoke-OpenSsl @('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '2',
            '-subj', "/CN=Mower isolated test $name", '-keyout', (Join-Path $runDir "$name.key"), '-out', (Join-Path $runDir "$name.crt"),
            '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign')
    }
    Invoke-OpenSsl @('req', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-subj', '/CN=localhost',
        '-keyout', (Join-Path $runDir 'server.key'), '-out', (Join-Path $runDir 'server.csr'))
    # IP SAN을 넣지 않아 127.0.0.1 접속의 호스트명 불일치를 검증할 수 있다.
    @('subjectAltName=DNS:localhost', 'extendedKeyUsage=serverAuth', 'keyUsage=digitalSignature,keyEncipherment') |
        Set-Content -LiteralPath (Join-Path $runDir 'server.ext') -Encoding ascii
    Invoke-OpenSsl @('x509', '-req', '-sha256', '-days', '2', '-in', (Join-Path $runDir 'server.csr'),
        '-CA', (Join-Path $runDir 'ca.crt'), '-CAkey', (Join-Path $runDir 'ca.key'), '-CAcreateserial',
        '-extfile', (Join-Path $runDir 'server.ext'), '-out', (Join-Path $runDir 'server.crt'))
    $accounts = [ordered]@{}
    $names = [ordered]@{backend='mower-backend-test'; edge1='edge-SECURITY-TEST-01'; edge2='edge-SECURITY-TEST-02'; observer='security-observer'}
    foreach ($role in $names.Keys) {
        $bytes = New-Object byte[] 24
        $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
        try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
        $accounts[$role] = @{username=$names[$role]; password=[Convert]::ToBase64String($bytes)}
    }
    $accounts.Values | ForEach-Object { $_.username + ':' + $_.password } |
        Set-Content -LiteralPath (Join-Path $runDir 'passwords') -Encoding ascii
    # 비밀번호를 프로세스 인자로 전달하지 않고, 파일 안에서 해시로 변환한다.
    & docker run --rm --network none --mount "type=bind,source=$runDir,target=/work" $image sh -ec 'cp /work/passwords /tmp/passwords; chmod 0700 /tmp/passwords; mosquitto_passwd -U /tmp/passwords; cp /tmp/passwords /work/passwords'
    if ($LASTEXITCODE -ne 0) { throw '테스트 비밀번호 해시 생성에 실패했습니다.' }
    $acl = @('user mower-backend-test')
    foreach ($id in @('SECURITY-TEST-01', 'SECURITY-TEST-02')) {
        foreach ($command in @('manual', 'stop', 'estop', 'mode', 'attachment')) { $acl += "topic write mowers/$id/commands/$command" }
        foreach ($suffix in @('telemetry', 'status', 'events', 'commands/ack')) { $acl += "topic read mowers/$id/$suffix" }
    }
    foreach ($id in @('SECURITY-TEST-01', 'SECURITY-TEST-02')) {
        $acl += "`nuser edge-$id"
        foreach ($command in @('manual', 'stop', 'estop', 'mode', 'attachment')) { $acl += "topic read mowers/$id/commands/$command" }
        foreach ($suffix in @('telemetry', 'status', 'events', 'commands/ack')) { $acl += "topic write mowers/$id/$suffix" }
    }
    $acl += @("`nuser security-observer", 'topic read mowers/#')
    $acl | Set-Content -LiteralPath (Join-Path $runDir 'acl') -Encoding ascii
    $config = [ordered]@{
        brokerUrl='mqtts://localhost:18886'; caCertPath=(Join-Path $runDir 'ca.crt'); wrongCaCertPath=(Join-Path $runDir 'wrong-ca.crt')
        containerName="mower-mqtt-security-$runId"; robotIds=@('SECURITY-TEST-01', 'SECURITY-TEST-02'); accounts=$accounts
    }
    $configPath = Join-Path $runDir 'credentials.json'
    $config | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $configPath -Encoding utf8NoBOM
    Write-Output $configPath
} finally { Pop-Location }
