"""GGA 위치와 같은 측정 시각의 RMC 날짜를 결합한다."""

from datetime import datetime, timezone
import math

from .dual_gps_heading import AntennaFix


def fields(sentence):
    body, checksum = sentence.strip().removeprefix('$').split('*')
    value = 0
    for char in body:
        value ^= ord(char)
    if not sentence.startswith('$') or len(checksum) != 2 or value != int(checksum, 16):
        raise ValueError('NMEA 체크섬 오류')
    return body.split(',')


def utc_seconds(value):
    if len(value) < 6:
        raise ValueError('측정 시각 누락')
    hour, minute, second = int(value[:2]), int(value[2:4]), float(value[4:])
    if not (0 <= hour < 24 and 0 <= minute < 60 and 0 <= second < 60):
        raise ValueError('측정 시각 범위 오류')
    return hour * 3600 + minute * 60 + second


def coordinate(value, hemisphere, degrees):
    minutes = float(value[degrees:])
    if not 0 <= minutes < 60:
        raise ValueError('위경도 분 범위 오류')
    result = int(value[:degrees]) + minutes / 60
    if hemisphere not in ('N', 'S', 'E', 'W'):
        raise ValueError('위경도 방향 누락')
    return -result if hemisphere in ('S', 'W') else result


class NmeaEpochs:
    def __init__(self):
        self.gga = {}
        self.rmc = {}
        self.last_emitted = -math.inf

    def add(self, sentence, received_monotonic_s, now_unix_s):
        parts = fields(sentence)
        kind = parts[0][-3:]
        if kind not in ('GGA', 'RMC'):
            return None
        epoch = utc_seconds(parts[1])
        if kind == 'GGA':
            self.gga[epoch] = (parts, received_monotonic_s, sentence)
        else:
            if parts[2] != 'A':
                raise ValueError('RMC 위치 무효')
            day = datetime.strptime(parts[9], '%d%m%y').replace(tzinfo=timezone.utc)
            self.rmc[epoch] = day.timestamp() + epoch
        # 두 문장이 어떤 순서로 도착해도 같은 측정 시각끼리만 결합한다.
        while len(self.gga) > 8:
            del self.gga[next(iter(self.gga))]
        while len(self.rmc) > 8:
            del self.rmc[next(iter(self.rmc))]
        if epoch not in self.gga or epoch not in self.rmc:
            return None
        measured = self.rmc.pop(epoch)
        gga, received, raw = self.gga.pop(epoch)
        if measured <= self.last_emitted:
            return None
        if not 0 <= now_unix_s - measured < 3:
            raise ValueError('측정 만료 또는 GPS와 장비 시각 불일치')
        fix = AntennaFix(measured, received,
                         coordinate(gga[2], gga[3], 2),
                         coordinate(gga[4], gga[5], 3), int(gga[6]))
        self.last_emitted = measured
        return fix, raw
