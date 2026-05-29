export const stompTopics = {
  telemetry: (robotId: string) => `/topic/robots/${robotId}/telemetry`,
  status: (robotId: string) => `/topic/robots/${robotId}/status`,
  events: (robotId: string) => `/topic/robots/${robotId}/events`,
  controlLock: (robotId: string) => `/topic/robots/${robotId}/control-lock`,
};
