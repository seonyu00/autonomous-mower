import { httpClient } from '../../shared/api/httpClient';
import type { VideoSnapshot } from './types';

type SaveSnapshotResponse = {
  snapshotId: string;
  robotId: string;
  captureType: 'manual';
  capturedAt: string;
  contentType: 'image/jpeg';
  fileSize: number;
  url: string;
};

export async function uploadManualSnapshot(
  robotId: string,
  capturedAt: string,
  jpeg: Blob,
): Promise<VideoSnapshot> {
  const formData = new FormData();
  formData.append('file', jpeg, `${robotId}-${capturedAt.replaceAll(':', '-')}.jpg`);
  formData.append('captureType', 'manual');
  formData.append('capturedAt', capturedAt);

  const response = await httpClient.postForm<SaveSnapshotResponse>(
    `/api/robots/${encodeURIComponent(robotId)}/snapshots`,
    formData,
  );

  return {
    id: response.snapshotId,
    robotId: response.robotId,
    capturedAt: response.capturedAt,
    contentType: response.contentType,
    status: 'saved',
    url: response.url,
  };
}
