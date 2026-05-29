export function isValidLngLat(longitude: number, latitude: number) {
  return longitude >= -180 && longitude <= 180 && latitude >= -90 && latitude <= 90;
}
