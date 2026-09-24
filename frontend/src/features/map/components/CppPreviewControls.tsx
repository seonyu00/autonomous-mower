import { useState } from 'react';
import type { useCppPreview } from '../cppPreview';

export function CppPreviewControls({ preview }: { preview: ReturnType<typeof useCppPreview> }) {
  const [cellSize, setCellSize] = useState(1);
  return <details open className="cpp-preview-controls" aria-label="CPP 예정 경로 미리보기">
    <summary>CPP 예정 경로 · 검토용 미리보기</summary>
    <label>격자 간격(m) <input type="number" min="0.2" max="5" step="0.1" value={cellSize}
      onChange={(event) => setCellSize(event.target.valueAsNumber)} /></label>
    <button type="button" disabled={!preview.available || preview.loading || !Number.isFinite(cellSize)
      || cellSize < 0.2 || cellSize > 5} onClick={() => void preview.generate(cellSize)}>
      {preview.loading ? '생성 중…' : '예정 경로 생성'}
    </button>
    {!preview.available && <p>실제 저장된 구역을 불러오고 편집을 마친 뒤 생성하세요.</p>}
    <p role="status">{preview.message}</p>
    <p>검토용 미리보기 · 주행 명령을 보내지 않습니다. 경로 연결의 경계 통과, 장애물 우회, 기체 폭·회전 반경은 검증하지 않았습니다.</p>
  </details>;
}
