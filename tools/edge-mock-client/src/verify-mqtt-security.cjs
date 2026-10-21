const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const mqtt = require('mqtt');
const { mqttTlsOptions } = require('./mqtt-tls.cjs');

function validateConfig(value) {
  let url;
  try { url = new URL(value?.brokerUrl); } catch { throw new Error('brokerUrl 형식이 올바르지 않습니다.'); }
  if (url.protocol !== 'mqtts:' || !['localhost', '127.0.0.1'].includes(url.hostname)
      || url.port !== '18886' || url.username || url.password || url.pathname || url.search || url.hash) {
    throw new Error('brokerUrl은 자격 증명 없는 mqtts://localhost:18886 또는 mqtts://127.0.0.1:18886만 허용합니다.');
  }
  if (!/^mower-mqtt-security-[a-zA-Z0-9_-]+$/.test(value.containerName || '')) {
    throw new Error('containerName은 mower-mqtt-security- 접두사가 필요합니다.');
  }
  if (JSON.stringify(value.robotIds) !== JSON.stringify(['SECURITY-TEST-01', 'SECURITY-TEST-02'])) {
    throw new Error('robotIds는 전용 SECURITY-TEST-01/02만 허용합니다.');
  }
  for (const field of ['caCertPath', 'wrongCaCertPath']) {
    if (typeof value[field] !== 'string' || !value[field].trim()) throw new Error(`${field}가 필요합니다.`);
  }
  for (const role of ['backend', 'edge1', 'edge2', 'observer']) {
    const account = value.accounts?.[role];
    if (typeof account?.username !== 'string' || !account.username || typeof account.password !== 'string' || !account.password) {
      throw new Error('accounts에 backend/edge1/edge2/observer 자격 증명이 필요합니다.');
    }
  }
  return value;
}

