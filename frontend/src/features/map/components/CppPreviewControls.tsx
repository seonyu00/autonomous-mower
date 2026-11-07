import { useState } from 'react';
import type { useCppPreview } from '../cppPreview';
import { CPP_MAX_CELL_SIZE_M } from '../cppPreview';

export function CppPreviewControls({ preview }: { preview: ReturnType<typeof useCppPreview> }) {
  const [cellSize, setCellSize] = useState(0.2);
  return <details className="cpp-preview-controls" name="map-tools" aria-label="CPP 예정 경로 미리보기">
    <summary>CPP 예정 경로 · 검토용 미리보기</summary>
    <label>격자 간격(m) <input type="number" min="0.2" max={CPP_MAX_CELL_SIZE_M} step="0.05" value={cellSize}
      aria-describedby="cpp-mower-spec"
      onChange={(event) => setCellSize(event.target.valueAsNumber)} /></label>
    <button type="button" disabled={!preview.available || preview.loading || !Number.isFinite(cellSize)
      || cellSize < 0.2 || cellSize > CPP_MAX_CELL_SIZE_M} onClick={() => void preview.generate(cellSize)}>
      {preview.loading ? '생성 중…' : '예정 경로 생성'}
    </button>
    {!preview.available && <p>실제 저장된 구역을 불러오고 편집을 마친 뒤 생성하세요.</p>}
    <p role="status">{preview.message}</p>
    <p id="cpp-mower-spec">HD-7000W · 예초 폭 650mm · 차체 길이 1,150mm × 폭 1,030mm 기준입니다. 격자는 0.2~0.65m로 설정하세요.</p>
    <p>검토용 미리보기 · 주행 명령을 보내지 않습니다. 차체 크기를 반영했으며 GPS 오차·장착 위치·추가 안전 여유와 실제 회전·주행은 검증이 필요합니다.</p>
  </details>;
}
