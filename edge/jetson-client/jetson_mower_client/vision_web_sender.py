"""시험 지도 관측을 HTTPS로 전송한다. 실패 시 같은 프레임을 재시도한다."""

import argparse
import json
import os
from pathlib import Path
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlsplit
from urllib.request import Request, build_opener

from .vision_web_bridge import observation_batch
from .web_work_zone import NoRedirect, prepare


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--api-base-url', required=True)
    parser.add_argument('--robot-id', required=True)
    parser.add_argument('--data-dir', type=Path, required=True)
    args = parser.parse_args()
    base = urlsplit(args.api_base_url)
    if (base.scheme != 'https' or not base.hostname or base.username or base.password
            or base.query or base.fragment):
        parser.error('계정 정보·쿼리가 없는 HTTPS 주소가 필요합니다.')
    token = os.environ.get('WORK_ZONE_API_TOKEN', '')
    if not token.strip() or any(c in token for c in '\r\n'):
        parser.error('WORK_ZONE_API_TOKEN이 필요합니다.')
    prepared = json.loads((args.data_dir / 'work-zone.json').read_text(encoding='utf-8'))
    # 파일도 API 응답과 동일한 다각형·로봇·버전 검사 경로를 통과시킨다.
    verified = prepare({'success': True, 'data': prepared}, args.robot_id, prepared['version'])
    if verified['zoneSha256'] != prepared['zoneSha256']:
        parser.error('작업 구역 파일 해시가 다릅니다.')
    pending_path = args.data_dir / 'web-pending.json'
    pending = json.loads(pending_path.read_text()) if pending_path.exists() else None
    if pending is not None and pending.get('version') != prepared['version']:
        parser.error('대기 중인 관측과 현재 작업 구역 버전이 다릅니다.')
    last_sent = None
    opener = build_opener(NoRedirect())
    url = args.api_base_url.rstrip('/') + '/api/robots/' + quote(args.robot_id, safe='') + '/vision-map/observations'
    try:
        while True:
            try:
                if pending is None:
                    state = json.loads((args.data_dir / 'state.json').read_text())
                    pending = observation_batch(state, prepared, time.time())
                    if pending is None:
                        time.sleep(1)
                        continue
                    identity = (pending['sessionId'], pending['observations'][0]['observationId'])
                    if identity == last_sent:
                        pending = None
                        time.sleep(1)
                        continue
                    temp = pending_path.with_suffix('.tmp')
                    temp.write_text(json.dumps(pending, allow_nan=False))
                    temp.replace(pending_path)
                # 재시도에서는 관측 ID와 실제 촬영 시각을 바꾸지 않는다.
                request = Request(url, json.dumps(pending, allow_nan=False).encode(),
                    headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}, method='POST')
                with opener.open(request, timeout=10) as response:
                    receipt = json.loads(response.read(65536))
                if receipt.get('success') is not True:
                    raise ValueError('서버 저장 성공 응답이 아닙니다.')
                last_sent = (pending['sessionId'], pending['observations'][0]['observationId'])
                pending_path.unlink(missing_ok=True)
                print(f"관측 저장 확인: {len(pending['observations'])}개", flush=True)
                pending = None
            except HTTPError as error:
                if 400 <= error.code < 500:
                    raise SystemExit(f'관측 전송 중단: HTTP {error.code}. 인증·구역 버전·입력을 확인하세요. 대기 파일을 보존했습니다.')
                print('서버 오류: 동일 관측 재시도 대기. 대기 중 새 프레임은 전송하지 않습니다.', flush=True)
            except (URLError, TimeoutError, OSError, ValueError) as error:
                print(f'관측 전송 대기: {type(error).__name__}. 모든 프레임의 보관을 보장하지 않습니다.', flush=True)
            time.sleep(1)
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
