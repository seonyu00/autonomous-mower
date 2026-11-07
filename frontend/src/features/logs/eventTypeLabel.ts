const telemetryEvents = new Map([
  ['emergency-stop-active', '비상 정지 활성화'],
  ['emergency-stop-recovered', '비상 정지 해제'],
  ['telemetry-delayed', '텔레메트리 수신 지연'],
  ['telemetry-recovered', '텔레메트리 수신 복구'],
]);

export function eventTypeLabel(type: string) {
  return telemetryEvents.get(type) ?? type;
}
