import { useState } from 'react';
import { visionLabels, visionColors, type VisionMap, type VisionRegion, type VisionState } from '../visionObservations';

export function VisionMapControls({ enabled, onToggle, data, loading, error, available, mapReady, onNextHistory, onLatestHistory }: {
  enabled: boolean; onToggle: (value: boolean) => void; data?: VisionMap;
  loading: boolean; error: boolean; available: boolean; mapReady: boolean;
  onNextHistory?: () => void; onLatestHistory?: () => void;
}) {
  const [history, setHistory] = useState(false);
  const time = (value: string) => new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  const describe = (region: VisionRegion) => `${visionLabels[region.state]} · ${time(region.observedAt)}${region.stale ? ' · 오래된 정보' : ''}`;
  return <details className="cpp-preview-controls" name="map-tools">
    <summary>비전 관측 지도</summary>
    <label><input type="checkbox" checked={enabled} disabled={!available} onChange={event => onToggle(event.target.checked)} />관측 영역 표시</label>
    <p aria-label="비전 분류 범례">{(Object.keys(visionLabels) as VisionState[]).map(state => <span key={state} style={{ display: 'inline-block', marginInlineEnd: '0.75rem' }}><span aria-hidden="true" style={{ color: visionColors[state] }}>■ </span>{visionLabels[state]}</span>)}</p>
    {!available && <p>저장된 작업 구역을 불러오고 편집을 마친 뒤 조회할 수 있습니다.</p>}
    <p>최근 관측을 표시합니다. 5분이 지나면 오래된 정보로 표시하며, 위험 해제나 주행 허가를 뜻하지 않습니다.</p>
    {enabled && <>
      <p role="status">{error ? '관측 정보를 불러오지 못했습니다. 이전 영역 표시는 숨겼습니다.' : loading ? '관측 정보 조회 중…' : !data?.regions.length ? '저장된 비전 관측이 없습니다. 아직 관측하지 않은 영역은 미확인입니다.' : `관측 영역 ${data.regions.length}개`}</p>
      {!mapReady && <p>배경 지도를 사용할 수 없어 지도 위 영역 표시는 대기 중입니다.</p>}
      {!error && data && <>
        <ul aria-label="비전 관측 영역" style={{ maxHeight: '12rem', overflow: 'auto' }}>{data.regions.map((region, index) => <li key={`${region.observationId}-${index}`}>{describe(region)}</li>)}</ul>
        <button type="button" aria-expanded={history} onClick={() => setHistory(!history)}>이전 위험 이력 {data.dangerHistory.length}건</button>
        {history && <>
          <p>최초 수신 후 30일간 보관 · 현재 페이지 {data.dangerHistory.length}건</p>
          <ul aria-label="위험 관측 이력" style={{ maxHeight: '12rem', overflow: 'auto' }}>{data.dangerHistory.map(region => <li key={region.observationId}>{describe(region)} · 구역 버전 {region.version}</li>)}</ul>
          <button type="button" onClick={onLatestHistory}>최신 이력</button>
          <button type="button" disabled={data.nextHistoryCursor == null} onClick={onNextHistory}>이전 이력</button>
        </>}
      </>}
    </>}
    <p>예초 가능 후보와 실제 예초 완료 면적은 다릅니다. 현재 관측은 CPP 계산에 반영하지 않습니다.</p>
  </details>;
}
