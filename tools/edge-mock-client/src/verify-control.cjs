// 로컬 전용 서버·브로커·DB를 연결해 검사한다. ACK는 소프트웨어로 흉내 낸다.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const mqtt = require('mqtt');
const WebSocket = require('ws');

const base = process.env.CONTROL_TEST_HTTP_URL;
const broker = process.env.CONTROL_TEST_MQTT_URL;
const container = process.env.CONTROL_TEST_DB_CONTAINER;
assert.match(base || '', /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
assert.match(broker || '', /^mqtt:\/\/(127\.0\.0\.1|localhost):\d+$/);
assert.match(container || '', /^mower-control-[a-z0-9-]+$/);
assert.ok(process.env.CONTROL_TEST_ADMIN_ID && process.env.CONTROL_TEST_ADMIN_PASSWORD);
const robot = 'CONTROL-TEST-01', zoneRobot = 'CONTROL-TEST-02';
const run = 'ctl' + Date.now().toString(36);
const accounts = [], messages = [], events = [], locks = [];
let checks = 0, client, socket, admin;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label, timeout = 5000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (check()) { checks++; return; } await sleep(40); }
  throw new Error(label);
}
async function request(path, method, body, token, expected = 200, error) {
  const response = await fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000),
  });
  const result = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${result.error?.code}`);
  if (error) assert.equal(result.error?.code, error);
  checks++; return result.data;
}
const login = (adminId, password) => request('/api/auth/login', 'POST', { adminId, password });
const state = token => request(`/api/control/${robot}`, 'GET', null, token);
const control = (action, body, token, status = 200, error) => request(`/api/control/${robot}/${action}`, 'POST',
  { idempotencyKey: randomUUID(), ...body }, token, status, error);
function database(sql) {
  return execFileSync('docker', ['exec', container, 'psql', '-U', 'mower_pc_test', '-d',
    'mower_control_integration', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' }).trim();
}
function commandRow(id) {
  assert.match(id, /^[a-zA-Z0-9._:-]+$/);
  return JSON.parse(database(`SELECT row_to_json(c) FROM command_execution c WHERE command_id='${id}'`));
}
async function account(suffix, role) {
  const id = `${run}-${suffix}`, password = 'local-control-test-10';
  await request('/api/accounts', 'POST', { adminId: id, role, temporaryPassword: password }, admin, 201);
  accounts.push(id);
  const temporary = await login(id, password);
  await request('/api/auth/password', 'PUT', { currentPassword: password, newPassword: 'local-control-new-10' }, temporary.accessToken);
  return { id, token: (await login(id, 'local-control-new-10')).accessToken };
}
function ack(command, status, overrides = {}, topicRobot = robot) {
  const payload = { commandId: command.commandId, robotId: robot, commandType: command.commandType,
    status, edgeNodeId: 'pc-verification', receivedAt: new Date().toISOString(), ackedAt: new Date().toISOString(), ...overrides };
  return new Promise((resolve, reject) => client.publish(`mowers/${topicRobot}/commands/ack`, JSON.stringify(payload),
    { qos: 1 }, error => error ? reject(error) : resolve()));
}
async function observeCommand(response) {
  await until(() => messages.some(m => m.commandId === response.commandId), '명령 MQTT 수신 실패');
  return messages.find(m => m.commandId === response.commandId);
}
async function event(id, status, timeout = 5000) {
  await until(() => events.some(e => e.commandId === id && e.status === status), `STOMP ${status} 수신 실패`, timeout);
}
async function connect(token) {
  client = mqtt.connect(broker, { reconnectPeriod: 0 });
  await new Promise((resolve, reject) => { client.once('connect', resolve); client.once('error', reject); });
  client.on('message', (topic, data) => {
    if (!topic.endsWith('/ack')) messages.push(JSON.parse(data.toString()));
  });
  await new Promise((resolve, reject) => client.subscribe(`mowers/${robot}/commands/+`, { qos: 1 }, error => error ? reject(error) : resolve()));
  socket = new WebSocket(base.replace('http:', 'ws:') + '/ws');
  let connected = false;
  socket.on('message', data => {
    for (const frame of data.toString().split('\0')) {
      if (frame.startsWith('CONNECTED')) connected = true;
      if (frame.startsWith('MESSAGE')) {
        const split = frame.indexOf('\n\n'), payload = JSON.parse(frame.slice(split + 2));
        if (frame.slice(0, split).includes('/control-events')) events.push(payload);
        if (frame.slice(0, split).includes('/control-lock')) locks.push(payload);
      }
    }
  });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  socket.send(`CONNECT\naccept-version:1.2\nhost:localhost\nAuthorization:Bearer ${token}\n\n\0`);
  await until(() => connected, 'STOMP 인증 연결 실패');
  for (const topic of ['control-events', 'control-lock'])
    socket.send(`SUBSCRIBE\nid:${topic}\ndestination:/topic/robots/${robot}/${topic}\nack:auto\n\n\0`);
  await sleep(150);
}
async function main() {
  admin = (await login(process.env.CONTROL_TEST_ADMIN_ID, process.env.CONTROL_TEST_ADMIN_PASSWORD)).accessToken;
  for (const id of [robot, zoneRobot]) {
    const result = await request(`/api/robots/${id}`, 'GET', null, admin);
    assert.equal(result.id, id);
  }
  assert.equal((await state(admin)).lockState, 'none', '전용 로봇의 제어권을 먼저 반납해야 합니다.');
  await request(`/api/robots/${zoneRobot}/work-zone`, 'GET', null, admin, 404);
  const a = await account('a', 'operator'), b = await account('b', 'operator');
  const supervisor = await account('s', 'supervisor'), viewer = await account('v', 'read-only');
  await connect(admin);
  await control('claim', { requestedMode: 'manual' }, viewer.token, 403);
  const claims = await Promise.all([a, b].map(async user => {
    const response = await fetch(`${base}/api/control/${robot}/claim`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
      body: JSON.stringify({ idempotencyKey: randomUUID(), requestedMode: 'manual' }), signal: AbortSignal.timeout(10000),
    });
    return { user, status: response.status, json: await response.json() };
  }));
  assert.deepEqual(claims.map(c => c.status).sort(), [200, 423]); checks++;
  const owner = claims.find(c => c.status === 200).user, other = owner === a ? b : a;
  assert.equal(claims.find(c => c.status === 423).json.error.code, 'CONTROL_OWNED_BY_OTHER_USER');
  const first = await state(admin);
  assert.equal(first.controlOwner, owner.id);
  await until(() => locks.some(l => l.controlOwner === owner.id), '제어권 STOMP 수신 실패');
  await control('takeover', { reason: 'PC 검증' }, other.token, 403);
  await control('takeover', { reason: 'PC 검증' }, supervisor.token);
  const next = await state(admin);
  assert.equal(next.controlOwner, supervisor.id); assert.ok(next.lockVersion > first.lockVersion);
  const count = messages.length;
  const manual = version => ({ action: 'manual-command', robotId: robot, direction: 'forward', speed: 0.3,
    lockVersion: version, clientSentAt: new Date().toISOString() });
  await control('manual', manual(first.lockVersion), owner.token, 423);
  for (const [action, body] of [
    ['manual', manual(first.lockVersion)], ['release', { lockVersion: first.lockVersion }],
    ['mode', { action: 'change-mode', robotId: robot, mode: 'idle', lockVersion: first.lockVersion }],
    ['attachment', { action: 'mower-attachment', robotId: robot, attachmentAction: 'blade-stop', lockVersion: first.lockVersion }],
    ['stop', { action: 'stop', robotId: robot, direction: 'stop', speed: 0, lockVersion: first.lockVersion }],
  ]) await control(action, body, supervisor.token, 409, 'CONTROL_VERSION_CONFLICT');
  await sleep(150); assert.equal(messages.length, count, '거절한 명령은 MQTT로 나가지 않아야 합니다.'); checks++;

  // ACK가 발행 완료 기록보다 빨리 도착해도 최종 상태를 되돌리면 안 된다.
  const fastHandler = (topic, bytes) => {
    if (topic.endsWith('/ack')) return;
    const command = JSON.parse(bytes.toString());
    if (command.commandType === 'mower-attachment') ack(command, 'completed').catch(error => { console.error(error.message); });
  };
  client.on('message', fastHandler);
  for (let i = 0; i < 12; i++) {
    const response = await control('attachment', { action: 'mower-attachment', robotId: robot,
      attachmentAction: 'blade-stop', lockVersion: next.lockVersion }, supervisor.token);
    await event(response.commandId, 'completed');
    assert.equal(commandRow(response.commandId).status, 'COMPLETED'); checks++;
  }
  client.off('message', fastHandler);
  const send = () => control('attachment', { action: 'mower-attachment', robotId: robot,
    attachmentAction: 'blade-stop', lockVersion: next.lockVersion }, supervisor.token);
  const response = await send(), command = await observeCommand(response);
  await event(response.commandId, 'sent-to-edge');
  await ack(command, 'accepted', { robotId: zoneRobot }, zoneRobot);
  await ack(command, 'unknown');
  await ack({ ...command, commandId: 'unknown-' + randomUUID() }, 'completed');
  await sleep(200); assert.equal(commandRow(response.commandId).status, 'SENT'); checks++;
  await ack(command, 'accepted'); await event(response.commandId, 'edge-ack');
  await sleep(6200); assert.equal(commandRow(response.commandId).status, 'ACKED'); checks++;
  await ack(command, 'executing'); await event(response.commandId, 'executing');
  const before = events.filter(e => e.commandId === response.commandId).length;
  await ack(command, 'accepted'); await ack(command, 'executing');
  await sleep(200); assert.equal(commandRow(response.commandId).status, 'EXECUTING');
  assert.equal(events.filter(e => e.commandId === response.commandId).length, before); checks++;
  await ack(command, 'completed'); await event(response.commandId, 'completed');
  await ack(command, 'failed'); await sleep(150);
  assert.equal(commandRow(response.commandId).status, 'COMPLETED'); checks++;
  const timeout = await send(); await observeCommand(timeout); await event(timeout.commandId, 'edge-timeout', 8000);
  await ack(timeout, 'completed'); await sleep(150);
  assert.equal(commandRow(timeout.commandId).status, 'TIMED_OUT'); assert.ok(commandRow(timeout.commandId).timeout_at); checks++;

  const drive = await control('manual', manual(next.lockVersion), supervisor.token); await observeCommand(drive);
  await until(() => messages.some(m => m.commandType === 'stop' && m.parameters.reason === 'deadman-timeout'), '데드맨 정지 미발행');
  assert.equal(messages.find(m => m.commandType === 'stop' && m.parameters.reason === 'deadman-timeout').parameters.speed, 0);
  await control('estop', { reason: 'PC 검증' }, other.token);
  const emergency = await state(admin); assert.equal(emergency.emergency, true);
  await control('manual', manual(emergency.lockVersion), supervisor.token, 409, 'ROBOT_IN_EMERGENCY');
  await control('reset-after-emergency', { reason: 'PC 검증' }, supervisor.token);
  const reset = await state(admin); assert.equal(reset.mode, 'idle');
  await control('release', { lockVersion: reset.lockVersion }, supervisor.token);

  const polygon = offset => ({ robotId: zoneRobot, zone: { type: 'Polygon', srid: 4326,
    geometry: { type: 'Polygon', coordinates: [[[127.454388 + offset, 36.625869], [127.454687, 36.625853],
      [127.454733, 36.625997], [127.454373, 36.626027], [127.454388 + offset, 36.625869]]] } } });
  async function raceZone(bodies) {
    const results = await Promise.all(bodies.map((body, i) => fetch(`${base}/api/robots/${zoneRobot}/work-zone`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${[a, b][i].token}` },
      body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
    }).then(async res => ({ status: res.status, json: await res.json() }))));
    assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
    assert.equal(results.find(r => r.status === 409).json.error.code, 'WORK_ZONE_CONFLICT'); checks++;
    return results.find(r => r.status === 200).json.data;
  }
  const created = await raceZone([polygon(0), polygon(0.00001)]);
  const updated = await raceZone([0, 0.00001].map(offset => ({ ...polygon(offset), expectedVersion: created.version })));
  assert.equal(updated.version, created.version + 1);
  await request(`/api/robots/${zoneRobot}/work-zone`, 'PUT', polygon(0), a.token, 409, 'WORK_ZONE_CONFLICT');
  assert.equal(Number(database(`SELECT count(*) FROM work_zone WHERE robot_id='${zoneRobot}'`)), 1); checks++;
  console.log(JSON.stringify({ checks, fastAckCommands: 12, mqttCommands: messages.length,
    stompEvents: events.length, result: 'PASS', hardware: '소프트웨어 ACK만 검증함' }));
}
async function cleanup() {
  if (admin) {
    const current = await state(admin);
    if (current.lockState === 'held') {
      await control('takeover', { reason: 'PC 검증 종료' }, admin);
      const held = await state(admin);
      await control('release', { lockVersion: held.lockVersion }, admin);
    }
    for (const id of accounts) {
      const user = await request(`/api/accounts/${id}`, 'GET', null, admin);
      await request(`/api/accounts/${id}`, 'PATCH', { role: user.role, enabled: false, expectedVersion: user.version }, admin);
    }
  }
  socket?.close();
  if (client) await new Promise(resolve => client.end(true, resolve));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(() => cleanup().catch(error => { console.error('검증 환경 정리 실패: ' + error.message); process.exitCode = 1; }));
