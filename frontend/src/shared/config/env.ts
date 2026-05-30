export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
  wssUrl: import.meta.env.VITE_WSS_URL ?? 'wss://localhost:8443/ws',
  webRtcSignalingUrl: import.meta.env.VITE_WEBRTC_SIGNALING_URL ?? '',
  enableMockRealtime: import.meta.env.VITE_ENABLE_MOCK_REALTIME !== 'false',
  enableMockAuth: import.meta.env.VITE_ENABLE_MOCK_AUTH !== 'false',
  enableMockControl: import.meta.env.VITE_ENABLE_MOCK_CONTROL !== 'false',
  enableMockRobots: import.meta.env.VITE_ENABLE_MOCK_ROBOTS !== 'false',
};
