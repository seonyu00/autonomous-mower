"""관측·구역 조회·CPP와 별도 지도를 묶는 모터 없는 시험 실행기."""
import argparse
import getpass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib
import json
import os
from pathlib import Path
import queue
import signal
import subprocess
import sys
import tempfile
import threading
import time
from urllib.request import HTTPRedirectHandler, Request, build_opener


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *unused, **kwargs):
        return None


def read_json(path):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return {}


def public_state(zone_state, event, result, received_at):
    return {'zone': zone_state.get('zone'), 'zone_status': zone_state.get('status'),
            'event': event, 'result': result, 'received_at': received_at,
            'generated_at': time.time(), 'dry_run': True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--api-base-url', required=True)
    parser.add_argument('--robot-id', default='MOWER-01')
    parser.add_argument('--team-dir', type=Path, default=Path.home() / 'gps_cpp_web_integration')
    parser.add_argument('--observer-dir', type=Path,
                        default=Path.home() / 'drive_test_observer_stationary.pf9DBA')
    parser.add_argument('--model', type=Path, default=Path.home() /
                        'drive_test_observer_semantic_trial/models/yolo26s-sem-ade20k.onnx')
    parser.add_argument('--port', type=int, default=9877)
    args = parser.parse_args()
    from urllib.parse import urlsplit
    url = urlsplit(args.api_base_url)
    if (url.scheme != 'https' or not url.hostname or url.username or url.password
            or url.query or url.fragment):
        parser.error('인증정보·쿼리가 없는 HTTPS 백엔드 주소가 필요합니다.')
    for path in (args.team_dir / 'web_zone.py', args.team_dir / 'web_cpp.py',
                 args.observer_dir / 'recorder.py', args.model):
        if not path.is_file():
            parser.error(f'필수 파일이 없습니다: {path}')
    sys.path.insert(0, str(args.team_dir.resolve()))
    team = importlib.import_module('web_cpp')
    env = os.environ.copy()
    if not env.get('MOWER_READ_TOKEN'):
        body = json.dumps({'adminId': getpass.getpass('관제 아이디: '),
                           'password': getpass.getpass('관제 비밀번호: ')}).encode()
        request = Request(args.api_base_url.rstrip('/') + '/api/auth/login', data=body,
                          headers={'Content-Type': 'application/json'})
        try:
            with build_opener(NoRedirect()).open(request, timeout=10) as reply:
                env['MOWER_READ_TOKEN'] = json.load(reply)['data']['accessToken']
        except Exception:
            parser.exit(1, '로그인 실패: 서버·계정·권한을 확인하세요.\n')
    parent = Path.home() / 'cpp_trial_runs'
    parent.mkdir(mode=0o700, exist_ok=True)
    run = Path(tempfile.mkdtemp(prefix='trial.', dir=parent))
    state_path = run / 'web_work_zone_state.json'
    latest = {'dry_run': True, 'result': {'status': 'waiting_for_work_zone'}}
    lock = threading.Lock()
    page = Path(__file__).with_name('cpp_trial.html').read_bytes()

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == '/state.json':
                with lock:
                    content = json.dumps(latest, allow_nan=False).encode()
                kind = 'application/json'
            elif self.path == '/':
                content, kind = page, 'text/html; charset=utf-8'
            else:
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header('Content-Type', kind)
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)

        def log_message(self, *unused):
            pass

    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    processes, logs = [], []

    def start(name, command, child_env=env, stdout=None):
        log = (run / f'{name}.log').open('w')
        logs.append(log)
        child = subprocess.Popen(command, env=child_env, stdin=subprocess.DEVNULL,
                                 stdout=log if stdout is None else stdout, stderr=log,
                                 start_new_session=True)
        processes.append(child)
        return child

    print(f'시험 결과: {run}\n시험 지도: http://127.0.0.1:{args.port}\n종료: Ctrl+C', flush=True)
    def interrupted(*unused):
        raise KeyboardInterrupt()

    previous_handlers = {}
    for name in ('SIGTERM', 'SIGHUP'):
        number = getattr(signal, name, None)
        if number is not None:
            previous_handlers[number] = signal.signal(number, interrupted)
    try:
        poller = start('zone', [sys.executable, str(args.team_dir / 'web_zone.py'),
                               args.api_base_url, args.robot_id, '--state', str(state_path)])
        while True:
            state = read_json(state_path)
            zone = team.current_zone(state, time.time_ns() // 1_000_000)
            if zone:
                break
            if poller.poll() is not None:
                raise RuntimeError('구역 조회기가 종료됐습니다. zone.log를 확인하세요.')
            with lock:
                latest.update(zone_status=state.get('status'),
                              result={'status': 'waiting_for_work_zone', 'reason': state.get('reason')})
            time.sleep(.2)
        plan = run / 'work-plan.json'
        plan.write_text(json.dumps(team.work_plan(zone)), encoding='utf-8')
        topic = '/cpp_trial_' + run.name.replace('.', '_') + '/obstacle_snapshot'
        observer_env = env.copy()
        observer_env['PYTHONPATH'] = str(Path.home() / 'mower_semantic_lib') + os.pathsep + env.get('PYTHONPATH', '')
        start('observer', [sys.executable, str(args.observer_dir / 'recorder.py'),
              '--output', str(run / 'observations'), '--semantic-model', str(args.model),
              '--work-plan', str(plan), '--ros-args', '-r', '__node:=cpp_trial_' + run.name.replace('.', '_'),
              '-r', '/fix:=/dual_gps/fix', '-r', '/drive_test/odom:=/dual_gps/odom',
              '-r', '/drive_test/yaw_ready:=/dual_gps/yaw_ready',
              '-r', '/drive_test/obstacle_snapshot:=' + topic], observer_env)
        sensor = start('sensor', [sys.executable, '-m', 'jetson_mower_client.cpp_sensor_input',
                                 '--obstacle-topic', topic], stdout=subprocess.PIPE)
        inbox = queue.Queue(maxsize=1)

        def receive():
            for line in sensor.stdout:
                try:
                    event = json.loads(line)
                except ValueError:
                    continue
                try:
                    inbox.get_nowait()
                except queue.Empty:
                    pass
                inbox.put(event)

        threading.Thread(target=receive, daemon=True).start()
        runner = team.WebCPP()
        event, received = {}, None
        with (run / 'cpp-preview.jsonl').open('w') as output:
            while True:
                if any(p.poll() is not None for p in processes):
                    raise RuntimeError('시험 프로세스가 종료됐습니다. 실행 폴더의 로그를 확인하세요.')
                try:
                    event = inbox.get(timeout=.2)
                    received = time.time()
                except queue.Empty:
                    pass
                state = read_json(state_path)
                if state.get('zone') and state['zone'] != zone:
                    raise RuntimeError('구역이 변경됐습니다. 시험기를 다시 시작해 새 지도를 만드세요.')
                result = runner.update(state, event, time.time_ns() // 1_000_000)
                packet = public_state(state, event, result, received)
                with lock:
                    latest.clear()
                    latest.update(packet)
                output.write(json.dumps(result, allow_nan=False) + '\n')
                output.flush()
    except KeyboardInterrupt:
        pass
    except Exception as error:
        print(str(error), file=sys.stderr)
        return 1
    finally:
        for child in reversed(processes):
            if child.poll() is None:
                try:
                    os.killpg(child.pid, signal.SIGINT)
                except ProcessLookupError:
                    pass
        for child in processes:
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGTERM)
                try:
                    child.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    os.killpg(child.pid, signal.SIGKILL)
                    child.wait()
        for log in logs:
            log.close()
        server.shutdown()
        server.server_close()
        for number, handler in previous_handlers.items():
            signal.signal(number, handler)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
