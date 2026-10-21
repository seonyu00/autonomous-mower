const test = require('node:test');
const assert = require('node:assert/strict');
const { validateConfig, loadConfig, readAclEvidence, deniedPublishEvidence } = require('./verify-mqtt-security.cjs');

function config() {
  return {
    brokerUrl: 'mqtts://localhost:18886',
    caCertPath: 'ca.pem', wrongCaCertPath: 'wrong-ca.pem',
    containerName: 'mower-mqtt-security-unit',
    robotIds: ['SECURITY-TEST-01', 'SECURITY-TEST-02'],
    accounts: Object.fromEntries(['backend', 'edge1', 'edge2', 'observer'].map(role => [role, { username: role, password: 'unit-only' }]))
  };
}

test('설정 파일 환경변수가 없으면 연결 전에 실패한다', () => {
  assert.throws(() => loadConfig({}), /MQTT_SECURITY_CONFIG/);
});

test('격리된 TLS loopback 포트와 테스트 로봇만 허용한다', () => {
  assert.equal(validateConfig(config()).brokerUrl, 'mqtts://localhost:18886');
  for (const brokerUrl of ['mqtt://localhost:18886', 'mqtts://example.com:18886', 'mqtts://localhost:8883', 'mqtts://u:p@localhost:18886', 'mqtts://localhost:18886/path', 'mqtts://localhost:18886?x=1', 'not-a-url']) {
    assert.throws(() => validateConfig({ ...config(), brokerUrl }), /brokerUrl/);
  }
  assert.throws(() => validateConfig({ ...config(), robotIds: ['MOWER-01', 'SECURITY-TEST-02'] }), /robotIds/);
  assert.throws(() => validateConfig({ ...config(), containerName: 'production' }), /containerName/);
});

test('계정과 두 CA 경로가 불완전하면 연결 전에 실패한다', () => {
  for (const field of ['caCertPath', 'wrongCaCertPath', 'accounts']) {
    assert.throws(() => validateConfig({ ...config(), [field]: undefined }));
  }
  const value = config();
  value.accounts.edge1.password = '';
  assert.throws(() => validateConfig(value), /accounts/);
});

test('읽기 ACL 로그는 구독 시도와 해당 연결에 미송신한 근거를 요구한다', () => {
  const topic = 'mowers/SECURITY-TEST-02/commands/stop';
  const logs = `1: mqtt-security-unit-edge1 1 ${topic}\n1: Sending PUBLISH to mqtt-security-unit-edge2 (d0, q1, r0, m1, '${topic}', ... (50 bytes))`;
  assert.equal(readAclEvidence(logs, 'mqtt-security-unit-edge1', topic), true);
  assert.equal(readAclEvidence('', 'mqtt-security-unit-edge1', topic), false);
  assert.equal(readAclEvidence(`${logs}\n1: Sending PUBLISH to mqtt-security-unit-edge1 (d0, q1, r0, m1, '${topic}', ... (50 bytes))`, 'mqtt-security-unit-edge1', topic), false);
});

test('발행 거부 근거는 정확한 Denied PUBLISH의 client ID와 토픽만 인정한다', () => {
  const clientId = 'mqtt-security-unit-edge1';
  const topic = 'mowers/SECURITY-TEST-02/status';
  const log = `1792345167: Denied PUBLISH from ${clientId} (d0, q1, r0, m30527, '${topic}', ... (43 bytes))`;
  assert.equal(deniedPublishEvidence(log, clientId, topic), true);
  for (const other of [
    log.replace('Denied PUBLISH', 'Denied SUBSCRIBE'),
    log.replace(clientId, `${clientId}-other`),
    log.replace(clientId, `other-${clientId}`),
    log.replace(topic, `${topic}/extra`),
    log.replace(topic, `other/${topic}`),
    log.replace('Denied PUBLISH', 'Received PUBLISH')
  ]) assert.equal(deniedPublishEvidence(other, clientId, topic), false);
});
