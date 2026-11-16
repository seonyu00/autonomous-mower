"""비공개 장비 설정으로 두 안테나의 RTK 보정을 실행한다."""

import argparse
import json
import os
from pathlib import Path
import stat


def correction_command(config_path, main_port, auxiliary_port, executable):
    path = Path(config_path)
    if path.stat().st_uid != os.getuid() or stat.S_IMODE(path.stat().st_mode) != 0o600:
        raise ValueError('보정 설정은 실행 사용자 소유의 600 권한 파일이어야 합니다.')
    settings = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(settings, dict):
        raise ValueError('보정 설정 형식이 유효하지 않습니다.')
    url = settings.get('ntripUrl')
    if not isinstance(url, str) or not url.startswith('ntrip://') or any(c.isspace() for c in url):
        raise ValueError('유효한 비공개 NTRIP 설정이 필요합니다.')
    devices = [Path(main_port).resolve(strict=True), Path(auxiliary_port).resolve(strict=True)]
    if devices[0] == devices[1] or any(not d.name.startswith('ttyCH341USB') for d in devices):
        raise ValueError('서로 다른 두 GPS 장치를 확인하세요.')
    return [str(executable), '-in', url,
            '-out', f'serial://{devices[0].name}:115200',
            '-out', f'serial://{devices[1].name}:115200']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, required=True)
    args = parser.parse_args()
    executable = Path.home() / 'RTKLIB/app/str2str/gcc/str2str'
    try:
        command = correction_command(args.config, '/dev/gps_main', '/dev/gps_aux', executable)
    except (OSError, ValueError, TypeError):
        # 인증값이나 원본 예외의 명령 인자를 로그에 출력하지 않는다.
        raise SystemExit('RTK 설정·권한·GPS 장치 확인에 실패했습니다.') from None
    os.execv(str(executable), command)


if __name__ == '__main__':
    main()
