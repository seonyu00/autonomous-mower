import { afterEach, describe, expect, it, vi } from 'vitest';

const authWindow = window as Window & { navermap_authFailure?: () => void };

describe('loadNaverMaps', () => {
  afterEach(() => {
    document.getElementById('naver-maps-sdk')?.remove();
    window.naver = undefined as unknown as typeof naver;
    delete authWindow.navermap_authFailure;
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

  it('SDK 로딩 중 인증 실패하면 요청을 거부한다', async () => {
    const { loadNaverMaps } = await import('./naverMapsLoader');
    const promise = loadNaverMaps('test-client');
    const rejected = expect(promise).rejects.toThrow('네이버 지도 인증 실패');
    expect(authWindow.navermap_authFailure).toBeTypeOf('function');
    authWindow.navermap_authFailure?.();
    await rejected;
    expect(document.getElementById('naver-maps-sdk')).toBeNull();
  });

  it('로딩 후 인증 실패도 구독자에게 전달하고 준비된 SDK를 성공으로 재사용하지 않는다', async () => {
    const { loadNaverMaps, subscribeNaverMapsAuthFailure } = await import('./naverMapsLoader');
    const listener = vi.fn();
    const unsubscribe = subscribeNaverMapsAuthFailure(listener);
    const promise = loadNaverMaps('test-client');
    const script = document.getElementById('naver-maps-sdk') as HTMLScriptElement;
    window.naver = { maps: {} } as typeof naver;
    script.onload?.(new Event('load'));
    await promise;

    authWindow.navermap_authFailure?.();
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Web 서비스 URL') }));
    await expect(loadNaverMaps('test-client')).rejects.toThrow('네이버 지도 인증 실패');
    unsubscribe();
    authWindow.navermap_authFailure?.();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
