export type LngLat = [longitude: number, latitude: number];

export type PolygonGeometry = {
  type: 'Polygon';
  coordinates: LngLat[][];
};