function loadConfig(environment = process.env) {
  if (!environment.MQTT_SECURITY_CONFIG) throw new Error('MQTT_SECURITY_CONFIG JSON 파일 경로가 필요합니다.');
  let value;
  try { value = JSON.parse(fs.readFileSync(environment.MQTT_SECURITY_CONFIG, 'utf8')); }
  catch { throw new Error('MQTT_SECURITY_CONFIG JSON 파일을 읽을 수 없습니다.'); }
  return validateConfig(value);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function run(config) {
  // 모든 설정과 CA를 읽은 뒤에만 네트워크 연결을 시작한다.
  const tls = mqttTlsOptions(config.brokerUrl, config.caCertPath);
  const wrongTls = mqttTlsOptions(config.brokerUrl, config.wrongCaCertPath);
  const runId = randomUUID().slice(0, 8);
  const clients = [];
  const results = [];
  const pass = name => { results.push(name); console.log(`PASS ${name}`); };

  function connect(role, overrides = {}) {
    return new Promise((resolve, reject) => {
      const client = mqtt.connect(overrides.brokerUrl || config.brokerUrl, {
        ...tls, ...config.accounts[role], protocolVersion: 4,
        clientId: `mqtt-security-${runId}-${role}-${clients.length}`,
        clean: true, reconnectPeriod: 0, connectTimeout: 4000,
        ...overrides.options
      });
      clients.push(client);
      client.messages = [];
      client.on('message', (topic, payload, packet) => client.messages.push({ topic, marker: payload.toString(), qos: packet.qos }));
      client.on('error', () => {});
      const timer = setTimeout(() => { client.end(true); reject(new Error('연결 시간 초과')); }, 5000);
      client.once('connect', () => { clearTimeout(timer); resolve(client); });
      client.once('error', error => { clearTimeout(timer); client.end(true); reject(error); });
    });
  }

  async function rejected(name, overrides, acceptedCodes) {
    try { await connect('backend', overrides); }
    catch (error) {
      assert.ok(acceptedCodes.includes(error.code), `${name}: 예상한 인증/TLS 거부가 아님`);
      pass(name);
      return;
    }
    throw new Error(`${name}: 연결이 허용됨`);
  }

  function subscribe(client, topic, qos = 1) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('구독 응답 시간 초과')), 4000);
      client.subscribe(topic, { qos }, (error, grants) => {
        clearTimeout(timer);
        if (error) reject(new Error('구독 요청 실패'));
        else resolve(grants);
      });
    });
  }

  function publish(client, topic, marker, qos = 1) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('발행 응답 시간 초과')), 4000);
      client.publish(topic, marker, { qos, retain: false }, error => {
        clearTimeout(timer);
        if (error) reject(new Error('발행 요청 실패'));
        else resolve();
      });
    });
  }

  async function received(client, topic, marker, qos) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const message = client.messages.find(item => item.topic === topic && item.marker === marker);
      if (message) { assert.equal(message.qos, qos, '수신 QoS 불일치'); return; }
      await sleep(50);
    }
    throw new Error(`허용 토픽 수신 실패: ${topic}`);
  }

  async function delivered(sender, receiver, topic, qos) {
    const marker = `allowed-${randomUUID()}`;
    await publish(sender, topic, marker, qos);
    await received(receiver, topic, marker, qos);
  }

  function brokerLogs() {
    let logs;
    try { logs = execFileSync('docker', ['logs', config.containerName], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000 }); }
    catch { throw new Error('격리 브로커의 Docker 거부 로그를 읽을 수 없습니다.'); }
    return logs;
  }

  function denialLog(client, topic) {
    return deniedPublishEvidence(brokerLogs(), client.options.clientId, topic);
  }

  async function deniedPublish(name, sender, observer, topic, positive) {
    await positive();
    const marker = `denied-${randomUUID()}`;
    // MQTT 3.1.1 PUBACK 성공은 ACL 허용의 증거가 아니다.
    await publish(sender, topic, marker);
    await sleep(450);
    assert.ok(!observer.messages.some(item => item.marker === marker), `${name}: 차단할 발행이 전달됨`);
    assert.ok(denialLog(sender, topic), `${name}: 브로커 거부 로그 없음`);
    await positive();
    pass(name);
  }

  try {
    const backend = await connect('backend');
    const edges = [await connect('edge1'), await connect('edge2')];
    const observer = await connect('observer');
    await subscribe(observer, 'mowers/#');
    pass('정상 계정 4개 TLS 접속');
    await rejected('익명 접속 거부', { options: { username: undefined, password: undefined } }, [4, 5]);
    await rejected('잘못된 비밀번호 거부', { options: { password: randomUUID() } }, [4, 5]);
    await rejected('신뢰하지 않는 CA 거부', { options: wrongTls }, ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'CERT_SIGNATURE_FAILURE']);
    await rejected('호스트명 불일치 거부', { brokerUrl: 'mqtts://127.0.0.1:18886' }, ['ERR_TLS_CERT_ALTNAME_INVALID']);

    for (let index = 0; index < edges.length; index++) {
      const robotId = config.robotIds[index];
      for (const command of ['manual', 'stop', 'estop', 'mode', 'attachment']) {
        const topic = `mowers/${robotId}/commands/${command}`;
        const qos = command === 'manual' ? 0 : 1;
        await subscribe(edges[index], topic, qos);
        await delivered(backend, edges[index], topic, qos);
        pass(`backend → ${robotId} ${command} QoS ${qos}`);
      }
      for (const suffix of ['telemetry', 'status', 'events', 'commands/ack']) {
        const topic = `mowers/${robotId}/${suffix}`;
        await subscribe(backend, topic);
        await delivered(edges[index], backend, topic, 1);
        pass(`${robotId} → backend ${suffix} QoS 1`);
      }
    }

    for (let index = 0; index < edges.length; index++) {
      const edge = edges[index];
      const ownId = config.robotIds[index];
      const otherIndex = 1 - index;
      const otherId = config.robotIds[otherIndex];
      const ownStatus = () => delivered(edge, observer, `mowers/${ownId}/status`, 1);
      await deniedPublish(`${ownId} 다른 로봇 상태 발행 거부`, edge, observer, `mowers/${otherId}/status`, ownStatus);
      await deniedPublish(`${ownId} 명령 발행 거부`, edge, observer, `mowers/${ownId}/commands/stop`, ownStatus);
      const forbiddenTopic = `mowers/${otherId}/commands/stop`;
      const ownCommand = () => delivered(backend, edge, `mowers/${ownId}/commands/stop`, 1);
      await ownCommand();
      await subscribe(edge, forbiddenTopic);
      const marker = `denied-subscribe-${randomUUID()}`;
      await publish(backend, forbiddenTopic, marker);
      await received(edges[otherIndex], forbiddenTopic, marker, 1);
      await received(observer, forbiddenTopic, marker, 1);
      await sleep(450);
      assert.ok(!edge.messages.some(item => item.marker === marker), '다른 로봇 명령이 전달됨');
      // acl_file의 read 권한은 SUBACK 뒤 전달 시점에 적용된다. SUBACK 거부를 주장하지 않는다.
      assert.ok(readAclEvidence(brokerLogs(), edge.options.clientId, forbiddenTopic), '다른 로봇 명령의 구독 감사·미송신 로그 근거 없음');
      await ownCommand();
      pass(`${ownId} 다른 로봇 명령 전달 차단 (read ACL; SUBACK 거부 로그 미제공)`);
    }
    const backendPositive = () => delivered(backend, edges[0], `mowers/${config.robotIds[0]}/commands/stop`, 1);
    for (const robotId of config.robotIds) {
      for (const suffix of ['telemetry', 'commands/ack']) {
        await deniedPublish(`backend ${robotId} ${suffix} 발행 거부`, backend, observer, `mowers/${robotId}/${suffix}`, backendPositive);
      }
    }
    await deniedPublish('observer 쓰기 거부', observer, backend, `mowers/${config.robotIds[0]}/telemetry`,
      () => delivered(edges[0], observer, `mowers/${config.robotIds[0]}/telemetry`, 1));
    console.log(`완료: ${results.length}개 실제 브로커 검사 통과. Java/Python·실장비·운영 TLS는 별도 검증 대상입니다.`);
  } finally {
    await Promise.all(clients.filter(client => !client.disconnected).map(client => new Promise(resolve => client.end(true, {}, resolve))));
  }
}

