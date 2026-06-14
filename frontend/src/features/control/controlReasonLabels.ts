const reasonLabels: Record<string, string> = {
  'not-authenticated': '로그인이 필요합니다',
  'missing-control-permission': '현재 역할로는 제어할 수 없습니다',
  'robot-not-selected': '제어할 로봇을 먼저 선택하세요',
  'control-lock-not-held': '제어권을 먼저 획득하세요',
  'control-owned-by-other-user': '다른 사용자가 제어 중입니다',
  'realtime-connecting': '실시간 연결을 설정하는 중입니다',
  'realtime-reconnecting': '실시간 연결을 다시 연결하는 중입니다',
  'realtime-degraded': '실시간 연결 상태가 저하되었습니다',
  'realtime-disconnected': '실시간 연결이 끊겼습니다',
  'robot-in-emergency': '로봇이 긴급 정지(E-Stop) 상태입니다',
  'robot-not-in-emergency': '로봇이 긴급 정지(E-Stop) 상태가 아닙니다',
  'transport-not-ready': '명령 전송 준비가 되지 않았습니다',
};

export function formatControlReason(reason: string) {
  return reasonLabels[reason] ?? reason;
}
