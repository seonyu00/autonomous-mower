import type { Feature, LineString } from 'geojson';
import type { PolygonGeometry } from './geojson';
import { DEFAULT_MAP_CENTER, offsetFromDefaultCenter } from './mapDefaults';

export const mockRouteByRobotId: Record<string, Feature<LineString>> = {
  'MOWER-01': {
    type: 'Feature',
    properties: {
      robotId: 'MOWER-01',
    },
    geometry: {
      type: 'LineString',
      coordinates: [
        offsetFromDefaultCenter(-0.00075, -0.00055),
        offsetFromDefaultCenter(-0.00045, -0.00038),
        offsetFromDefaultCenter(-0.0002, -0.00022),
        DEFAULT_MAP_CENTER,
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
          offsetFromDefaultCenter(-0.00105, -0.00075),
          offsetFromDefaultCenter(0.00045, -0.00055),
          offsetFromDefaultCenter(0.0003, 0.00045),
          offsetFromDefaultCenter(-0.0012, 0.00022),
          offsetFromDefaultCenter(-0.00105, -0.00075),
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