if (require.main === module) {
  let config;
  try { config = loadConfig(); }
  catch (error) {
    console.error(`FAIL ${error.message}`);
    process.exitCode = 1;
  }
  if (config) run(config).catch(error => {
    // MQTT 라이브러리 예외에는 사용자 입력이 섞일 수 있으므로 원문을 출력하지 않는다.
    const safe = error.name === 'AssertionError' || /^[가-힣]/.test(error.message)
      ? error.message.split('\n')[0] : error.code || '브로커 검사 실패';
    console.error(`FAIL ${safe}`);
    process.exitCode = 1;
  });
}
function readAclEvidence(logs, clientId, topic) {
  const lines = logs.split(/\r?\n/);
  const subscribed = lines.some(line => line.includes(`${clientId} 1 ${topic}`));
  const sent = lines.some(line => line.includes(`Sending PUBLISH to ${clientId} `) && line.includes(`'${topic}'`));
  return subscribed && !sent;
}
function deniedPublishEvidence(logs, clientId, topic) {
  return logs.split(/\r?\n/).some(line => {
    const match = line.match(/^\d+: Denied PUBLISH from (\S+) \(d[01], q[012], r[01], m\d+, '([^']+)', \.\.\. \(\d+ bytes\)\)$/);
    return match !== null && match[1] === clientId && match[2] === topic;
  });
}
module.exports = { validateConfig, loadConfig, readAclEvidence, deniedPublishEvidence };
