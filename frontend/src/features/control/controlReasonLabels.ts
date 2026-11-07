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
  'autonomy-not-configured': '자율주행 실행 프로그램이 연결되지 않았습니다',
  'autonomy-readiness-unknown': '자율주행 준비 상태를 확인할 수 없습니다',
  'autonomy-not-ready': '자율주행 준비가 완료되지 않았습니다',
  'autonomy-already-running': '자율주행 프로그램이 이미 실행 중입니다',
  'autonomy-end-unconfirmed': '이전 작업의 종료 확인이 필요합니다',
  'autonomy-launch-failed': '자율주행 프로그램을 실행하지 못했습니다',
  'autonomy-process-started': '프로그램을 실행했습니다. 실제 주행 시작은 확인 전입니다',
  'autonomy-stop-unconfirmed': '자율주행 프로그램의 종료를 확인하지 못했습니다',
};

export function formatControlReason(reason: string) {
  return reasonLabels[reason] ?? reason;
}
