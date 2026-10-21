const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { mqttTlsOptions } = require('./mqtt-tls.cjs');

test('기본 평문 개발 연결에는 TLS 옵션을 추가하지 않는다', () => {
  assert.deepEqual(mqttTlsOptions('mqtt://localhost:1883'), {});
});

test('CA가 있으면 평문 연결을 거부한다', () => {
  assert.throws(() => mqttTlsOptions('mqtt://localhost:1883', 'unused.pem'), /mqtts/);
});

test('TLS는 기본 인증서 및 호스트명 검증과 TLS 1.2 하한을 유지한다', () => {
  const options = mqttTlsOptions('mqtts://localhost:18886');
  assert.equal(options.minVersion, 'TLSv1.2');
  assert.equal(options.rejectUnauthorized, true);
  assert.equal(options.checkServerIdentity, undefined);
});

test('명시한 애플리케이션 CA만 읽고 존재하지 않는 파일은 실패한다', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mower-ca-test-'));
  try {
    const filename = path.join(directory, 'ca.pem');
    fs.writeFileSync(filename, 'test CA bytes');
    assert.deepEqual(mqttTlsOptions('mqtts://localhost:18886', filename).ca, Buffer.from('test CA bytes'));
    assert.throws(() => mqttTlsOptions('mqtts://localhost:18886', path.join(directory, 'missing')), /CA/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
