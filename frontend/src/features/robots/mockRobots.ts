import type { Robot } from './types';

export const mockRobots: Robot[] = [
  {
    id: 'MOWER-01',
    modelName: 'Orin NX Model-A',
    connectionState: 'online',
    active: true,
  },
  {
    id: 'MOWER-02',
    modelName: 'Orin NX Model-A',
    connectionState: 'degraded',
    active: false,
  },
  {
    id: 'MOWER-03',
    modelName: 'Prototype Field Unit',
    connectionState: 'offline',
    active: false,
  },
];
