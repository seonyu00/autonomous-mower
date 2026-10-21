import type { Telemetry } from './types';

export function hasUsablePosition(latitude: number | null | undefined, longitude: number | null | undefined) {
  if (latitude == null || longitude == null) {
    return false;
  }

  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    !(latitude === 0 && longitude === 0)
  );
}

export function hasUsableTelemetryPosition(
  telemetry: Telemetry | undefined,
): telemetry is Telemetry & { latitude: number; longitude: number } {
  return telemetry !== undefined && hasUsablePosition(telemetry.latitude, telemetry.longitude);
}
