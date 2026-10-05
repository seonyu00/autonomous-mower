const NAVER_MAPS_SCRIPT_ID = 'naver-maps-sdk';

let loadPromise: Promise<typeof naver.maps> | null = null;
let authenticationError: Error | null = null;
const authFailureListeners = new Set<(error: Error) => void>();
const authWindow = window as Window & { navermap_authFailure?: () => void };

function handleAuthFailure() {
  const error = new Error('네이버 지도 인증 실패: Client ID, 등록된 Web 서비스 URL 및 Web Dynamic Map 사용 설정을 확인한 뒤 새로고침하세요.');
  authenticationError = error;
  loadPromise = null;
  authFailureListeners.forEach((listener) => listener(error));
}

export function subscribeNaverMapsAuthFailure(listener: (error: Error) => void) {
  authWindow.navermap_authFailure = handleAuthFailure;
  authFailureListeners.add(listener);
  return () => { authFailureListeners.delete(listener); };
}

export function loadNaverMaps(clientId: string): Promise<typeof naver.maps> {
  const normalizedClientId = clientId.trim();

  if (!normalizedClientId) {
    return Promise.reject(new Error('네이버 지도 Client ID가 설정되지 않았습니다.'));
  }

  // SDK 생성과 인증 응답은 별개이므로 인증이 실패한 SDK를 재사용하지 않는다.
  if (authenticationError) {
    return Promise.reject(authenticationError);
  }

  if (window.naver?.maps) {
    return Promise.resolve(window.naver.maps);
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const unsubscribe = subscribeNaverMapsAuthFailure((error) => {
      unsubscribe();
      script.remove();
      reject(error);
    });
    script.id = NAVER_MAPS_SCRIPT_ID;
    script.async = true;
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(normalizedClientId)}`;
    script.onload = () => {
      unsubscribe();
      if (window.naver?.maps) {
        resolve(window.naver.maps);
        return;
      }

      loadPromise = null;
      reject(new Error('네이버 지도 SDK를 초기화하지 못했습니다.'));
    };
    script.onerror = () => {
      unsubscribe();
      loadPromise = null;
      script.remove();
      reject(new Error('네이버 지도 SDK를 불러오지 못했습니다.'));
    };
    document.head.append(script);
  });

  return loadPromise;
}
