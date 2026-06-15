const NAVER_MAPS_SCRIPT_ID = 'naver-maps-sdk';

let loadPromise: Promise<typeof naver.maps> | null = null;

export function loadNaverMaps(clientId: string): Promise<typeof naver.maps> {
  const normalizedClientId = clientId.trim();

  if (!normalizedClientId) {
    return Promise.reject(new Error('네이버 지도 Client ID가 설정되지 않았습니다.'));
  }

  if (window.naver?.maps) {
    return Promise.resolve(window.naver.maps);
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = NAVER_MAPS_SCRIPT_ID;
    script.async = true;
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(normalizedClientId)}`;
    script.onload = () => {
      if (window.naver?.maps) {
        resolve(window.naver.maps);
        return;
      }

      loadPromise = null;
      reject(new Error('네이버 지도 SDK를 초기화하지 못했습니다.'));
    };
    script.onerror = () => {
      loadPromise = null;
      script.remove();
      reject(new Error('네이버 지도 SDK를 불러오지 못했습니다.'));
    };
    document.head.append(script);
  });

  return loadPromise;
}
