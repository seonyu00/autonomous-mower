import { describe, expect, it, vi } from 'vitest';
import { captureVideoFrame } from './captureVideoFrame';

describe('captureVideoFrame', () => {
  it('captures the current video frame as a JPEG blob', async () => {
    const drawImage = vi.fn();
    const blob = new Blob(['jpeg'], { type: 'image/jpeg' });
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage }),
      toBlob: (callback: BlobCallback, type?: string) => {
        expect(type).toBe('image/jpeg');
        callback(blob);
      },
    } as unknown as HTMLCanvasElement;
    const video = {
      videoWidth: 640,
      videoHeight: 480,
    } as HTMLVideoElement;

    const result = await captureVideoFrame(video, () => canvas);

    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(480);
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 640, 480);
    expect(result).toBe(blob);
  });

  it('rejects capture before a frame is available', async () => {
    const video = {
      videoWidth: 0,
      videoHeight: 0,
    } as HTMLVideoElement;

    await expect(captureVideoFrame(video)).rejects.toThrow('캡처할 영상 프레임이 없습니다.');
  });
});
