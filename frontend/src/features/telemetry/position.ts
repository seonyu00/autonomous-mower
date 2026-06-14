export function hasUsablePosition(latitude: number | undefined, longitude: number | undefined) {
  if (latitude === undefined || longitude === undefined) {
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
