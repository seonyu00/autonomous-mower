export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
  wssUrl: import.meta.env.VITE_WSS_URL ?? 'wss://localhost:8443/ws',
  webRtcSignalingUrl: import.meta.env.VITE_WEBRTC_SIGNALING_URL ?? '',
  naverMapClientId: import.meta.env.VITE_NAVER_MAP_CLIENT_ID ?? '',
  enableMockRealtime: import.meta.env.DEV && import.meta.env.VITE_ENABLE_MOCK_REALTIME === 'true',
  enableMockAuth: import.meta.env.DEV && import.meta.env.VITE_ENABLE_MOCK_AUTH === 'true',
  enableMockControl: import.meta.env.DEV && import.meta.env.VITE_ENABLE_MOCK_CONTROL === 'true',
  enableMockRobots: import.meta.env.DEV && import.meta.env.VITE_ENABLE_MOCK_ROBOTS === 'true',
  enableMockVideo: import.meta.env.DEV && import.meta.env.VITE_ENABLE_MOCK_VIDEO === 'true',
  enableMockHistory: import.meta.env.DEV && import.meta.env.VITE_ENABLE_MOCK_HISTORY === 'true',
  enableMockLogs: import.meta.env.DEV && import.meta.env.VITE_ENABLE_MOCK_LOGS === 'true',
  enableMockWorkZone: import.meta.env.DEV && import.meta.env.VITE_ENABLE_MOCK_WORK_ZONE === 'true',
};
