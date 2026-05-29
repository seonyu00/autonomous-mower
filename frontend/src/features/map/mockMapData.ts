import type { Feature, LineString } from 'geojson';
import type { PolygonGeometry } from './geojson';

export const mockRouteByRobotId: Record<string, Feature<LineString>> = {
  'MOWER-01': {
    type: 'Feature',
    properties: {
      robotId: 'MOWER-01',
    },
    geometry: {
      type: 'LineString',
      coordinates: [
        [127.45565, 36.62795],
        [127.45595, 36.62812],
        [127.4562, 36.62828],
        [127.4564, 36.6285],
      ],
    },
  },
  'MOWER-02': {
    type: 'Feature',
    properties: {
      robotId: 'MOWER-02',
    },
    geometry: {
      type: 'LineString',
      coordinates: [
        [127.45515, 36.62765],
        [127.45542, 36.62778],
        [127.4558, 36.6279],
      ],
    },
  },
  'MOWER-03': {
    type: 'Feature',
    properties: {
      robotId: 'MOWER-03',
    },
    geometry: {
      type: 'LineString',
      coordinates: [
        [127.4567, 36.6287],
        [127.45695, 36.6289],
        [127.4572, 36.6291],
      ],
    },
  },
};

export const mockWorkZoneByRobotId: Record<string, Feature<PolygonGeometry>> = {
  'MOWER-01': {
    type: 'Feature',
    properties: {
      robotId: 'MOWER-01',
      editable: false,
    },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [127.45535, 36.62775],
          [127.45685, 36.62795],
          [127.4567, 36.62895],
          [127.4552, 36.62872],
          [127.45535, 36.62775],
        ],
      ],
    },
  },
  'MOWER-02': {
    type: 'Feature',
    properties: {
      robotId: 'MOWER-02',
      editable: false,
    },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [127.4549, 36.62745],
          [127.4561, 36.62755],
          [127.456, 36.62825],
          [127.4548, 36.6281],
          [127.4549, 36.62745],
        ],
      ],
    },
  },
  'MOWER-03': {
    type: 'Feature',
    properties: {
      robotId: 'MOWER-03',
      editable: false,
    },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [127.45645, 36.62845],
          [127.45755, 36.62862],
          [127.45745, 36.62935],
          [127.45632, 36.6292],
          [127.45645, 36.62845],
        ],
      ],
    },
  },
};
