import { afterEach, describe, expect, it, vi } from 'vitest';

describe('loadNaverMaps', () => {
  afterEach(() => {
    document.getElementById('naver-maps-sdk')?.remove();
    window.naver = undefined as unknown as typeof naver;
    vi.resetModules();
  });

  it('Client ID가 없으면 SDK를 요청하지 않는다', async () => {
    const { loadNaverMaps } = await import('./naverMapsLoader');

    await expect(loadNaverMaps('')).rejects.toThrow('네이버 지도 Client ID');
    expect(document.getElementById('naver-maps-sdk')).toBeNull();
  });

  it('ncpKeyId로 네이버 지도 SDK를 불러온다', async () => {
    const { loadNaverMaps } = await import('./naverMapsLoader');
    const promise = loadNaverMaps('test client');
    const script = document.getElementById('naver-maps-sdk') as HTMLScriptElement;

    expect(script.src).toBe(
      'https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=test%20client',
    );

    window.naver = { maps: {} } as typeof naver;
    script.onload?.(new Event('load'));

    await expect(promise).resolves.toBe(window.naver.maps);
  });

  it('이미 SDK가 준비되어 있으면 script를 추가하지 않는다', async () => {
    window.naver = { maps: {} } as typeof naver;
    const { loadNaverMaps } = await import('./naverMapsLoader');

    await expect(loadNaverMaps('test-client')).resolves.toBe(window.naver.maps);
    expect(document.getElementById('naver-maps-sdk')).toBeNull();
  });
});
