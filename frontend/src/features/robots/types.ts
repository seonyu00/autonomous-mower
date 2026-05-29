export type RobotConnectionState = 'online' | 'degraded' | 'offline';

export type Robot = {
  id: string;
  modelName: string;
  connectionState: RobotConnectionState;
  active: boolean;
};
