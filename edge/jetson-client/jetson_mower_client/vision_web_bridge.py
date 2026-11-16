"""웹 다각형을 관측 격자로 만들고 검증된 지도 관측만 전송 형식으로 바꾼다."""

from datetime import datetime, timezone
import math

from shapely.geometry import Point, Polygon, box, mapping


RADIUS_M = 6378137.


def observation_plan(prepared):
    geometry = prepared['zone']['geometry']
    rings = geometry['coordinates']
    polygon = Polygon(rings[0], rings[1:])
    lon0, lat0, lon1, lat1 = polygon.bounds
    if not polygon.is_valid or polygon.is_empty or abs(lat0) > 85 or abs(lat1) > 85:
        raise ValueError('유효한 작업 다각형이 필요합니다.')
    scale = math.cos(math.radians(lat0))
    res = .2
    columns = math.ceil(math.radians(lon1 - lon0) * RADIUS_M * scale / res)
    rows = math.ceil(math.radians(lat1 - lat0) * RADIUS_M / res)
    if rows <= 0 or columns <= 0 or rows * columns > 100_000:
        raise ValueError('20cm 관측 격자의 최대 10만 셀을 초과했습니다.')
    def point(east, north):
        return (lon0 + math.degrees(east / (RADIUS_M * scale)),
                lat0 + math.degrees(north / RADIUS_M))
    grid = []
    for row in range(rows):
        cells = []
        for column in range(columns):
            a = point(column * res, row * res)
            b = point((column + 1) * res, (row + 1) * res)
            # 경계를 걸친 셀과 내부 제외 구역도 관측 누적 대상에서 제외한다.
            cells.append(0 if polygon.covers(box(*a, *b)) else 1)
        grid.append(cells)
    return {'work_zone_version': str(prepared['version']), 'origin': {'lat': lat0, 'lon': lon0},
            'resolution_m': res, 'rows': rows, 'columns': columns, 'grid': grid}


def observation_batch(state, prepared, now_s):
    status = state.get('status', {})
    if (status.get('state') != 'pose_ready' or not status.get('yaw_ready')
            or status.get('heading_source') != 'dual_gps_fixed_baseline'
            or status.get('zoneVersion') != prepared['version']
            or status.get('zoneSha256') != prepared['zoneSha256']
            or not status.get('sessionId')):
        return None
    ages = state.get('sensor_age_s', {})
    if any(not isinstance(ages.get(key), (float, int)) or not 0 <= ages[key] < 3
           for key in ('gps', 'imu', 'odom')):
        return None
    result = state.get('last_map_result') or {}
    capture = result.get('capture_timestamp_ns')
    if (result.get('status') != 'ok' or result.get('work_zone_version') != str(prepared['version'])
            or type(capture) is not int
            or not 0 <= now_s - capture / 1e9 < 3):
        return None
    polygon = Polygon(prepared['zone']['geometry']['coordinates'][0],
                      prepared['zone']['geometry']['coordinates'][1:])
    origin = state['map']['origin']
    def point(p):
        return [origin['lon'] + math.degrees(p['east'] / (RADIUS_M * math.cos(math.radians(origin['lat'])))),
                origin['lat'] + math.degrees(p['north'] / RADIUS_M)]
    observed_at = datetime.fromtimestamp(capture / 1e9, timezone.utc).isoformat()
    observations = []
    objects = result.get('current_observations', [])
    if len(objects) > 20:
        raise ValueError('프레임의 관측 수가 20개를 초과했습니다.')
    for index, obj in enumerate(objects):
        if obj.get('status') != 'localized':
            continue
        label = obj.get('label')
        item = {'observationId': f'{capture}:{index}', 'observedAt': observed_at}
        if label in ('person', 'human'):
            center = obj.get('center_gps') or {}
            lon, lat = center.get('lon'), center.get('lat')
            if not all(isinstance(v, (int, float)) and math.isfinite(v) for v in (lon, lat)):
                continue
            if not polygon.covers(Point(lon, lat)):
                continue
            # 서버가 반경 1m 표시 영역을 만들고 실제 구역으로 절단한다.
            item.update(objectType='PERSON', longitude=lon, latitude=lat)
        elif label in ('tree', 'bush'):
            ring = [point(p) for p in obj.get('region_enu_m', [])]
            if len(ring) < 3:
                continue
            region = Polygon(ring)
            if not region.is_valid:
                continue
            region = region.intersection(polygon)
            if region.is_empty or region.area <= 0:
                continue
            # 한 물체가 오목한 구역에 걸치면 조각별로 별도 관측 ID를 쓴다.
            pieces = [region] if region.geom_type == 'Polygon' else list(region.geoms)
            for piece_index, piece in enumerate(pieces):
                if piece.geom_type != 'Polygon' or piece.area <= 0:
                    continue
                if len(piece.exterior.coords) > 33 or piece.interiors:
                    # 복잡한 절단 결과는 원래 작은 사각형을 전송해 서버에서 정확히 자른다.
                    piece = Polygon(ring)
                candidate = dict(item, observationId=f'{capture}:{index}:{piece_index}',
                                 objectType='TREE_CANDIDATE' if label == 'tree' else 'BUSH_CANDIDATE',
                                 area={'type': 'Polygon', 'srid': 4326, 'geometry': mapping(piece)})
                observations.append(candidate)
            continue
        else:
            continue
        observations.append(item)
    if not observations:
        return None
    if len(observations) > 20:
        raise ValueError('프레임의 전송 관측 수가 20개를 초과했습니다.')
    return {'version': prepared['version'], 'sessionId': status['sessionId'], 'observations': observations}
