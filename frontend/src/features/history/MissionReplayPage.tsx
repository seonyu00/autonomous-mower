import { useEffect, useMemo, useRef, useState } from 'react';
import { readMissionReplay, type MissionReplay } from './missionReplay';

const reasons: Record<string, string> = {
  initial_or_resume: '최초 계획·재개', near_obstacle_or_connector_blocks_route: '장애물이 경로와 겹침',
  deferred_obstacle_route_replan: '보류한 장애물 반영', area_reopened: '작업 영역 재개방',
  input_unavailable: '센서 입력 대기', planning_pending: '경로 계산 중', replanned: '경로 재계획',
  unchanged: '경로 유지', operator_disarmed: '운전자 허용 해제', imu_calibration_wait: 'IMU 보정 대기',
  operator_permit_missing: '운전자 허용 대기', align_heading: '방향 정렬', settling: '자세 안정 대기',
  straight_to_waypoint: '다음 목표점으로 직진', rolling_heading_correction: '주행 중 방향 보정',
  off_route: '경로 이탈', route_exhausted: '경로 소진',
};
const formatTime = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
});
function pointsText(points: number[][]) { return points.map(pair => pair.join(',')).join(' '); }

export function ReplayPlayer({ mission }: { mission: MissionReplay }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const cursor = useRef(0);
  const frames = mission.frames;
  const frame = frames[index];
  const last = frames.length - 1;
  function seek(value: number) {
    setPlaying(false);
    cursor.current = value;
    setIndex(value);
  }
  useEffect(() => {
    if (!playing) return;
    const started = performance.now();
    const base = frames[cursor.current].time;
    const timer = window.setInterval(() => {
      const time = base + performance.now() - started;
      while (cursor.current < last && frames[cursor.current + 1].time <= time) cursor.current++;
      setIndex(cursor.current);
      if (cursor.current === last) setPlaying(false);
    }, 40);
    return () => window.clearInterval(timer);
  }, [frames, last, playing]);

  const viewBox = useMemo(() => {
    const xs = mission.boundary.map(p => p[0]), ys = mission.boundary.map(p => p[1]);
    const width = Math.max(...xs) - Math.min(...xs), height = Math.max(...ys) - Math.min(...ys);
    const pad = Math.max(width, height, 1) * 0.18;
    return [Math.min(...xs) - pad, Math.min(...ys) - pad, width + 2 * pad, height + 2 * pad].join(' ');
  }, [mission]);
  const latestChange = mission.changes.filter(item => item.frame <= index).at(-1);
  return <>
    <div className="replay-heading">
      <h2>작업 구역 {mission.zoneId} <small>버전 {mission.version}</small></h2>
      <span>기록 시각 <b>{formatTime.format(frame.time)}</b> KST</span>
    </div>
    <svg className="replay-map" viewBox={viewBox} role="img" aria-label="작업 구역과 기록 시점의 경로·장애물 지도">
      <polygon points={pointsText(mission.boundary)} fill="#edf3eb" stroke="#59795f" strokeWidth=".10" />
      <g aria-label="장애물 지도" opacity={frame.fresh ? 1 : 0.42}>
        {frame.objects.map(obj => {
          const color = obj.label === 'person' ? '#ae253d' : '#835117';
          return <g key={obj.id} aria-label={`${obj.label} ${obj.id}`} opacity={obj.visible ? 1 : 0.55}>
            <title>{obj.label} · {obj.id} · {obj.visible ? '관측 중' : '지도에 보존'}</title>
            <polygon points={pointsText(obj.safety)} fill="none" stroke={color} strokeDasharray=".16 .12" strokeWidth=".05" />
            <polygon points={pointsText(obj.region)} fill={color} fillOpacity=".32" stroke={color} strokeWidth=".06" />
            {(obj.label === 'person' || obj.region.length < 3) &&
              <circle cx={obj.position[0]} cy={obj.position[1]} r=".16" fill={color} />}
          </g>;
        })}
      </g>
      {frame.path.length > 1 && <polyline aria-label="남은 경로" points={pointsText(frame.path)} fill="none" stroke="#17639b" strokeWidth=".13" />}
      {frame.target && <circle aria-label="다음 목표점" cx={frame.target[0]} cy={frame.target[1]} r=".21" fill="white" stroke="#17639b" strokeWidth=".09" />}
      {frame.pose && <circle aria-label="기록 위치" cx={frame.pose[0]} cy={frame.pose[1]} r=".22" fill="#174b34" stroke="white" strokeWidth=".07" />}
    </svg>
    <p className="replay-key">북쪽 ↑ · 파란 선은 남은 경로, 빈 원은 다음 목표점, 녹색 점은 기체 위치입니다. 장애물 점선은 기록된 안전 영역입니다.</p>
    <div className="replay-controls">
      <button type="button" onClick={() => {
        if (!playing && index === last) { cursor.current = 0; setIndex(0); }
        setPlaying(!playing);
      }}>{playing ? '일시정지' : index === last ? '처음부터 재생' : '재생'}</button>
      <input type="range" aria-label="주행 판단 탐색" aria-valuetext={`${index + 1}번째 판단`}
        min={0} max={last} value={index} onChange={e => seek(Number(e.target.value))} />
      <output>판단 {index + 1} / {frames.length}</output>
    </div>
    <div className="replay-details">
      <label>경로 변경 시점 <select aria-label="경로 변경 시점" value={latestChange?.frame ?? ''}
        onChange={e => seek(e.target.value === '' ? 0 : Number(e.target.value))}>
        <option value="">기록 시작</option>
        {mission.changes.map(change => <option key={change.frame} value={change.frame}>
          v{change.revision} · {reasons[change.reason] ?? change.reason} · {formatTime.format(frames[change.frame].time)}
        </option>)}
      </select></label>
      <dl>
        <div><dt>남은 경로</dt><dd>{frame.path.length ? `v${frame.revision} · ${frame.path.length}점` : '표시할 선 없음'}
          {frame.complete && ' · 현재 지도 기준 경로 완료'}</dd></div>
        <div><dt>주행 판단</dt><dd>{reasons[frame.reason] ?? (frame.reason || '기록 없음')}</dd></div>
        <div><dt>장애물 지도</dt><dd>{frame.fresh ? `${frame.objects.length}개 · 현재 관측 반영`
          : frame.objects.length ? `이전 관측 · 보존 ${frame.objects.length}개` : '유효한 관측 대기'}</dd></div>
      </dl>
    </div>
  </>;
}

export function MissionReplayPage() {
  const [mission, setMission] = useState<MissionReplay | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function load(file: File) {
    pending.current?.abort();
    const request = new AbortController();
    pending.current = request;
    setMission(null); setError(''); setLoading(true);
    try {
      const data = await readMissionReplay(file, request.signal);
      if (!request.signal.aborted) setMission(data);
    } catch (cause) {
      if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : '기록을 읽지 못했습니다.');
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }
  return <main className="mission-replay">
    <h1>CPP 주행 기록 재생</h1>
    <p>인계 ZIP에서 압축을 푼 mission.jsonl을 선택하세요. 파일은 이 브라우저에서만 읽습니다.</p>
    <label className="replay-file">주행 기록 파일 <input type="file" accept=".jsonl" onChange={e => {
      const file = e.target.files?.[0];
      if (file) void load(file);
    }} /></label>
    {loading && <p role="status">경로와 장애물 기록을 읽는 중입니다.</p>}
    {error && <p role="alert">파일을 열 수 없습니다. {error}</p>}
    {mission && <ReplayPlayer mission={mission} />}
  </main>;
}
